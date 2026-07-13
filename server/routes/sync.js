const express = require('express')
const router = express.Router()
const axios = require('axios')
const { getDb } = require('../db/init')
const { requireAuth } = require('../middleware/requireAuth')
const { generateUUID } = require('../utils/uid')

const CAP_URL = (process.env.CAP_API_URL || 'http://localhost:3001').trim()
const PAYLOAD_SECRET = (process.env.LICENSE_PAYLOAD_SECRET || 'scoladesk-v1-secret-change-in-production').trim()

// Full-snapshot sync, in upload order. Hardcoded whitelist — table names are
// NEVER interpolated from client input, only from this array.
const SYNC_TABLES = [
  { name: 'school_config', pageSize: 500 },
  { name: 'license_state', pageSize: 500 },
  { name: 'app_settings', pageSize: 500 },
  { name: 'academic_years', pageSize: 500 },
  { name: 'levels', pageSize: 500 },
  { name: 'series', pageSize: 500 },
  { name: 'exam_passing_rules', pageSize: 500 },
  { name: 'subjects', pageSize: 500 },
  { name: 'level_subjects', pageSize: 500 },
  { name: 'classrooms', pageSize: 500 },
  { name: 'classroom_teachers', pageSize: 500 },
  { name: 'teachers', pageSize: 500 },
  { name: 'teacher_schedule', pageSize: 500 },
  { name: 'students', pageSize: 500 },
  { name: 'guardians', pageSize: 500 },
  { name: 'enrollments', pageSize: 500 },
  { name: 'assessment_templates', pageSize: 500 },
  { name: 'assessment_scores', pageSize: 200 },
  { name: 'subject_averages', pageSize: 500 },
  { name: 'semester_summaries', pageSize: 500 },
  { name: 'semester_decisions', pageSize: 500 },
  { name: 'national_exam_results', pageSize: 500 },
  { name: 'timetable_entries', pageSize: 500 },
  { name: 'teacher_daily_log', pageSize: 500 },
  { name: 'fee_types', pageSize: 500 },
  { name: 'fee_type_amounts', pageSize: 500 },
  { name: 'student_fee_selections', pageSize: 500 },
  { name: 'payments', pageSize: 500 },
  { name: 'payment_allocations', pageSize: 500 },
  { name: 'salary_payments', pageSize: 500 },
  { name: 'salary_entries', pageSize: 500 },
  { name: 'expenses', pageSize: 500 },
  { name: 'expense_categories', pageSize: 500 },
  { name: 'other_revenues', pageSize: 500 },
  { name: 'revenue_categories', pageSize: 500 },
  { name: 'ledger_transactions', pageSize: 500 },
  // 50/page (not 200): each row embeds a full bulletin JSON (~10-30KB) --
  // 200/page could exceed Vercel's ~4.5MB request body limit at scale.
  { name: 'report_card_snapshots', pageSize: 50 },
  { name: 'promotion_runs', pageSize: 500 },
  { name: 'promotion_details', pageSize: 500 },
]

const TABLE_LABELS = {
  school_config: 'Configuration école',
  license_state: 'Licence',
  app_settings: 'Paramètres',
  academic_years: 'Années académiques',
  levels: 'Niveaux',
  series: 'Séries',
  exam_passing_rules: 'Règles de passage examens',
  subjects: 'Matières',
  level_subjects: 'Matières par niveau',
  classrooms: 'Classes',
  classroom_teachers: 'Enseignants par classe',
  teachers: 'Enseignants',
  teacher_schedule: 'Affectations enseignants',
  students: 'Élèves',
  guardians: 'Tuteurs',
  enrollments: 'Inscriptions',
  assessment_templates: "Modèles d'évaluation",
  assessment_scores: 'Notes',
  subject_averages: 'Moyennes par matière',
  semester_summaries: 'Résumés de période',
  semester_decisions: 'Décisions de conseil',
  national_exam_results: 'Résultats examens nationaux',
  timetable_entries: 'Emploi du temps',
  teacher_daily_log: 'Présences enseignants',
  fee_types: 'Types de frais',
  fee_type_amounts: 'Montants des frais',
  student_fee_selections: 'Frais élèves',
  payments: 'Paiements',
  payment_allocations: 'Répartition des paiements',
  salary_payments: 'Paiements de salaires',
  salary_entries: 'Salaires (ancien modèle)',
  expenses: 'Dépenses',
  expense_categories: 'Catégories de dépenses',
  other_revenues: 'Autres revenus',
  revenue_categories: 'Catégories de revenus',
  ledger_transactions: 'Grand livre',
  report_card_snapshots: 'Bulletins générés',
  promotion_runs: 'Promotions',
  promotion_details: 'Détails de promotion',
}

