const express = require('express')
const router = express.Router()
const path = require('path')
const fs = require('fs')
const { getDb } = require('../db/init')
const { requireAuth } = require('../middleware/requireAuth')
const { requirePermission } = require('../middleware/requirePermission')

// ─── GET /api/settings/school-logo — Serve logo (no auth — img tags can't send JWT) ──
router.get('/school-logo', (req, res) => {
  const db = getDb()
  const logoPath = db.prepare("SELECT value FROM app_settings WHERE key = 'school_logo_path'").get()?.value
  if (!logoPath) return res.status(404).end()
  const fullPath = path.join(__dirname, '../../data', logoPath)
  if (!fs.existsSync(fullPath)) return res.status(404).end()
  res.setHeader('Content-Type', 'image/png')
  res.setHeader('Cache-Control', 'no-cache')
  fs.createReadStream(fullPath).pipe(res)
})

router.use(requireAuth)

// ─── GET /api/settings — All settings ───────────────────────
router.get('/', requirePermission('students.view'), (req, res) => {
  const db = getDb()
  const rows = db.prepare('SELECT key, value FROM app_settings').all()
  const settings = {}
  rows.forEach(r => { settings[r.key] = r.value })

  // Parse JSON settings
  let appreciationScale = []
  try { appreciationScale = JSON.parse(settings.appreciation_scale || '[]') } catch {}
  if (appreciationScale.length === 0) {
    appreciationScale = [
      { min: 16, max: 20, label: 'Très Bien' },
      { min: 14, max: 15.99, label: 'Bien' },
      { min: 12, max: 13.99, label: 'Assez Bien' },
      { min: 10, max: 11.99, label: 'Passable' },
      { min: 8, max: 9.99, label: 'Médiocre' },
      { min: 0, max: 7.99, label: 'Faible' },
    ]
  }

  let schoolSections = []
  try { schoolSections = JSON.parse(settings.school_section_config || '[]') } catch {}

  let congratulationsConfig = { avg_floor: 10, felicitation_percentile: 20, tableau_top_n: 5 }
  try { const c = JSON.parse(settings.congratulations_config || ''); if (c && typeof c === 'object') congratulationsConfig = c } catch {}

  const defaultConseilRanges = [
    { min: 16, max: 20, text: 'Très Bien — Admis au trimestre suivant', pass: true },
    { min: 14, max: 15.99, text: 'Bien — Admis au trimestre suivant', pass: true },
    { min: 12, max: 13.99, text: 'Assez Bien — Admis au trimestre suivant', pass: true },
    { min: 10, max: 11.99, text: 'Passable — Admis au trimestre suivant', pass: true },
    { min: 8, max: 9.99, text: 'Insuffisant — Avertissement de passage', pass: false },
    { min: 0, max: 7.99, text: 'Très Insuffisant — Non admis', pass: false },
  ]
  let conseilDecisionRanges = []
  try { conseilDecisionRanges = JSON.parse(settings.conseil_decision_ranges || '[]') } catch {}
  if (conseilDecisionRanges.length === 0) conseilDecisionRanges = defaultConseilRanges

  const logoPath = settings.school_logo_path || null
  let logoExists = false
  if (logoPath) {
    const fullPath = path.join(__dirname, '../../data', logoPath)
    logoExists = fs.existsSync(fullPath)
  }

  return res.json({
    appreciation_scale: appreciationScale,
    school_sections: schoolSections,
    school_logo_path: logoExists ? logoPath : null,
    total_rooms: settings.total_rooms || '',
    matricule_mode: settings.matricule_mode || 'custom',
    congratulations_config: congratulationsConfig,
    conseil_decision_ranges: conseilDecisionRanges,
    default_conduite_score: parseFloat(settings.default_conduite_score || '18'),
    passage_cutoff: parseFloat(settings.passage_cutoff || '10'),
  })
})

// ─── PUT /api/settings/appreciation-scale ────────────────────
router.put('/appreciation-scale', requirePermission('students.edit'), (req, res) => {
  const { scale } = req.body
  if (!Array.isArray(scale)) return res.status(400).json({ error: 'INVALID' })
  const db = getDb()
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('appreciation_scale', ?, datetime('now'))").run(JSON.stringify(scale))
  return res.json({ success: true })
})

// ─── PUT /api/settings/school-sections ───────────────────────
router.put('/school-sections', requirePermission('students.edit'), (req, res) => {
  const { sections } = req.body
  if (!Array.isArray(sections)) return res.status(400).json({ error: 'INVALID' })
  const db = getDb()
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('school_section_config', ?, datetime('now'))").run(JSON.stringify(sections))
  return res.json({ success: true })
})

