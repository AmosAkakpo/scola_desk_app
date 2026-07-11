const express = require('express')
const router = express.Router()
const { getDb } = require('../db/init')
const { requireAuth } = require('../middleware/requireAuth')
const { hasSuccessfulFullSync } = require('./sync')
const { computeChecklist } = require('../utils/promotionChecklist')
const { computeVerdicts } = require('../utils/promotionVerdicts')
const { autoAssignMandatoryFees } = require('../utils/fees')
const { generateUUID } = require('../utils/uid')

router.use(requireAuth)

// Promotion is core to both tiers (not requirePro) but admin-only — same
// gating convention as sync.js.
router.use((req, res, next) => {
  if (req.user?.role_name !== 'admin') {
    return res.status(403).json({ error: 'PERMISSION_DENIED', message: "Réservé à l'administrateur" })
  }
  next()
})

// ─── GET /api/promotion/exam-cohort-levels — levels + their exam config ───
// cohort_student_count is for the CURRENT year -- lets the frontend hide an
// exam tab entirely when the school has configured a cohort level (e.g.
// CEP) but has zero students actually enrolled in it this year.
router.get('/exam-cohort-levels', (req, res) => {
  const db = getDb()
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  const levels = db.prepare(`
    SELECT id, name, level_code, has_serie, is_exam_cohort, exam_name, display_order
    FROM levels
    ORDER BY display_order
  `).all()
  for (const level of levels) {
    level.cohort_student_count = db.prepare(`
      SELECT COUNT(*) as cnt FROM enrollments e
      JOIN classrooms c ON c.id = e.classroom_id AND c.level_id = ? AND c.is_deleted = 0
      WHERE e.academic_year_id = ? AND e.is_deleted = 0 AND e.is_expelled = 0
    `).get(level.id, yearId || 0)?.cnt || 0
  }
  return res.json({ levels })
})

// ─── PUT /api/promotion/exam-cohort-levels/:levelId — toggle cohort status ─
router.put('/exam-cohort-levels/:levelId', (req, res) => {
  const db = getDb()
  const { is_exam_cohort, exam_name } = req.body

  const level = db.prepare('SELECT id FROM levels WHERE id = ?').get(req.params.levelId)
  if (!level) return res.status(404).json({ error: 'NOT_FOUND', message: 'Niveau introuvable' })

  if (is_exam_cohort && !exam_name?.trim()) {
    return res.status(400).json({ error: 'MISSING_EXAM_NAME', message: "Nom de l'examen requis" })
  }

  db.prepare(`
    UPDATE levels SET is_exam_cohort = ?, exam_name = ? WHERE id = ?
  `).run(is_exam_cohort ? 1 : 0, is_exam_cohort ? exam_name.trim() : null, req.params.levelId)

  // A newly-designated exam type needs a passing-rule row to configure
  // against — created with the safe default so nothing changes behaviorally
  // until the admin visits the rules editor deliberately.
  if (is_exam_cohort) {
    db.prepare(`
      INSERT OR IGNORE INTO exam_passing_rules (exam_type, mode, min_moyenne)
      VALUES (?, 'moyenne_only', 10)
    `).run(exam_name.trim())
  }

  return res.json({ success: true })
})

// ─── GET /api/promotion/exam-rules — current passing rules ─────────────────
router.get('/exam-rules', (req, res) => {
  const db = getDb()
  const rules = db.prepare(`
    SELECT er.exam_type, er.mode, er.min_moyenne
    FROM exam_passing_rules er
    JOIN levels l ON l.exam_name = er.exam_type AND l.is_exam_cohort = 1
    GROUP BY er.exam_type
    ORDER BY er.exam_type
  `).all()
  return res.json({ rules })
})

