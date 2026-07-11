// Shared by the checklist endpoint (Step 2, informational) and execute
// (Step 4, which re-validates server-side before touching anything --
// never trusts a stale client-side checklist).
function computeChecklist(db, yearId, hasSuccessfulFullSync) {
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

  return { gates, can_proceed: gates.every(g => g.status !== 'blocked') }
}

module.exports = { computeChecklist }