// ─── PUT /api/settings/passage-cutoff ───────────────────────
router.put('/passage-cutoff', requirePermission('students.edit'), (req, res) => {
  const cutoff = parseFloat(req.body.cutoff)
  if (isNaN(cutoff) || cutoff < 0 || cutoff > 20) return res.status(400).json({ error: 'INVALID' })
  const db = getDb()
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('passage_cutoff', ?, datetime('now'))").run(String(cutoff))
  return res.json({ success: true })
})

// ─── PUT /api/settings/default-conduite ──────────────────────
router.put('/default-conduite', requirePermission('students.edit'), (req, res) => {
  const score = parseFloat(req.body.score)
  if (isNaN(score) || score < 0 || score > 20) return res.status(400).json({ error: 'INVALID' })
  const db = getDb()
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('default_conduite_score', ?, datetime('now'))").run(String(score))
  return res.json({ success: true })
})

// ─── PUT /api/settings/congratulations-config ────────────────
router.put('/congratulations-config', requirePermission('students.edit'), (req, res) => {
  const { avg_floor, felicitation_percentile, tableau_top_n } = req.body
  const db = getDb()
  const cfg = { avg_floor: parseFloat(avg_floor) || 10, felicitation_percentile: parseInt(felicitation_percentile) || 20, tableau_top_n: parseInt(tableau_top_n) || 5 }
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('congratulations_config', ?, datetime('now'))").run(JSON.stringify(cfg))
  return res.json({ success: true })
})

// ─── PUT /api/settings/conseil-decision-ranges ───────────────
router.put('/conseil-decision-ranges', requirePermission('students.edit'), (req, res) => {
  const { ranges } = req.body
  if (!Array.isArray(ranges)) return res.status(400).json({ error: 'INVALID' })
  const db = getDb()
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('conseil_decision_ranges', ?, datetime('now'))").run(JSON.stringify(ranges))
  return res.json({ success: true })
})

// ─── GET /api/settings/benin-flag — Serve bundled flag image ─
router.get('/benin-flag', (req, res) => {
  const flagPath = path.join(__dirname, '../../testing/drapeau_benin.png')
  if (!fs.existsSync(flagPath)) return res.status(404).end()
  res.setHeader('Content-Type', 'image/png')
  res.setHeader('Cache-Control', 'public, max-age=86400')
  fs.createReadStream(flagPath).pipe(res)
})

// ─── POST /api/settings/school-logo — Upload logo ───────────
router.post('/school-logo', express.raw({ type: '*/*', limit: '5mb' }), (req, res) => {
  try {
    const logoDir = path.join(__dirname, '../../data/logos')
    if (!fs.existsSync(logoDir)) fs.mkdirSync(logoDir, { recursive: true })

    const filename = 'school-logo.png'
    const filePath = path.join(logoDir, filename)
    fs.writeFileSync(filePath, req.body)

    const db = getDb()
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('school_logo_path', ?, datetime('now'))").run(`logos/${filename}`)

    return res.json({ success: true, path: `logos/${filename}` })
  } catch (err) {
    return res.status(500).json({ error: 'UPLOAD_FAILED', message: err.message })
  }
})

// ─── DELETE /api/settings/school-logo — Remove logo ─────────
router.delete('/school-logo', (req, res) => {
  const db = getDb()
  const logoPath = db.prepare("SELECT value FROM app_settings WHERE key = 'school_logo_path'").get()?.value
  if (logoPath) {
    const fullPath = path.join(__dirname, '../../data', logoPath)
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
  }
  db.prepare("DELETE FROM app_settings WHERE key = 'school_logo_path'").run()
  return res.json({ success: true })
})


// ─── GET /api/settings/academic — Academic settings ──────────
router.get('/academic', requirePermission('students.view'), (req, res) => {
  const db = getDb()
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  const year = yearId ? db.prepare('SELECT * FROM academic_years WHERE id = ?').get(yearId) : null
  const periodeType = db.prepare("SELECT value FROM app_settings WHERE key = 'periode_type'").get()?.value || 'trimestre'
  const periodeCount = parseInt(db.prepare("SELECT value FROM app_settings WHERE key = 'periode_count'").get()?.value || '3')

  const levels = db.prepare('SELECT * FROM levels WHERE is_active = 1 ORDER BY display_order').all()

  // Assessment configs per level
  const assessConfigs = {}
  for (const l of levels) {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(`assessment_config_${l.id}`)
    assessConfigs[l.id] = row ? JSON.parse(row.value) : { interrogations: 4, devoirs: 1, compositions: 1, max_score: 20 }
  }

  // Subject-level assignments
  const levelSubjects = db.prepare(`
    SELECT ls.id, ls.level_id, ls.subject_id, ls.coefficient, s.name AS subject_name
    FROM level_subjects ls JOIN subjects s ON s.id = ls.subject_id
    WHERE ls.is_active = 1 ORDER BY ls.level_id, s.name
  `).all()

  // Teacher assignments
  const assignments = db.prepare(`
    SELECT ts.id, ts.teacher_id, ts.classroom_id, ts.subject_id,
           t.full_name AS teacher_name, c.label AS classroom_label, sub.name AS subject_name
    FROM teacher_schedule ts
    JOIN teachers t ON t.id = ts.teacher_id
    JOIN classrooms c ON c.id = ts.classroom_id
    JOIN subjects sub ON sub.id = ts.subject_id
    WHERE ts.academic_year_id = ?
    ORDER BY c.label, sub.name
  `).all(yearId || 0)

  const classrooms = db.prepare(`
    SELECT c.id, c.label, c.level_id FROM classrooms c
    WHERE c.academic_year_id = ? AND c.is_deleted = 0
    ORDER BY c.label
  `).all(yearId || 0)

  const teachers = db.prepare('SELECT id, full_name FROM teachers WHERE is_active = 1 AND is_deleted = 0 ORDER BY full_name').all()
  const subjects = db.prepare('SELECT id, name FROM subjects WHERE is_active = 1 ORDER BY name').all()

  return res.json({
    academic_year: year, periode_type: periodeType, periode_count: periodeCount,
    levels, assess_configs: assessConfigs, level_subjects: levelSubjects,
    assignments, classrooms, teachers, subjects,
  })
})