// ─── PUT /api/promotion/exam-rules/:examType — update a passing rule ──────
router.put('/exam-rules/:examType', (req, res) => {
  const db = getDb()
  const { mode, min_moyenne } = req.body

  if (!['moyenne_only', 'exam_only', 'both'].includes(mode)) {
    return res.status(400).json({ error: 'INVALID_MODE', message: 'Mode invalide' })
  }
  if (typeof min_moyenne !== 'number' || min_moyenne < 0 || min_moyenne > 20) {
    return res.status(400).json({ error: 'INVALID_THRESHOLD', message: 'Moyenne minimale invalide' })
  }

  const result = db.prepare(`
    UPDATE exam_passing_rules SET mode = ?, min_moyenne = ?, updated_at = datetime('now')
    WHERE exam_type = ?
  `).run(mode, min_moyenne, req.params.examType)

  if (result.changes === 0) {
    db.prepare(`
      INSERT INTO exam_passing_rules (exam_type, mode, min_moyenne) VALUES (?, ?, ?)
    `).run(req.params.examType, mode, min_moyenne)
  }

  return res.json({ success: true })
})

// ─── GET /api/promotion/exam-results/:academicYearId/:examType — entry grid ─
router.get('/exam-results/:academicYearId/:examType', (req, res) => {
  const db = getDb()
  const { academicYearId, examType } = req.params

  const students = db.prepare(`
    SELECT
      s.id AS student_id, s.full_name, s.matricule,
      c.id AS classroom_id, c.label AS classroom_label,
      ner.result, ner.score, ner.serie, ner.notes, ner.registration_number
    FROM students s
    JOIN enrollments e ON e.student_id = s.id
      AND e.academic_year_id = ? AND e.is_deleted = 0 AND e.is_expelled = 0
    JOIN classrooms c ON c.id = e.classroom_id AND c.is_deleted = 0
    JOIN levels l ON l.id = c.level_id AND l.is_exam_cohort = 1 AND l.exam_name = ?
    LEFT JOIN national_exam_results ner
      ON ner.student_id = s.id AND ner.academic_year_id = ? AND ner.exam_type = ?
    WHERE s.is_deleted = 0 AND s.status = 'active'
    ORDER BY c.label, s.full_name
  `).all(academicYearId, examType, academicYearId, examType)

  return res.json({ students })
})

