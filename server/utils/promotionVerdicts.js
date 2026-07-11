const { resolveTarget } = require('./promotionMapping')

// Shared by preview (Step 3) and execute (Step 4) so the verdict the admin
// previews is exactly what gets applied -- no risk of the two computations
// drifting apart over time.
//
// overrideMap: Map<student_id, { verdict, reason }>
// Returns { rows, summary } where each row carries both display fields
// (labels) and the raw ids execute needs to actually create rows.
function computeVerdicts(db, yearId, overrideMap = new Map()) {
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

    excludedCount += db.prepare(`
      SELECT COUNT(*) as cnt FROM enrollments e
      WHERE e.classroom_id = ? AND e.academic_year_id = ? AND e.is_deleted = 0 AND e.is_expelled = 1
    `).get(classroom.id, yearId)?.cnt || 0

    const sourceLevel = {
      id: classroom.level_id, name: classroom.level_name,
      has_serie: classroom.has_serie, display_order: classroom.display_order,
    }

    for (const student of active) {
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
        target = resolveTarget(db, classroom, sourceLevel, verdict, yearId)
        if (!target && verdict === 'admis') graduated = true
      }

      if (graduated) counts.graduated++
      else if (verdict === 'exclu') counts.exclu++
      else counts[verdict] = (counts[verdict] || 0) + 1

      rows.push({
        student_id: student.id,
        full_name: student.full_name,
        matricule: student.matricule,
        source_classroom_id: classroom.id,
        source_classroom: classroom.label,
        source_level: classroom.level_name,
        annual_average: annualAvg,
        threshold,
        exam_result: examResult?.result || null,
        borderline,
        verdict,
        graduated,
        override_reason: overrideReason,
        target, // { level_id, level_name, serie_id, label, is_new_level } or null
      })
    }
  }

  return { rows, summary: { ...counts, excluded_from_calc: excludedCount } }
}

module.exports = { computeVerdicts }