// ─── PUT /api/settings/assessment-config — Update per level ──
router.put('/assessment-config', requirePermission('students.edit'), (req, res) => {
  const { configs } = req.body
  if (!configs || !Array.isArray(configs)) return res.status(400).json({ error: 'INVALID' })
  const db = getDb()
  for (const c of configs) {
    if (!c.level_id) continue
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))")
      .run(`assessment_config_${c.level_id}`, JSON.stringify({ interrogations: c.interrogations || 0, devoirs: c.devoirs || 0, compositions: c.compositions || 0, max_score: c.max_score || 20 }))
  }
  return res.json({ success: true })
})

// ─── PUT /api/settings/level-subject — Update coefficient ────
router.put('/level-subject/:id', requirePermission('students.edit'), (req, res) => {
  const { coefficient } = req.body
  const db = getDb()
  db.prepare('UPDATE level_subjects SET coefficient = ? WHERE id = ?').run(coefficient || 1, req.params.id)
  return res.json({ success: true })
})

// ─── PUT /api/settings/teacher-assignment — Reassign teacher ─
router.put('/teacher-assignment/:id', requirePermission('students.edit'), (req, res) => {
  const { teacher_id } = req.body
  const db = getDb()
  db.prepare('UPDATE teacher_schedule SET teacher_id = ? WHERE id = ?').run(teacher_id, req.params.id)
  return res.json({ success: true })
})

// ─── POST /api/settings/teacher-assignment — New assignment ──
router.post('/teacher-assignment', requirePermission('students.edit'), (req, res) => {
  const { teacher_id, classroom_id, subject_id } = req.body
  if (!teacher_id || !classroom_id || !subject_id) return res.status(400).json({ error: 'MISSING_FIELDS' })
  const db = getDb()
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  db.prepare('INSERT OR REPLACE INTO teacher_schedule (teacher_id, classroom_id, subject_id, academic_year_id) VALUES (?, ?, ?, ?)')
    .run(teacher_id, classroom_id, subject_id, yearId)
  return res.json({ success: true })
})

// ─── DELETE /api/settings/teacher-assignment/:id — Remove ────
router.delete('/teacher-assignment/:id', requirePermission('students.edit'), (req, res) => {
  const db = getDb()
  db.prepare('DELETE FROM teacher_schedule WHERE id = ?').run(req.params.id)
  return res.json({ success: true })
})

// ═══════════════════════════════════════════════════════════════
// POST-ONBOARDING MANAGEMENT (levels, classrooms, subjects, series)
// ═══════════════════════════════════════════════════════════════

// ─── PUT /api/settings/levels — Toggle level activation ──────
router.put('/levels', requirePermission('students.edit'), (req, res) => {
  const { level_ids } = req.body
  if (!level_ids || !Array.isArray(level_ids)) return res.status(400).json({ error: 'INVALID' })
  const db = getDb()
  db.transaction(() => {
    db.prepare('UPDATE levels SET is_active = 0').run()
    const stmt = db.prepare('UPDATE levels SET is_active = 1 WHERE id = ?')
    for (const id of level_ids) stmt.run(id)
  })()
  return res.json({ success: true })
})

// ─── GET /api/settings/levels — All levels with active state ─
router.get('/levels', requirePermission('students.view'), (req, res) => {
  const db = getDb()
  const levels = db.prepare('SELECT * FROM levels ORDER BY display_order').all()
  return res.json({ levels })
})

