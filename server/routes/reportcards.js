const express = require('express')
const router = express.Router()
const { getDb } = require('../db/init')
const { generateUUID } = require('../utils/uid')
const { requireAuth } = require('../middleware/requireAuth')
const { requirePermission } = require('../middleware/requirePermission')

router.use(requireAuth)

function getSchoolSections(db) {
  try { return JSON.parse(db.prepare("SELECT value FROM app_settings WHERE key = 'school_section_config'").get()?.value || '[]') }
  catch { return [] }
}

function getSectionName(sections, levelName, defaultName) {
  for (const s of sections) {
    if (s.level_from && s.level_to && s.name) {
      if (levelName >= s.level_from && levelName <= s.level_to) return s.name
    }
  }
  return defaultName
}

// ─── GET /api/report-cards/list/:classroomId/:semester — Existing snapshots ─
router.get('/list/:classroomId/:semester', requirePermission('reports.view'), (req, res) => {
  const db = getDb()
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value

  const snapshots = db.prepare(`
    SELECT rc.id, rc.snapshot_uid, rc.student_id, rc.generated_at, s.full_name, s.matricule
    FROM report_card_snapshots rc
    JOIN students s ON s.id = rc.student_id
    WHERE rc.classroom_id = ? AND rc.academic_year_id = ? AND rc.semester = ?
    ORDER BY s.full_name
  `).all(req.params.classroomId, yearId, req.params.semester)

  return res.json({ snapshots })
})

