const express = require('express')
const router = express.Router()
const { getDb } = require('../db/init')
const { requireAuth } = require('../middleware/requireAuth')

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
router.get('/exam-cohort-levels', (req, res) => {
  const db = getDb()
  const levels = db.prepare(`
    SELECT id, name, level_code, has_serie, is_exam_cohort, exam_name, display_order
    FROM levels
    ORDER BY display_order
  `).all()
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

module.exports = router
