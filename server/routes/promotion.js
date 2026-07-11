const express = require('express')
const router = express.Router()
const { getDb } = require('../db/init')
const { requireAuth } = require('../middleware/requireAuth')
const { hasSuccessfulFullSync } = require('./sync')
const { resolveTarget } = require('../utils/promotionMapping')

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

// ─── GET /api/promotion/checklist/:academicYearId — Étape 1 gates ─────────
router.get('/checklist/:academicYearId', (req, res) => {
  const db = getDb()
  const yearId = req.params.academicYearId
  const periodeCount = parseInt(db.prepare("SELECT value FROM app_settings WHERE key = 'periode_count'").get()?.value || '3')
  const finalSemester = periodeCount

  const gates = []

  // Gate 1: final-period grades computed for every classroom [blocking]
  const totalClassrooms = db.prepare(
    'SELECT COUNT(*) as cnt FROM classrooms WHERE academic_year_id = ? AND is_deleted = 0'
  ).get(yearId)?.cnt || 0
  const computedClassrooms = db.prepare(
    'SELECT COUNT(DISTINCT classroom_id) as cnt FROM semester_summaries WHERE academic_year_id = ? AND semester = ?'
  ).get(yearId, finalSemester)?.cnt || 0
  gates.push({
    key: 'grades_computed',
    label: 'Notes de la période finale calculées pour toutes les classes',
    status: totalClassrooms > 0 && computedClassrooms >= totalClassrooms ? 'ok' : 'blocked',
    detail: `${computedClassrooms}/${totalClassrooms} classes`,
  })

  // Gate 2: bulletins générés [advisory only]
  const totalStudentsFinal = db.prepare(
    'SELECT COUNT(*) as cnt FROM enrollments WHERE academic_year_id = ? AND is_deleted = 0 AND is_expelled = 0'
  ).get(yearId)?.cnt || 0
  const bulletinsGenerated = db.prepare(
    'SELECT COUNT(*) as cnt FROM report_card_snapshots WHERE academic_year_id = ? AND semester = ?'
  ).get(yearId, finalSemester)?.cnt || 0
  gates.push({
    key: 'bulletins_generated',
    label: 'Bulletins générés',
    status: totalStudentsFinal > 0 && bulletinsGenerated >= totalStudentsFinal ? 'ok' : 'warning',
    detail: `${bulletinsGenerated}/${totalStudentsFinal} élèves`,
  })

  // Gate 3: exam results recorded for every cohort student [blocking only if mode != moyenne_only]
  const cohortLevels = db.prepare(
    'SELECT id, name, exam_name FROM levels WHERE is_exam_cohort = 1 AND exam_name IS NOT NULL'
  ).all()
  for (const level of cohortLevels) {
    const rule = db.prepare('SELECT mode FROM exam_passing_rules WHERE exam_type = ?').get(level.exam_name)
    const mode = rule?.mode || 'moyenne_only'
    if (mode === 'moyenne_only') {
      gates.push({
        key: `exam_results_${level.exam_name}`,
        label: `Résultats ${level.exam_name} (${level.name})`,
        status: 'ok',
        detail: 'Non requis pour ce mode',
      })
      continue
    }
    const cohortStudents = db.prepare(`
      SELECT COUNT(*) as cnt FROM enrollments e
      JOIN classrooms c ON c.id = e.classroom_id AND c.level_id = ? AND c.is_deleted = 0
      WHERE e.academic_year_id = ? AND e.is_deleted = 0 AND e.is_expelled = 0
    `).get(level.id, yearId)?.cnt || 0
    const recorded = db.prepare(`
      SELECT COUNT(*) as cnt FROM national_exam_results ner
      JOIN enrollments e ON e.student_id = ner.student_id AND e.academic_year_id = ner.academic_year_id
      JOIN classrooms c ON c.id = e.classroom_id AND c.level_id = ?
      WHERE ner.academic_year_id = ? AND ner.exam_type = ? AND ner.result IS NOT NULL AND e.is_deleted = 0 AND e.is_expelled = 0
    `).get(level.id, yearId, level.exam_name)?.cnt || 0
    gates.push({
      key: `exam_results_${level.exam_name}`,
      label: `Résultats ${level.exam_name} (${level.name})`,
      status: cohortStudents > 0 && recorded >= cohortStudents ? 'ok' : 'blocked',
      detail: `${recorded}/${cohortStudents} élèves`,
    })
  }

  // Gate 4: effectifs PDF downloaded today [blocking]
  const downloadedAt = db.prepare("SELECT value FROM app_settings WHERE key = 'effectifs_pdf_downloaded_at'").get()?.value
  const downloadedToday = downloadedAt && (Date.now() - new Date(downloadedAt).getTime()) < 24 * 60 * 60 * 1000
  gates.push({
    key: 'effectifs_pdf',
    label: "Résumé des effectifs téléchargé aujourd'hui",
    status: downloadedToday ? 'ok' : 'blocked',
    detail: downloadedAt ? `Dernier téléchargement : ${downloadedAt}` : 'Jamais téléchargé',
  })

  // Gate 5: successful sync from today [blocking]
  const syncedToday = hasSuccessfulFullSync(db, 1)
  gates.push({
    key: 'sync',
    label: "Synchronisation réussie aujourd'hui",
    status: syncedToday ? 'ok' : 'blocked',
    detail: syncedToday ? 'À jour' : 'Aucune synchronisation réussie aujourd\'hui',
  })

  const canProceed = gates.every(g => g.status !== 'blocked')
  return res.json({ gates, can_proceed: canProceed })
})