// ─── POST /api/promotion/exam-results — upsert one student's result ───────
router.post('/exam-results', (req, res) => {
  const db = getDb()
  const { student_id, academic_year_id, exam_type, result, score, serie, notes, registration_number } = req.body

  if (!student_id || !academic_year_id || !exam_type) {
    return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Champs requis manquants' })
  }
  if (result && !['admis', 'recalé', 'absent'].includes(result)) {
    return res.status(400).json({ error: 'INVALID_RESULT', message: 'Résultat invalide' })
  }

  const existing = db.prepare(`
    SELECT id FROM national_exam_results
    WHERE student_id = ? AND academic_year_id = ? AND exam_type = ?
  `).get(student_id, academic_year_id, exam_type)

  if (existing) {
    db.prepare(`
      UPDATE national_exam_results
      SET result = ?, score = ?, serie = ?, notes = ?, registration_number = ?
      WHERE id = ?
    `).run(result || null, score ?? null, serie || null, notes || null, registration_number || null, existing.id)
  } else {
    db.prepare(`
      INSERT INTO national_exam_results
        (student_id, academic_year_id, exam_type, result, score, serie, notes, registration_number)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(student_id, academic_year_id, exam_type, result || null, score ?? null, serie || null, notes || null, registration_number || null)
  }

  return res.json({ success: true })
})

// ─── GET /api/promotion/checklist/:academicYearId — Étape 1 gates ─────────
router.get('/checklist/:academicYearId', (req, res) => {
  const db = getDb()
  const result = computeChecklist(db, req.params.academicYearId, hasSuccessfulFullSync)
  return res.json(result)
})

// ─── POST /api/promotion/preview/:academicYearId — Étape 3 verdicts ───────
// POST (not GET) because it accepts an overrides array in the body.
// Pure read -- computes but persists nothing.
router.post('/preview/:academicYearId', (req, res) => {
  const db = getDb()
  const overrides = req.body?.overrides || [] // [{ student_id, verdict, reason }]
  const overrideMap = new Map(overrides.map(o => [o.student_id, o]))

  const { rows, summary } = computeVerdicts(db, req.params.academicYearId, overrideMap)

  // Preview only needs display fields, not the raw target object execute uses.
  const displayRows = rows.map(r => ({
    student_id: r.student_id,
    full_name: r.full_name,
    matricule: r.matricule,
    source_classroom: r.source_classroom,
    source_level: r.source_level,
    annual_average: r.annual_average,
    threshold: r.threshold,
    exam_result: r.exam_result,
    borderline: r.borderline,
    verdict: r.verdict,
    graduated: r.graduated,
    override_reason: r.override_reason,
    target_level: r.graduated ? null : r.target?.level_name || null,
    target_classroom: r.graduated ? null : r.target?.label || null,
    target_is_new_level: r.target?.is_new_level || false,
  }))

  return res.json({ rows: displayRows, summary })
})

// ─── POST /api/promotion/execute/:academicYearId — Étape 4 ────────────────
router.post('/execute/:academicYearId', (req, res) => {
  const db = getDb()
  const oldYearId = parseInt(req.params.academicYearId)
  const { overrides, carry_forward_assignments, new_year_label, confirm_text } = req.body || {}

  if (confirm_text !== 'PROMOTION') {
    return res.status(400).json({ error: 'CONFIRM_REQUIRED', message: 'Confirmation requise' })
  }
  if (!new_year_label?.trim()) {
    return res.status(400).json({ error: 'MISSING_LABEL', message: "Libellé de l'année requise" })
  }
  if (db.prepare('SELECT id FROM academic_years WHERE label = ?').get(new_year_label.trim())) {
    return res.status(409).json({ error: 'DUPLICATE_LABEL', message: 'Cette année académique existe déjà' })
  }

  // Étape 1's checklist is a fully manual, self-declared confirmation by the
  // admin (owner request 2026-07-11: nothing about it is auto-detected or
  // auto-blocking) -- execute does not re-derive or enforce it server-side.

  const overrideMap = new Map((overrides || []).map(o => [o.student_id, o]))
  const { rows: verdictRows } = computeVerdicts(db, oldYearId, overrideMap)

  const periodeCount = parseInt(db.prepare("SELECT value FROM app_settings WHERE key = 'periode_count'").get()?.value || '3')

  try {
    const promotionUid = db.transaction(() => {
      // 1. New academic year, becomes the active one.
      const yearResult = db.prepare(
        'INSERT INTO academic_years (label, is_active) VALUES (?, 1)'
      ).run(new_year_label.trim())
      const newYearId = yearResult.lastInsertRowid

      db.prepare('UPDATE academic_years SET is_active = 0 WHERE id != ?').run(newYearId)
      db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('current_academic_year_id', ?, datetime('now'))")
        .run(String(newYearId))

      // 2. Copy fee_types + fee_type_amounts into the new year (system fee included).
      const oldFeeTypes = db.prepare('SELECT * FROM fee_types WHERE academic_year_id = ?').all(oldYearId)
      const feeTypeIdMap = new Map() // old fee_type_id -> new fee_type_id
      for (const ft of oldFeeTypes) {
        const r = db.prepare(`
          INSERT INTO fee_types (academic_year_id, name, is_mandatory, is_system, is_active, display_order)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(newYearId, ft.name, ft.is_mandatory, ft.is_system, ft.is_active, ft.display_order)
        feeTypeIdMap.set(ft.id, r.lastInsertRowid)

        const amounts = db.prepare('SELECT * FROM fee_type_amounts WHERE fee_type_id = ?').all(ft.id)
        const amtStmt = db.prepare('INSERT INTO fee_type_amounts (fee_type_id, level_id, amount) VALUES (?, ?, ?)')
        for (const a of amounts) amtStmt.run(r.lastInsertRowid, a.level_id, a.amount)
      }

      // 3. Create target classrooms on demand + their assessment templates.
      const classroomCache = new Map() // "level|serie|label" -> new classroom_id
      const activatedLevels = new Set()
      const sourceToTargetClassroom = new Map() // sourceClassroomId -> newClassroomId (for teacher_schedule/timetable carry-forward)

      function getOrCreateTargetClassroom(target, sourceClassroomId, sourceClassroomRow) {
        const cacheKey = `${target.level_id}|${target.serie_id || 'null'}|${target.label}`
        let classroomId = classroomCache.get(cacheKey)
        if (!classroomId) {
          const uid = generateUUID()
          const r = db.prepare(`
            INSERT INTO classrooms (classroom_uid, label, level_id, serie_id, academic_year_id, capacity, expected_tuition)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(uid, target.label, target.level_id, target.serie_id || null, newYearId, sourceClassroomRow.capacity || 50, sourceClassroomRow.expected_tuition || 0)
          classroomId = r.lastInsertRowid
          classroomCache.set(cacheKey, classroomId)

          if (target.is_new_level && !activatedLevels.has(target.level_id)) {
            db.prepare('UPDATE levels SET is_active = 1 WHERE id = ?').run(target.level_id)
            activatedLevels.add(target.level_id)
          }

          // Assessment templates, mirroring classrooms.js's own creation logic.
          const configRow = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(`assessment_config_${target.level_id}`)
          const cfg = configRow ? JSON.parse(configRow.value) : { interrogations: 4, devoirs: 1, compositions: 1, max_score: 20 }
          const subjects = target.serie_id
            ? db.prepare('SELECT subject_id FROM level_subjects WHERE level_id = ? AND is_active = 1 AND (serie_id = ? OR serie_id IS NULL)').all(target.level_id, target.serie_id)
            : db.prepare('SELECT subject_id FROM level_subjects WHERE level_id = ? AND is_active = 1 AND serie_id IS NULL').all(target.level_id)
          const tpl = db.prepare(`
            INSERT OR IGNORE INTO assessment_templates (classroom_id, subject_id, academic_year_id, semester, assessment_type, sequence_number, max_score, weight)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `)
          for (const sub of subjects) {
            for (let sem = 1; sem <= periodeCount; sem++) {
              for (let i = 1; i <= cfg.interrogations; i++) tpl.run(classroomId, sub.subject_id, newYearId, sem, 'interrogation', i, cfg.max_score, 1)
              for (let i = 1; i <= cfg.devoirs; i++) tpl.run(classroomId, sub.subject_id, newYearId, sem, 'devoir', i, cfg.max_score, 1)
              for (let i = 1; i <= cfg.compositions; i++) tpl.run(classroomId, sub.subject_id, newYearId, sem, 'composition', i, cfg.max_score, 1)
            }
          }
        }
        if (sourceClassroomId) sourceToTargetClassroom.set(`${sourceClassroomId}|${classroomId}`, classroomId)
        return classroomId
      }

      // 4. Apply each verdict.
      const promotionRunResult = db.prepare(`
        INSERT INTO promotion_runs (promotion_uid, academic_year_from, academic_year_to, executed_by, notes)
        VALUES (?, ?, ?, ?, ?)
      `).run(generateUUID(), oldYearId, newYearId, req.user.id, null)
      const promotionRunId = promotionRunResult.lastInsertRowid

      const detailStmt = db.prepare(`
        INSERT INTO promotion_details
          (promotion_run_id, student_id, old_classroom_id, new_classroom_id, final_average, verdict, national_exam_cleared, override_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)

      const sourceClassroomRows = new Map()
      for (const row of verdictRows) {
        if (!sourceClassroomRows.has(row.source_classroom_id)) {
          sourceClassroomRows.set(row.source_classroom_id, db.prepare('SELECT * FROM classrooms WHERE id = ?').get(row.source_classroom_id))
        }
        const sourceClassroomRow = sourceClassroomRows.get(row.source_classroom_id)

        let newClassroomId = null

        if (row.verdict === 'exclu') {
          db.prepare("UPDATE students SET status = 'excluded', updated_at = datetime('now') WHERE id = ?").run(row.student_id)
        } else if (row.graduated) {
          db.prepare("UPDATE students SET status = 'graduated', updated_at = datetime('now') WHERE id = ?").run(row.student_id)
        } else if (row.target) {
          newClassroomId = getOrCreateTargetClassroom(row.target, row.source_classroom_id, sourceClassroomRow)
          db.prepare('INSERT INTO enrollments (enrollment_uid, student_id, classroom_id, academic_year_id) VALUES (?, ?, ?, ?)')
            .run(generateUUID(), row.student_id, newClassroomId, newYearId)
          db.prepare('UPDATE students SET is_redoublant = ?, updated_at = datetime(\'now\') WHERE id = ?')
            .run(row.verdict === 'doublant' ? 1 : 0, row.student_id)
          autoAssignMandatoryFees(db, row.student_id, newYearId)
        }

        detailStmt.run(
          promotionRunId, row.student_id, row.source_classroom_id, newClassroomId,
          row.annual_average, row.graduated ? 'admis' : row.verdict,
          row.exam_result === 'admis' ? 1 : 0, row.override_reason
        )
      }

      // 5. Optionally carry forward teacher assignments + timetable.
      if (carry_forward_assignments) {
        const pairs = Array.from(sourceToTargetClassroom.keys())
        const scheduleStmt = db.prepare(`
          INSERT OR IGNORE INTO teacher_schedule (teacher_id, classroom_id, subject_id, academic_year_id, hours_per_week, hourly_rate)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        const timetableStmt = db.prepare(`
          INSERT INTO timetable_entries (academic_year_id, classroom_id, day_of_week, start_time, end_time, subject_id, teacher_id, room)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        for (const pairKey of pairs) {
          const [sourceClassroomId, newClassroomId] = pairKey.split('|').map(Number)
          const schedules = db.prepare('SELECT * FROM teacher_schedule WHERE classroom_id = ? AND academic_year_id = ?').all(sourceClassroomId, oldYearId)
          for (const sch of schedules) scheduleStmt.run(sch.teacher_id, newClassroomId, sch.subject_id, newYearId, sch.hours_per_week, sch.hourly_rate)

          const entries = db.prepare('SELECT * FROM timetable_entries WHERE classroom_id = ? AND academic_year_id = ?').all(sourceClassroomId, oldYearId)
          for (const e of entries) timetableStmt.run(newYearId, newClassroomId, e.day_of_week, e.start_time, e.end_time, e.subject_id, e.teacher_id, e.room)
        }
      }

      return db.prepare('SELECT promotion_uid FROM promotion_runs WHERE id = ?').get(promotionRunId).promotion_uid
    })()

    return res.json({ success: true, promotion_uid: promotionUid })
  } catch (err) {
    console.error('[PROMOTION EXECUTE]', err)
    return res.status(500).json({ error: 'EXECUTE_FAILED', message: 'Erreur lors de la promotion' })
  }
})

// ─── GET /api/promotion/runs — history, most recent first ─────────────────
router.get('/runs', (req, res) => {
  const db = getDb()
  const runs = db.prepare(`
    SELECT
      pr.promotion_uid, pr.executed_at, pr.is_rolled_back, pr.rolled_back_at,
      yf.label AS year_from_label, yt.label AS year_to_label,
      u.full_name AS executed_by_name,
      (SELECT COUNT(*) FROM promotion_details WHERE promotion_run_id = pr.id) AS student_count
    FROM promotion_runs pr
    JOIN academic_years yf ON yf.id = pr.academic_year_from
    JOIN academic_years yt ON yt.id = pr.academic_year_to
    LEFT JOIN users u ON u.id = pr.executed_by
    ORDER BY pr.executed_at DESC
  `).all()
  return res.json({ runs })
})

// ─── POST /api/promotion/rollback/:promotionUid — Étape 5, 30-day window ──
router.post('/rollback/:promotionUid', (req, res) => {
  const db = getDb()
  const run = db.prepare('SELECT * FROM promotion_runs WHERE promotion_uid = ?').get(req.params.promotionUid)

  if (!run) return res.status(404).json({ error: 'NOT_FOUND', message: 'Promotion introuvable' })
  if (run.is_rolled_back) return res.status(409).json({ error: 'ALREADY_ROLLED_BACK', message: 'Cette promotion a déjà été annulée' })

  const daysSince = (Date.now() - new Date(run.executed_at).getTime()) / (24 * 60 * 60 * 1000)
  if (daysSince > 30) {
    return res.status(403).json({ error: 'WINDOW_EXPIRED', message: "Délai d'annulation de 30 jours dépassé" })
  }

  const details = db.prepare('SELECT * FROM promotion_details WHERE promotion_run_id = ?').all(run.id)
  const newYearId = run.academic_year_to

  // Refuse if any promoted student already has real activity in the new
  // year -- rolling back would silently orphan payments/grades rather than
  // cleanly undoing the promotion.
  const blocked = []
  for (const d of details) {
    if (!d.new_classroom_id) continue
    const hasPayments = db.prepare('SELECT 1 FROM payments WHERE student_id = ? AND academic_year_id = ? LIMIT 1').get(d.student_id, newYearId)
    const hasScores = db.prepare(`
      SELECT 1 FROM assessment_scores sc
      JOIN assessment_templates t ON t.id = sc.template_id
      WHERE sc.student_id = ? AND t.academic_year_id = ? AND sc.is_deleted = 0 LIMIT 1
    `).get(d.student_id, newYearId)
    const hasReportCards = db.prepare('SELECT 1 FROM report_card_snapshots WHERE student_id = ? AND academic_year_id = ? LIMIT 1').get(d.student_id, newYearId)
    if (hasPayments || hasScores || hasReportCards) {
      const student = db.prepare('SELECT full_name FROM students WHERE id = ?').get(d.student_id)
      blocked.push(student?.full_name || `#${d.student_id}`)
    }
  }
  if (blocked.length > 0) {
    return res.status(409).json({
      error: 'ACTIVITY_EXISTS',
      message: "Annulation impossible : des données ont déjà été enregistrées pour l'année suivante pour ces élèves",
      students: blocked,
    })
  }

  try {
    db.transaction(() => {
      for (const d of details) {
        if (d.new_classroom_id) {
          db.prepare('DELETE FROM enrollments WHERE student_id = ? AND classroom_id = ? AND academic_year_id = ?')
            .run(d.student_id, d.new_classroom_id, newYearId)
          db.prepare("UPDATE students SET is_redoublant = 0, updated_at = datetime('now') WHERE id = ?").run(d.student_id)
        }
        if (d.verdict === 'exclu') {
          db.prepare("UPDATE students SET status = 'active', updated_at = datetime('now') WHERE id = ?").run(d.student_id)
        } else if (!d.new_classroom_id) {
          // graduated
          db.prepare("UPDATE students SET status = 'active', updated_at = datetime('now') WHERE id = ?").run(d.student_id)
        }
      }

      // Revert active year + current_academic_year_id back to the old one.
      // The new year's classrooms/fee_types/etc. are left in place -- only
      // the promotion's enrollment effects are reversed.
      db.prepare('UPDATE academic_years SET is_active = 0 WHERE id = ?').run(newYearId)
      db.prepare('UPDATE academic_years SET is_active = 1 WHERE id = ?').run(run.academic_year_from)
      db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('current_academic_year_id', ?, datetime('now'))")
        .run(String(run.academic_year_from))

      db.prepare(`
        UPDATE promotion_runs
        SET is_rolled_back = 1, rolled_back_at = datetime('now'), rolled_back_by = ?
        WHERE id = ?
      `).run(req.user.id, run.id)
    })()

    return res.json({ success: true })
  } catch (err) {
    console.error('[PROMOTION ROLLBACK]', err)
    return res.status(500).json({ error: 'ROLLBACK_FAILED', message: "Erreur lors de l'annulation" })
  }
})

module.exports = router