// Single school PC, one sync at a time.
let running = null // { syncUid, currentTask, totalTasks, currentLabel, error }

function buildTaskList(db) {
  const tasks = []
  for (const { name, pageSize } of SYNC_TABLES) {
    const total = db.prepare(`SELECT COUNT(*) as cnt FROM ${name}`).get().cnt
    const pageCount = Math.ceil(total / pageSize)
    for (let page = 0; page < pageCount; page++) {
      const label = TABLE_LABELS[name] || name
      tasks.push({
        table: name,
        page,
        offset: page * pageSize,
        limit: pageSize,
        label: pageCount > 1 ? `${label} (${page + 1}/${pageCount})` : label,
      })
    }
  }
  return tasks
}

async function postToCap(body) {
  return axios.post(`${CAP_URL}/api/sync`, body, {
    headers: { 'X-ScolaDesk-Secret': PAYLOAD_SECRET },
  })
}

async function runSync(syncUid) {
  const db = getDb()
  const license = db.prepare('SELECT school_id, hardware_fingerprint FROM license_state LIMIT 1').get()

  if (!license?.school_id || !license?.hardware_fingerprint) {
    db.prepare("UPDATE sync_log SET status = 'partial', error_message = ? WHERE sync_uid = ?")
      .run('Licence non activée', syncUid)
    running = null
    return
  }

  try {
    const tasks = buildTaskList(db)
    running.totalTasks = tasks.length
    db.prepare('UPDATE sync_log SET total_chunks = ? WHERE sync_uid = ?').run(tasks.length, syncUid)

    const syncLogRow = db.prepare('SELECT checkpoint, records_sent FROM sync_log WHERE sync_uid = ?').get(syncUid)
    let recordsSent = syncLogRow?.records_sent || 0

    for (let i = syncLogRow?.checkpoint || 0; i < tasks.length; i++) {
      const task = tasks[i]
      running.currentTask = i
      running.currentLabel = task.label

      // ORDER BY rowid: without it SQLite guarantees no stable order across
      // pages -- a row inserted mid-sync (secretary on the LAN, while the
      // admin syncs) could silently duplicate or skip rows at page borders.
      const rows = db.prepare(`SELECT * FROM ${task.table} ORDER BY rowid LIMIT ? OFFSET ?`).all(task.limit, task.offset)

      await postToCap({
        action: 'chunk',
        school_id: license.school_id,
        hardware_fingerprint: license.hardware_fingerprint,
        sync_uid: syncUid,
        sync_type: 'full',
        chunk_index: i,
        total_chunks: tasks.length,
        table_name: task.table,
        page: task.page,
        rows,
      })

      recordsSent += rows.length
      db.prepare('UPDATE sync_log SET checkpoint = ?, records_sent = ? WHERE sync_uid = ?').run(i + 1, recordsSent, syncUid)
    }

    // Scoped to students actually enrolled THIS year, matching the finance
    // pages (owner report 2026-07-13: this used to be a lifetime count of
    // every student ever created, inflating the CAP billing number forever
    // as students graduated/were excluded across years).
    const currentYearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
    const studentCount = currentYearId
      ? db.prepare(`
          SELECT COUNT(*) as cnt FROM students s
          JOIN enrollments e ON e.student_id = s.id AND e.academic_year_id = ? AND e.is_deleted = 0
          WHERE s.is_deleted = 0
        `).get(currentYearId).cnt
      : 0

    await postToCap({
      action: 'complete',
      school_id: license.school_id,
      hardware_fingerprint: license.hardware_fingerprint,
      sync_uid: syncUid,
      sync_type: 'full',
      total_chunks: tasks.length,
      records_sent: recordsSent,
      student_count: studentCount,
    })

    db.prepare(`
      UPDATE sync_log
      SET status = 'success', completed_at = datetime('now'), student_count = ?
      WHERE sync_uid = ?
    `).run(studentCount, syncUid)

    db.prepare("UPDATE license_state SET last_sync_at = datetime('now')").run()

    running = null
  } catch (err) {
    const message = err.response?.data?.message || err.message || 'Erreur de synchronisation'
    console.error('[SYNC] Attempt failed', message)

    db.prepare("UPDATE sync_log SET status = 'partial', error_message = ? WHERE sync_uid = ?").run(message, syncUid)

    try {
      await postToCap({
        action: 'fail',
        school_id: license.school_id,
        hardware_fingerprint: license.hardware_fingerprint,
        sync_uid: syncUid,
        sync_type: 'full',
        error_message: message,
      })
    } catch (failErr) {
      console.error('[SYNC] Best-effort failure report also failed', failErr.message)
    }

    running = null
  }
}

