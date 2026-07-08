// Grade migration on classroom transfer.
//
// assessment_scores are keyed by template_id, and templates belong to a
// classroom — so moving a student's enrollment alone strands their grades on
// the old classroom's templates (empty grade table + empty bulletin in the
// new class). This re-points each score to the matching template in the new
// classroom (same subject + semester + type + sequence — always matches when
// both classrooms share a level), moves semester_decisions (conduite,
// sanctions) with the student, and clears the student's stale computed rows
// so the next compute/bulletin generation reflects the new classroom.
//
// Cross-level transfers: scores whose subject/template has no equivalent in
// the target classroom stay on the old templates (reported as `unmatched`).
function migrateStudentGrades(db, studentId, fromClassroomId, toClassroomId, yearId) {
  if (!fromClassroomId || !toClassroomId || fromClassroomId === toClassroomId) {
    return { moved: 0, unmatched: 0 }
  }

  const oldTemplates = db.prepare(`
    SELECT id, subject_id, semester, assessment_type, sequence_number
    FROM assessment_templates
    WHERE classroom_id = ? AND academic_year_id = ?
  `).all(fromClassroomId, yearId)

  const findTarget = db.prepare(`
    SELECT id FROM assessment_templates
    WHERE classroom_id = ? AND academic_year_id = ? AND subject_id = ?
      AND semester = ? AND assessment_type = ? AND sequence_number = ?
  `)
  const getScore = db.prepare(
    'SELECT id FROM assessment_scores WHERE template_id = ? AND student_id = ?'
  )
  const deleteScore = db.prepare('DELETE FROM assessment_scores WHERE id = ?')
  const moveScore = db.prepare('UPDATE assessment_scores SET template_id = ? WHERE id = ?')

  let moved = 0
  let unmatched = 0
  for (const t of oldTemplates) {
    const score = getScore.get(t.id, studentId)
    if (!score) continue
    const target = findTarget.get(toClassroomId, yearId, t.subject_id, t.semester, t.assessment_type, t.sequence_number)
    if (!target) { unmatched++; continue }
    // UNIQUE(template_id, student_id) — clear any leftover row on the target
    const existing = getScore.get(target.id, studentId)
    if (existing) deleteScore.run(existing.id)
    moveScore.run(target.id, score.id)
    moved++
  }

  // Conseil de classe records (conduite, sanctions) follow the student.
  // UNIQUE(student, classroom, year, semester) — drop target duplicates first.
  const decisions = db.prepare(
    'SELECT id, semester FROM semester_decisions WHERE student_id = ? AND classroom_id = ? AND academic_year_id = ?'
  ).all(studentId, fromClassroomId, yearId)
  for (const d of decisions) {
    db.prepare(
      'DELETE FROM semester_decisions WHERE student_id = ? AND classroom_id = ? AND academic_year_id = ? AND semester = ?'
    ).run(studentId, toClassroomId, yearId, d.semester)
    db.prepare('UPDATE semester_decisions SET classroom_id = ? WHERE id = ?').run(toClassroomId, d.id)
  }

  // Clear the student's stale computed rows on BOTH classrooms — they get
  // rebuilt (with correct ranks) at the next compute / bulletin generation.
  db.prepare(
    'DELETE FROM subject_averages WHERE student_id = ? AND academic_year_id = ? AND classroom_id IN (?, ?)'
  ).run(studentId, yearId, fromClassroomId, toClassroomId)
  db.prepare(
    'DELETE FROM semester_summaries WHERE student_id = ? AND academic_year_id = ? AND classroom_id IN (?, ?)'
  ).run(studentId, yearId, fromClassroomId, toClassroomId)

  return { moved, unmatched }
}

module.exports = { migrateStudentGrades }