// ─── POST /api/report-cards/generate — Generate snapshots ───
// Uses 'reports.generate' — the code actually seeded in migration 003 ('reports.edit' never existed)
router.post('/generate', requirePermission('reports.generate'), (req, res) => {
  const db = getDb()
  const { classroom_id, semester, student_ids } = req.body
  if (!classroom_id || !semester) return res.status(400).json({ error: 'MISSING_FIELDS' })

  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  const year = db.prepare('SELECT label FROM academic_years WHERE id = ?').get(yearId)
  const classroom = db.prepare('SELECT c.*, l.name AS level_name FROM classrooms c JOIN levels l ON l.id = c.level_id WHERE c.id = ?').get(classroom_id)
  const config = db.prepare('SELECT * FROM school_config LIMIT 1').get()
  const sections = getSchoolSections(db)
  const sectionName = getSectionName(sections, classroom?.level_name, config?.school_name || 'ScolaDesk')
  const logoPath = db.prepare("SELECT value FROM app_settings WHERE key = 'school_logo_path'").get()?.value || null

  // Get all students or specific ones
  let studentQuery = `
    SELECT s.id, s.full_name, s.matricule, s.gender
    FROM students s
    JOIN enrollments e ON e.student_id = s.id AND e.classroom_id = ? AND e.is_deleted = 0
    WHERE s.is_deleted = 0
  `
  const studentParams = [classroom_id]
  if (student_ids?.length > 0) {
    studentQuery += ` AND s.id IN (${student_ids.map(() => '?').join(',')})`
    studentParams.push(...student_ids)
  }
  studentQuery += ' ORDER BY s.full_name'
  const students = db.prepare(studentQuery).all(...studentParams)

  const classSize = db.prepare('SELECT COUNT(*) as cnt FROM enrollments WHERE classroom_id = ? AND is_deleted = 0 AND is_expelled = 0').get(classroom_id)?.cnt || 0
  const periodeCount = parseInt(db.prepare("SELECT value FROM app_settings WHERE key = 'periode_count'").get()?.value || '3')

  // Load configs for auto-compute (once per generate call)
  let congCfg = { avg_floor: 10, felicitation_percentile: 20, tableau_top_n: 5 }
  try { const c = JSON.parse(db.prepare("SELECT value FROM app_settings WHERE key = 'congratulations_config'").get()?.value || ''); if (c) congCfg = c } catch {}

  const defaultRanges = [
    { min: 16, max: 20, text: 'Très Bien — Admis au trimestre suivant', pass: true },
    { min: 14, max: 15.99, text: 'Bien — Admis au trimestre suivant', pass: true },
    { min: 12, max: 13.99, text: 'Assez Bien — Admis au trimestre suivant', pass: true },
    { min: 10, max: 11.99, text: 'Passable — Admis au trimestre suivant', pass: true },
    { min: 8, max: 9.99, text: 'Insuffisant — Avertissement de passage', pass: false },
    { min: 0, max: 7.99, text: 'Très Insuffisant — Non admis', pass: false },
  ]
  let conseilRanges = defaultRanges
  try { const r = JSON.parse(db.prepare("SELECT value FROM app_settings WHERE key = 'conseil_decision_ranges'").get()?.value || '[]'); if (r.length) conseilRanges = r } catch {}

  const defaultConduite = parseFloat(db.prepare("SELECT value FROM app_settings WHERE key = 'default_conduite_score'").get()?.value || '18')
  const passageCutoff = parseFloat(db.prepare("SELECT value FROM app_settings WHERE key = 'passage_cutoff'").get()?.value || '10')

  const defaultAppScale = [
    { min: 16, max: 20, label: 'Très Bien' }, { min: 14, max: 15.99, label: 'Bien' },
    { min: 12, max: 13.99, label: 'Assez Bien' }, { min: 10, max: 11.99, label: 'Passable' },
    { min: 8, max: 9.99, label: 'Médiocre' }, { min: 0, max: 7.99, label: 'Faible' },
  ]
  let appScale = defaultAppScale
  try { const s = JSON.parse(db.prepare("SELECT value FROM app_settings WHERE key = 'appreciation_scale'").get()?.value || '[]'); if (s.length) appScale = s } catch {}
  function getAppreciation(avg) {
    if (avg === null || avg === undefined) return null
    return appScale.find(s => avg >= s.min && avg <= s.max)?.label || null
  }

  let generated = 0

  // For the last semester: pre-compute annual averages + annual rank for all students
  const annualAvgMap = {}
  const annualRankMap = {}
  if (parseInt(semester) === periodeCount) {
    for (const student of students) {
      const semAvgs = []
      for (let s = 1; s <= periodeCount; s++) {
        const ss = db.prepare('SELECT semester_average FROM semester_summaries WHERE student_id = ? AND classroom_id = ? AND academic_year_id = ? AND semester = ?')
          .get(student.id, classroom_id, yearId, s)
        if (ss?.semester_average != null) semAvgs.push(ss.semester_average)
      }
      annualAvgMap[student.id] = semAvgs.length > 0
        ? parseFloat((semAvgs.reduce((a, b) => a + b, 0) / semAvgs.length).toFixed(2))
        : null
    }
    // 1224 ranking on annual average
    for (const student of students) {
      const myAvg = annualAvgMap[student.id]
      if (myAvg === null) { annualRankMap[student.id] = null; continue }
      const rank = Object.values(annualAvgMap).filter(a => a !== null && a > myAvg).length + 1
      annualRankMap[student.id] = rank
    }
  }

  db.transaction(() => {
    // Delete existing snapshots for these students+semester (regenerate)
    for (const student of students) {
      db.prepare('DELETE FROM report_card_snapshots WHERE student_id = ? AND classroom_id = ? AND academic_year_id = ? AND semester = ?')
        .run(student.id, classroom_id, yearId, semester)
    }

    for (const student of students) {
      // All subjects for the classroom (always show even without grades)
      const allSubjects = classroom.serie_id
        ? db.prepare(`SELECT DISTINCT ls.subject_id, s.name AS subject_name, s.short_code, ls.coefficient
             FROM level_subjects ls JOIN subjects s ON s.id = ls.subject_id
             WHERE ls.level_id = ? AND ls.is_active = 1 AND (ls.serie_id = ? OR ls.serie_id IS NULL)
             ORDER BY s.name`).all(classroom.level_id, classroom.serie_id)
        : db.prepare(`SELECT ls.subject_id, s.name AS subject_name, s.short_code, ls.coefficient
             FROM level_subjects ls JOIN subjects s ON s.id = ls.subject_id
             WHERE ls.level_id = ? AND ls.is_active = 1 AND ls.serie_id IS NULL
             ORDER BY s.name`).all(classroom.level_id)

      // Subject averages (only exist if computed)
      const computedAvgs = db.prepare(`
        SELECT sa.*, sub.name AS subject_name, sub.short_code
        FROM subject_averages sa
        JOIN subjects sub ON sub.id = sa.subject_id
        WHERE sa.student_id = ? AND sa.classroom_id = ? AND sa.academic_year_id = ? AND sa.semester = ?
      `).all(student.id, classroom_id, yearId, semester)
      const avgBySubject = {}
      for (const a of computedAvgs) avgBySubject[a.subject_id] = a

      // Individual assessment scores for this student (one query for all subjects)
      const allScoreRows = db.prepare(`
        SELECT at.subject_id, at.assessment_type, at.sequence_number, at.max_score,
               acs.score, acs.is_absent
        FROM assessment_templates at
        LEFT JOIN assessment_scores acs ON acs.template_id = at.id AND acs.student_id = ? AND acs.is_deleted = 0
        WHERE at.classroom_id = ? AND at.academic_year_id = ? AND at.semester = ?
        ORDER BY at.subject_id, at.assessment_type, at.sequence_number
      `).all(student.id, classroom_id, yearId, semester)
      const scoresBySubject = {}
      for (const row of allScoreRows) {
        if (!scoresBySubject[row.subject_id]) scoresBySubject[row.subject_id] = { interrogation: [], devoir: [], composition: [] }
        const bucket = scoresBySubject[row.subject_id][row.assessment_type]
        if (bucket) bucket.push({ seq: row.sequence_number, score: row.score, is_absent: row.is_absent, max_score: row.max_score })
      }

      const subjectAvgs = allSubjects.map(sub => {
        const a = avgBySubject[sub.subject_id]
        return a ? { ...a } : {
          subject_id: sub.subject_id, subject_name: sub.subject_name, short_code: sub.short_code,
          coefficient: sub.coefficient, raw_average: null, weighted_average: null,
          subject_rank: null, class_highest_score: null, class_lowest_score: null, class_subject_average: null,
        }
      })

      // Semester summary
      const summary = db.prepare(`
        SELECT * FROM semester_summaries
        WHERE student_id = ? AND classroom_id = ? AND academic_year_id = ? AND semester = ?
      `).get(student.id, classroom_id, yearId, semester)

      // Auto-compute congratulations from rank + average
      const avg = summary?.semester_average ?? null
      const rank = summary?.class_rank ?? null
      const floor = congCfg.avg_floor ?? 10
      const percentileN = Math.max(1, Math.ceil(classSize * ((congCfg.felicitation_percentile ?? 20) / 100)))
      const topN = congCfg.tableau_top_n ?? 5
      const qualifies = avg !== null && avg >= floor
      const encouragement = qualifies ? 1 : 0
      const felicitation = qualifies && rank !== null && rank <= percentileN ? 1 : 0
      const tableauHonneur = qualifies && rank !== null && rank <= topN ? 1 : 0

      // Conseil decision: "Travail [Appréciation du trimestre]"
      const travailLabel = getAppreciation(avg)
      const conseilText = travailLabel ? `Travail ${travailLabel}` : null
      const conseilPass = avg !== null ? (avg >= passageCutoff ? 1 : 0) : null

      // Annual average + passage admis (last semester only)
      const annualAvg = annualAvgMap[student.id] ?? null
      const annualRank = annualRankMap[student.id] ?? null
      const passageAdmis = parseInt(semester) === periodeCount
        ? (annualAvg !== null ? annualAvg >= passageCutoff : null)
        : null

      // Upsert auto-computed fields — preserve manual sanctions (avertissement, blame)
      db.prepare(`
        INSERT INTO semester_decisions (student_id, classroom_id, academic_year_id, semester, felicitation, encouragement, tableau_honneur, conseil_decision, conseil_decision_pass)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(student_id, classroom_id, academic_year_id, semester) DO UPDATE SET
          felicitation = excluded.felicitation,
          encouragement = excluded.encouragement,
          tableau_honneur = excluded.tableau_honneur,
          conseil_decision = excluded.conseil_decision,
          conseil_decision_pass = excluded.conseil_decision_pass,
          updated_at = datetime('now')
      `).run(student.id, classroom_id, yearId, semester, felicitation, encouragement, tableauHonneur, conseilText, conseilPass)

      // Fetch full decision row (includes manually set sanctions)
      const decision = db.prepare(`
        SELECT * FROM semester_decisions
        WHERE student_id = ? AND classroom_id = ? AND academic_year_id = ? AND semester = ?
      `).get(student.id, classroom_id, yearId, semester)

      // Cross-semester summaries (for the bilan table)
      const crossSemesters = []
      for (let s = 1; s <= periodeCount; s++) {
        const ss = db.prepare(`
          SELECT semester_average, class_rank, class_size, class_highest_average, class_lowest_average
          FROM semester_summaries
          WHERE student_id = ? AND classroom_id = ? AND academic_year_id = ? AND semester = ?
        `).get(student.id, classroom_id, yearId, s)
        crossSemesters.push(ss || null)
      }

      // Compute totals for the bulletin
      let totalCoef = 0, totalMoyCoef = 0
      subjectAvgs.forEach(sa => {
        if (sa.raw_average !== null) {
          totalCoef += sa.coefficient
          totalMoyCoef += sa.weighted_average || 0
        }
      })

      const snapshot = {
        school: {
          name: config?.school_name || '',
          section_name: sectionName,
          director: config?.director_name || '',
          logo_path: logoPath,
        },
        academic_year: year?.label || '',
        semester: parseInt(semester),
        classroom: { label: classroom?.label, level: classroom?.level_name },
        class_size: classSize,
        student: {
          full_name: student.full_name,
          matricule: student.matricule,
          gender: student.gender,
        },
        subjects: subjectAvgs.map(sa => {
          const ss = scoresBySubject[sa.subject_id] || { interrogation: [], devoir: [], composition: [] }
          const norm = (s) => (s.is_absent || s.score === null) ? null : parseFloat((s.score / s.max_score * 20).toFixed(2))
          const validInterros = ss.interrogation.filter(i => !i.is_absent && i.score !== null)
          const interro_avg = validInterros.length > 0
            ? parseFloat((validInterros.reduce((acc, i) => acc + i.score / i.max_score * 20, 0) / validInterros.length).toFixed(2))
            : null
          return {
            name: sa.subject_name,
            short_code: sa.short_code,
            interro_avg,
            devoirs: ss.devoir.map(norm),
            compositions: ss.composition.map(norm),
            raw_average: sa.raw_average,
            coefficient: sa.coefficient,
            weighted_average: sa.weighted_average,
            rank: sa.subject_rank,
            class_highest: sa.class_highest_score,
            class_lowest: sa.class_lowest_score,
            appreciation: getAppreciation(sa.raw_average),
          }
        }),
        totals: { total_coefficients: totalCoef, total_weighted_points: totalMoyCoef },
        summary: summary ? {
          semester_average: summary.semester_average,
          class_rank: summary.class_rank,
          class_size: summary.class_size,
          mention: summary.mention,
          class_highest: summary.class_highest_average,
          class_lowest: summary.class_lowest_average,
          class_overall: summary.class_overall_average,
        } : null,
        cross_semesters: crossSemesters.map((cs, i) => cs ? {
          semester: i + 1,
          average: cs.semester_average,
          rank: cs.class_rank,
          class_size: cs.class_size,
          highest: cs.class_highest_average,
          lowest: cs.class_lowest_average,
        } : { semester: i + 1, average: null, rank: null, class_size: null, highest: null, lowest: null }),
        annual_average: annualAvg,
        annual_rank: annualRank,
        passage_admis: passageAdmis,
        passage_cutoff: passageCutoff,
        decision: decision ? {
          conduite_score: decision.conduite_score ?? defaultConduite,
          avertissement: decision.avertissement === 1,
          blame: decision.blame === 1,
          felicitation: decision.felicitation === 1,
          encouragement: decision.encouragement === 1,
          tableau_honneur: decision.tableau_honneur === 1,
          conseil_decision: decision.conseil_decision,
          conseil_decision_pass: decision.conseil_decision_pass === 1,
        } : { conduite_score: defaultConduite },
      }

      db.prepare(`
        INSERT INTO report_card_snapshots (snapshot_uid, student_id, classroom_id, academic_year_id, semester, snapshot_data, generated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(generateUUID(), student.id, classroom_id, yearId, semester, JSON.stringify(snapshot), req.user.id)

      generated++
    }
  })()

  return res.json({ success: true, generated })
})

// ─── GET /api/report-cards/view/:snapshotId — Single report card data ─
router.get('/view/:snapshotId', requirePermission('reports.view'), (req, res) => {
  const db = getDb()
  const row = db.prepare('SELECT * FROM report_card_snapshots WHERE id = ?').get(req.params.snapshotId)
  if (!row) return res.status(404).json({ error: 'NOT_FOUND' })

  let snapshot
  try { snapshot = JSON.parse(row.snapshot_data) } catch { return res.status(500).json({ error: 'PARSE_ERROR' }) }

  return res.json({ snapshot, generated_at: row.generated_at })
})

module.exports = router