// Reads sync_log directly — safe to call before requireAuth is wired up
// elsewhere (e.g. from the Phase 5 promotion gate).
function hasSuccessfulFullSync(db, withinDays) {
  const row = db.prepare(`
    SELECT completed_at FROM sync_log
    WHERE status = 'success' AND sync_type = 'full' AND completed_at IS NOT NULL
    ORDER BY completed_at DESC
    LIMIT 1
  `).get()

  if (!row) return false
  if (!withinDays) return true

  const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000
  return new Date(row.completed_at).getTime() >= cutoff
}

router.use(requireAuth)

// Sync is core to both tiers (not requirePro) but admin-only.
router.use((req, res, next) => {
  if (req.user?.role_name !== 'admin') {
    return res.status(403).json({ error: 'PERMISSION_DENIED', message: "Réservé à l'administrateur" })
  }
  next()
})

// ─── GET /api/sync/status ───────────────────────────────────
router.get('/status', (req, res) => {
  const db = getDb()
  const recent = db.prepare('SELECT * FROM sync_log ORDER BY id DESC LIMIT 5').all()
  const latest = recent[0] || null
  const lastSuccess = recent.find(r => r.status === 'success') || null

  res.json({
    recent,
    last_success_at: lastSuccess?.completed_at || null,
    resumable: latest?.status === 'partial',
    running: running ? { ...running } : null,
  })
})

// ─── POST /api/sync/start ───────────────────────────────────
router.post('/start', (req, res) => {
  if (running) {
    return res.status(409).json({ error: 'SYNC_IN_PROGRESS', message: 'Une synchronisation est déjà en cours' })
  }

  const db = getDb()
  const { resume } = req.body || {}
  const latest = db.prepare('SELECT * FROM sync_log ORDER BY id DESC LIMIT 1').get()

  let syncLog
  if (resume && latest?.status === 'partial') {
    syncLog = latest
  } else {
    const syncUid = generateUUID()
    db.prepare(`
      INSERT INTO sync_log (sync_uid, sync_type, status, triggered_by)
      VALUES (?, 'full', 'pending', ?)
    `).run(syncUid, req.user.id)
    syncLog = db.prepare('SELECT * FROM sync_log WHERE sync_uid = ?').get(syncUid)
  }

  running = {
    syncUid: syncLog.sync_uid,
    currentTask: syncLog.checkpoint || 0,
    totalTasks: syncLog.total_chunks || 0,
    currentLabel: '',
    error: null,
  }

  runSync(syncLog.sync_uid).catch(err => {
    console.error('[SYNC] Unhandled runner error', err)
    running = null
  })

  res.json({ started: true, sync_uid: syncLog.sync_uid })
})

// ─── GET /api/sync/progress ──────────────────────────────────
router.get('/progress', (req, res) => {
  if (running) {
    return res.json({
      running: true,
      current: running.currentTask,
      total: running.totalTasks,
      label: running.currentLabel,
    })
  }

  const db = getDb()
  const last = db.prepare('SELECT * FROM sync_log ORDER BY id DESC LIMIT 1').get()
  res.json({ running: false, last_result: last || null })
})

router.hasSuccessfulFullSync = hasSuccessfulFullSync
router.SYNC_TABLES = SYNC_TABLES
router.TABLE_LABELS = TABLE_LABELS

module.exports = router