// ─── POST /api/promotion/preview/:academicYearId — Étape 3 verdicts ───────
// POST (not GET) because it accepts an overrides array in the body.
// Pure read -- computes but persists nothing.
router.post('/preview/:academicYearId', (req, res) => {
  const db = getDb()
  const yearId = req.params.academicYearId
  const overrides = req.body?.overrides || [] // [{ student_id, verdict, reason }]
  const overrideMap = new Map(overrides.map(o => [o.student_id, o]))

  const periodeCount = parseInt(db.prepare("SELECT value FROM app_settings WHERE key = 'periode_count'").get()?.value || '3')
  const passageCutoff = parseFloat(db.prepare("SELECT value FROM app_settings WHERE key = 'passage_cutoff'").get()?.value || '10')

  const rulesByExam = {}
  for (const r of db.prepare('SELECT exam_type, mode, min_moyenne FROM exam_passing_rules').all()) {
    rulesByExam[r.exam_type] = r
  }

  const classrooms = db.prepare(`
    SELECT c.*, l.name AS level_name, l.is_exam_cohort, l.exam_name, l.display_order, l.has_serie
    FROM classrooms c
    JOIN levels l ON l.id = c.level_id
    WHERE c.academic_year_id = ? AND c.is_deleted = 0
  `).all(yearId)

  const rows = []
  let excludedCount = 0
  const counts = { admis: 0, doublant: 0, graduated: 0, exclu: 0 }

  for (const classroom of classrooms) {
    const active = db.prepare(`
      SELECT s.id, s.full_name, s.matricule
      FROM students s
      JOIN enrollments e ON e.student_id = s.id AND e.classroom_id = ? AND e.academic_year_id = ?
        AND e.is_deleted = 0 AND e.is_expelled = 0
      WHERE s.is_deleted = 0
      ORDER BY s.full_name
    `).all(classroom.id, yearId)

    const excluded = db.prepare(`
      SELECT COUNT(*) as cnt FROM enrollments e
      WHERE e.classroom_id = ? AND e.academic_year_id = ? AND e.is_deleted = 0 AND e.is_expelled = 1
    `).get(classroom.id, yearId)?.cnt || 0
    excludedCount += excluded

    for (const student of active) {
      // Annual average = mean of every recorded semester_average, same
      // formula as the report card's annual_average (reportcards.js).
      const semAvgs = []
      for (let s = 1; s <= periodeCount; s++) {
        const ss = db.prepare(`
          SELECT semester_average FROM semester_summaries
          WHERE student_id = ? AND classroom_id = ? AND academic_year_id = ? AND semester = ?
        `).get(student.id, classroom.id, yearId, s)
        if (ss?.semester_average != null) semAvgs.push(ss.semester_average)
      }
      const annualAvg = semAvgs.length > 0
        ? parseFloat((semAvgs.reduce((a, b) => a + b, 0) / semAvgs.length).toFixed(2))
        : null

      let threshold = passageCutoff
      let admis = annualAvg !== null ? annualAvg >= threshold : false
      let examResult = null

      if (classroom.is_exam_cohort && classroom.exam_name) {
        const rule = rulesByExam[classroom.exam_name] || { mode: 'moyenne_only', min_moyenne: 10 }
        threshold = rule.min_moyenne
        examResult = db.prepare(`
          SELECT result, score FROM national_exam_results
          WHERE student_id = ? AND academic_year_id = ? AND exam_type = ?
        `).get(student.id, yearId, classroom.exam_name)

        const moyenneOk = annualAvg !== null && annualAvg >= threshold
        const examOk = examResult?.result === 'admis'
        if (rule.mode === 'moyenne_only') admis = moyenneOk
        else if (rule.mode === 'exam_only') admis = examOk
        else admis = moyenneOk && examOk
      }

      const borderline = annualAvg !== null && Math.abs(annualAvg - threshold) <= 0.5

      let verdict = admis ? 'admis' : 'doublant'
      let overrideReason = null
      const override = overrideMap.get(student.id)
      if (override) { verdict = override.verdict; overrideReason = override.reason || null }

      let target = null
      let graduated = false
      if (verdict === 'admis' || verdict === 'doublant') {
        target = resolveTarget(db, classroom, {
          id: classroom.level_id, name: classroom.level_name, has_serie: classroom.has_serie, display_order: classroom.display_order,
        }, verdict, yearId)
        if (!target && verdict === 'admis') graduated = true
      }

      if (graduated) counts.graduated++
      else if (verdict === 'exclu') counts.exclu++
      else counts[verdict] = (counts[verdict] || 0) + 1

      rows.push({
        student_id: student.id,
        full_name: student.full_name,
        matricule: student.matricule,
        source_classroom: classroom.label,
        source_level: classroom.level_name,
        annual_average: annualAvg,
        threshold,
        exam_result: examResult?.result || null,
        borderline,
        verdict,
        graduated,
        override_reason: overrideReason,
        target_level: graduated ? null : target?.level_name || null,
        target_classroom: graduated ? null : target?.label || null,
        target_is_new_level: target?.is_new_level || false,
      })
    }
  }

  return res.json({
    rows,
    summary: { ...counts, excluded_from_calc: excludedCount },
  })
})

module.exports = router