// ─── POST /api/settings/classrooms — Add classroom mid-year ──
router.post('/classrooms', requirePermission('students.edit'), (req, res) => {
  const { label, level_id, serie_id, capacity } = req.body
  if (!label?.trim() || !level_id) return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Nom et niveau requis' })
  const db = getDb()
  const { generateUUID } = require('../utils/uid')
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  if (!yearId) return res.status(400).json({ error: 'NO_YEAR' })

  const existing = db.prepare('SELECT id FROM classrooms WHERE label = ? AND academic_year_id = ? AND is_deleted = 0').get(label.trim(), yearId)
  if (existing) return res.status(409).json({ error: 'DUPLICATE', message: 'Une classe avec ce nom existe déjà' })

  const result = db.prepare('INSERT INTO classrooms (classroom_uid, label, level_id, serie_id, academic_year_id, capacity) VALUES (?, ?, ?, ?, ?, ?)')
    .run(generateUUID(), label.trim(), level_id, serie_id || null, parseInt(yearId), capacity || 50)

  // Auto-generate assessment templates
  const classroomId = result.lastInsertRowid
  const periodeCount = parseInt(db.prepare("SELECT value FROM app_settings WHERE key = 'periode_count'").get()?.value || '3')
  const configRow = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(`assessment_config_${level_id}`)
  const assessConfig = configRow ? JSON.parse(configRow.value) : { interrogations: 4, devoirs: 1, compositions: 1, max_score: 20 }

  const subjects = serie_id
    ? db.prepare('SELECT subject_id FROM level_subjects WHERE level_id = ? AND is_active = 1 AND (serie_id = ? OR serie_id IS NULL)').all(level_id, serie_id)
    : db.prepare('SELECT subject_id FROM level_subjects WHERE level_id = ? AND is_active = 1 AND serie_id IS NULL').all(level_id)

  const tStmt = db.prepare('INSERT OR IGNORE INTO assessment_templates (classroom_id, subject_id, academic_year_id, semester, assessment_type, sequence_number, max_score, weight) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  db.transaction(() => {
    for (const sub of subjects) {
      for (let sem = 1; sem <= periodeCount; sem++) {
        for (let i = 1; i <= assessConfig.interrogations; i++) tStmt.run(classroomId, sub.subject_id, parseInt(yearId), sem, 'interrogation', i, assessConfig.max_score, 1)
        for (let i = 1; i <= assessConfig.devoirs; i++) tStmt.run(classroomId, sub.subject_id, parseInt(yearId), sem, 'devoir', i, assessConfig.max_score, 1)
        for (let i = 1; i <= assessConfig.compositions; i++) tStmt.run(classroomId, sub.subject_id, parseInt(yearId), sem, 'composition', i, assessConfig.max_score, 1)
      }
    }
  })()

  return res.status(201).json({ success: true, classroom_id: classroomId })
})

// ─── POST /api/settings/subjects — Add new subject ───────────
router.post('/subjects', requirePermission('students.edit'), (req, res) => {
  const { name, short_code } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Nom requis' })
  const db = getDb()
  const existing = db.prepare('SELECT id FROM subjects WHERE name = ?').get(name.trim())
  if (existing) return res.status(409).json({ error: 'DUPLICATE', message: 'Cette matière existe déjà' })
  const result = db.prepare('INSERT INTO subjects (name, short_code) VALUES (?, ?)').run(name.trim(), short_code?.trim() || null)
  return res.status(201).json({ success: true, subject_id: result.lastInsertRowid })
})

// ─── POST /api/settings/level-subject — Add subject to level ─
router.post('/level-subject', requirePermission('students.edit'), (req, res) => {
  const { level_id, serie_id, subject_id, coefficient } = req.body
  if (!level_id || !subject_id) return res.status(400).json({ error: 'MISSING_FIELDS' })
  const db = getDb()
  db.prepare('INSERT OR REPLACE INTO level_subjects (level_id, serie_id, subject_id, coefficient, is_active) VALUES (?, ?, ?, ?, 1)')
    .run(level_id, serie_id || null, subject_id, coefficient || 1)
  return res.json({ success: true })
})

// ─── DELETE /api/settings/level-subject/:id — Remove subject from level ─
router.delete('/level-subject/:id', requirePermission('students.edit'), (req, res) => {
  const db = getDb()
  db.prepare('UPDATE level_subjects SET is_active = 0 WHERE id = ?').run(req.params.id)
  return res.json({ success: true })
})

// ─── POST /api/settings/series — Add serie to level ──────────
router.post('/series', requirePermission('students.edit'), (req, res) => {
  const { name, level_id } = req.body
  if (!name?.trim() || !level_id) return res.status(400).json({ error: 'MISSING_FIELDS' })
  const db = getDb()
  db.prepare('INSERT OR IGNORE INTO series (name, level_id) VALUES (?, ?)').run(name.trim().toUpperCase(), level_id)
  return res.json({ success: true })
})

module.exports = router
