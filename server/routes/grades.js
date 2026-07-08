const express = require('express')
const router = express.Router()
const XLSX = require('xlsx')
const archiver = require('archiver')
const { getDb } = require('../db/init')
const { requireAuth } = require('../middleware/requireAuth')
const { requirePermission } = require('../middleware/requirePermission')

router.use(requireAuth)

const TYPE_LABELS = { interrogation: 'Interro', devoir: 'Devoir', composition: 'Compo', tp: 'TP', oral: 'Oral' }
const templateLabel = (t) => `${TYPE_LABELS[t.assessment_type] || t.assessment_type} ${t.sequence_number}`

// Fetch the ordered assessment templates for a class+subject+semester
function getTemplates(db, classroomId, subjectId, yearId, semester) {
  return db.prepare(`
    SELECT id, assessment_type, sequence_number, max_score, weight
    FROM assessment_templates
    WHERE classroom_id = ? AND subject_id = ? AND academic_year_id = ? AND semester = ?
    ORDER BY
      CASE assessment_type WHEN 'interrogation' THEN 1 WHEN 'devoir' THEN 2 WHEN 'composition' THEN 3 WHEN 'tp' THEN 4 WHEN 'oral' THEN 5 END,
      sequence_number
  `).all(classroomId, subjectId, yearId, semester)
}

// Compute subject raw average:
//   moy_interro = avg of all non-absent interrogations (normalized /20), counts as 1 slot
//   each non-absent devoir/composition counts as 1 slot individually (normalized /20)
//   rawAvg = sum(slots) / count(slots)
function computeRawAverage(templates, getScore) {
  const interros = templates.filter(t => t.assessment_type === 'interrogation')
  const others = templates.filter(t => t.assessment_type !== 'interrogation')

  let interroSum = 0, interroCount = 0
  for (const t of interros) {
    const s = getScore(t)
    if (s && s.score !== null && s.is_absent !== 1) {
      interroSum += (s.score / t.max_score) * 20
      interroCount++
    }
  }

  const slots = []
  if (interroCount > 0) slots.push(interroSum / interroCount)
  for (const t of others) {
    const s = getScore(t)
    if (s && s.score !== null && s.is_absent !== 1) {
      slots.push((s.score / t.max_score) * 20)
    }
  }

  return slots.length > 0 ? parseFloat((slots.reduce((a, b) => a + b, 0) / slots.length).toFixed(2)) : null
}

// Subjects of a classroom (respects serie). Returns [{ subject_id, subject_name }] sorted A-Z.
function getClassroomSubjects(db, classroomId) {
  const classroom = db.prepare('SELECT level_id, serie_id FROM classrooms WHERE id = ?').get(classroomId)
  if (!classroom) return []
  return classroom.serie_id
    ? db.prepare(`SELECT DISTINCT ls.subject_id, s.name AS subject_name, ls.coefficient FROM level_subjects ls JOIN subjects s ON s.id = ls.subject_id
         WHERE ls.level_id = ? AND ls.is_active = 1 AND (ls.serie_id = ? OR ls.serie_id IS NULL) ORDER BY s.name`).all(classroom.level_id, classroom.serie_id)
    : db.prepare(`SELECT ls.subject_id, s.name AS subject_name, ls.coefficient FROM level_subjects ls JOIN subjects s ON s.id = ls.subject_id
         WHERE ls.level_id = ? AND ls.is_active = 1 AND ls.serie_id IS NULL ORDER BY s.name`).all(classroom.level_id)
}

// Teacher assigned to a class+subject for the year, or 'NA'
function getTeacherName(db, classroomId, subjectId, yearId) {
  const row = db.prepare(`
    SELECT t.full_name FROM teacher_schedule ts JOIN teachers t ON t.id = ts.teacher_id
    WHERE ts.classroom_id = ? AND ts.subject_id = ? AND ts.academic_year_id = ? LIMIT 1
  `).get(classroomId, subjectId, yearId)
  return row?.full_name || 'NA'
}

const cleanFilePart = (s) => (s || '').toString().replace(/[^a-zA-Z0-9À-ÿ]+/g, '-').replace(/^-+|-+$/g, '') || 'NA'

// Build one xlsx buffer for a class+subject+semester. Returns null if no templates.
// Sheet "Notes" = student rows (A-Z) + grade columns; hidden "_meta" = ids for import.
function buildSheetWorkbook(db, ctx) {
  const { classroomId, subjectId, semester, yearId, className, subjectName, teacherName, yearLabel } = ctx
  const templates = getTemplates(db, classroomId, subjectId, yearId, semester)
  if (templates.length === 0) return null

  const students = db.prepare(`
    SELECT s.id, s.full_name, s.matricule FROM students s
    JOIN enrollments e ON e.student_id = s.id AND e.classroom_id = ? AND e.is_deleted = 0
    WHERE s.is_deleted = 0 ORDER BY s.full_name
  `).all(classroomId)

  const scoreMap = {}
  const scoreRows = db.prepare(`
    SELECT template_id, student_id, score, is_absent FROM assessment_scores
    WHERE template_id IN (${templates.map(() => '?').join(',')}) AND is_deleted = 0
  `).all(...templates.map(t => t.id))
  scoreRows.forEach(r => { scoreMap[`${r.template_id}_${r.student_id}`] = r })

  const headers = ['Nom complet', 'Matricule', ...templates.map(t => `${templateLabel(t)} /${t.max_score}`)]
  const data = [headers]
  for (const st of students) {
    const row = [st.full_name, st.matricule || '']
    for (const t of templates) {
      const sc = scoreMap[`${t.id}_${st.id}`]
      row.push(sc ? (sc.is_absent === 1 ? 'ABS' : (sc.score ?? '')) : '')
    }
    data.push(row)
  }

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = headers.map((h, i) => ({ wch: i === 0 ? 26 : (i === 1 ? 20 : Math.max(h.length + 1, 10)) }))
  XLSX.utils.book_append_sheet(wb, ws, 'Notes')

  // Hidden meta sheet drives import even if the file is renamed
  const meta = XLSX.utils.aoa_to_sheet([
    ['year_id', yearId], ['classroom_id', classroomId], ['subject_id', subjectId], ['semester', semester],
    ['annee', yearLabel || ''], ['classe', className || ''], ['matiere', subjectName || ''], ['enseignant', teacherName || ''],
  ])
  XLSX.utils.book_append_sheet(wb, meta, '_meta')
  wb.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 2 }] } // _meta very-hidden

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

function getAppreciationScale(db) {
  const raw = db.prepare("SELECT value FROM app_settings WHERE key = 'appreciation_scale'").get()?.value
  try { return JSON.parse(raw) } catch { return [] }
}

function getAppreciation(avg, scale) {
  if (avg === null || avg === undefined) return ''
  for (const s of scale) {
    if (avg >= s.min && avg <= s.max) return s.label
  }
  return ''
}

function computeRanking(items) {
  const sorted = [...items].filter(i => i.average !== null).sort((a, b) => b.average - a.average)
  let rank = 1
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i].average < sorted[i - 1].average) rank = i + 1
    sorted[i].rank = rank
    sorted[i].rank_suffix = (i > 0 && sorted[i].average === sorted[i - 1].average) ? 'ex' : ''
  }
  const rankMap = {}
  sorted.forEach(s => { rankMap[s.student_id] = { rank: s.rank, suffix: s.rank_suffix } })
  return rankMap
}

// ─── GET /api/grades/selectors — Classrooms + subjects for picker ─
router.get('/selectors', requirePermission('grades.view'), (req, res) => {
  const db = getDb()
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  const periodeCount = parseInt(db.prepare("SELECT value FROM app_settings WHERE key = 'periode_count'").get()?.value || '3')

  const classrooms = db.prepare(`
    SELECT c.id, c.label, c.level_id, l.name AS level_name
    FROM classrooms c JOIN levels l ON l.id = c.level_id
    WHERE c.academic_year_id = ? AND c.is_deleted = 0
    ORDER BY l.display_order, c.label
  `).all(yearId || 0)

  const periodeType = db.prepare("SELECT value FROM app_settings WHERE key = 'periode_type'").get()?.value || 'trimestre'
  return res.json({ classrooms, periode_count: periodeCount, periode_type: periodeType, academic_year_id: yearId })
})

// ─── GET /api/grades/subjects/:classroomId — Subjects for a classroom ─
// Respects serie_id: shows subjects for the classroom's serie, or common subjects (serie_id IS NULL)
router.get('/subjects/:classroomId', requirePermission('grades.view'), (req, res) => {
  const db = getDb()
  const classroom = db.prepare('SELECT level_id, serie_id FROM classrooms WHERE id = ?').get(req.params.classroomId)
  if (!classroom) return res.status(404).json({ error: 'NOT_FOUND' })

  let subjects
  if (classroom.serie_id) {
    // Level with serie: get serie-specific subjects + common subjects (serie_id IS NULL)
    subjects = db.prepare(`
      SELECT ls.subject_id, s.name AS subject_name, s.short_code, ls.coefficient
      FROM level_subjects ls
      JOIN subjects s ON s.id = ls.subject_id
      WHERE ls.level_id = ? AND ls.is_active = 1 AND (ls.serie_id = ? OR ls.serie_id IS NULL)
      ORDER BY s.name
    `).all(classroom.level_id, classroom.serie_id)
  } else {
    // Level without serie: get subjects with serie_id IS NULL
    subjects = db.prepare(`
      SELECT ls.subject_id, s.name AS subject_name, s.short_code, ls.coefficient
      FROM level_subjects ls
      JOIN subjects s ON s.id = ls.subject_id
      WHERE ls.level_id = ? AND ls.is_active = 1 AND ls.serie_id IS NULL
      ORDER BY s.name
    `).all(classroom.level_id)
  }

  return res.json({ subjects })
})

// ─── GET /api/grades/:classroomId/:subjectId/:semester — Full grade table ─
router.get('/:classroomId/:subjectId/:semester', requirePermission('grades.view'), (req, res) => {
  const db = getDb()
  const { classroomId, subjectId, semester } = req.params
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  const scale = getAppreciationScale(db)

  // Get students in this classroom
  const students = db.prepare(`
    SELECT s.id AS student_id, s.full_name, s.matricule
    FROM students s
    JOIN enrollments e ON e.student_id = s.id AND e.classroom_id = ? AND e.is_deleted = 0
    WHERE s.is_deleted = 0
    ORDER BY s.full_name
  `).all(classroomId)

  // Get assessment templates for this class+subject+semester
  const templates = db.prepare(`
    SELECT id, assessment_type, sequence_number, max_score, weight, label
    FROM assessment_templates
    WHERE classroom_id = ? AND subject_id = ? AND academic_year_id = ? AND semester = ?
    ORDER BY
      CASE assessment_type WHEN 'interrogation' THEN 1 WHEN 'devoir' THEN 2 WHEN 'composition' THEN 3 WHEN 'tp' THEN 4 WHEN 'oral' THEN 5 END,
      sequence_number
  `).all(classroomId, subjectId, yearId, semester)

  // Get all existing scores
  const scoreRows = db.prepare(`
    SELECT template_id, student_id, score, is_absent
    FROM assessment_scores
    WHERE template_id IN (${templates.map(() => '?').join(',')}) AND is_deleted = 0
  `).all(...templates.map(t => t.id))

  const scoreMap = {}
  scoreRows.forEach(s => { scoreMap[`${s.template_id}_${s.student_id}`] = s })

  // Get coefficient (respect serie_id)
  const classroom = db.prepare('SELECT level_id, serie_id FROM classrooms WHERE id = ?').get(classroomId)
  let levelSubject
  if (classroom?.serie_id) {
    levelSubject = db.prepare('SELECT coefficient FROM level_subjects WHERE level_id = ? AND subject_id = ? AND is_active = 1 AND (serie_id = ? OR serie_id IS NULL) ORDER BY serie_id DESC LIMIT 1').get(classroom.level_id, subjectId, classroom.serie_id)
  } else {
    levelSubject = db.prepare('SELECT coefficient FROM level_subjects WHERE level_id = ? AND subject_id = ? AND is_active = 1 AND serie_id IS NULL').get(classroom?.level_id, subjectId)
  }
  const coefficient = levelSubject?.coefficient || 1

  // Build rows with computed columns
  const rows = students.map(student => {
    const scores = {}
    let totalGraded = 0

    templates.forEach(t => {
      const key = `${t.id}_${student.student_id}`
      const existing = scoreMap[key]
      scores[t.id] = {
        template_id: t.id,
        score: existing?.score ?? null,
        is_absent: existing?.is_absent === 1,
      }
      if (existing && (existing.score !== null || existing.is_absent === 1)) totalGraded++
    })

    // Compute per-type display averages and overall average
    const byType = {}
    templates.forEach(t => {
      if (!byType[t.assessment_type]) byType[t.assessment_type] = { total: 0, count: 0, max: t.max_score }
      const s = scores[t.id]
      if (s.score !== null && !s.is_absent) {
        byType[t.assessment_type].total += s.score
        byType[t.assessment_type].count++
      }
    })
    const typeAverages = {}
    for (const [type, data] of Object.entries(byType)) {
      typeAverages[type] = data.count > 0 ? parseFloat(((data.total / data.count) * (data.max === 20 ? 1 : 20 / data.max)).toFixed(2)) : null
    }

    const average = computeRawAverage(templates, t => scores[t.id])
    const moyCoef = average !== null ? parseFloat((average * coefficient).toFixed(2)) : null

    return {
      student_id: student.student_id,
      full_name: student.full_name,
      matricule: student.matricule,
      scores,
      type_averages: typeAverages,
      average,
      coefficient,
      moy_coef: moyCoef,
      appreciation: getAppreciation(average, scale),
      graded: totalGraded,
      total_assessments: templates.length,
    }
  })

  // Compute ranking
  const rankMap = computeRanking(rows)
  rows.forEach(r => {
    const rk = rankMap[r.student_id]
    r.rank = rk?.rank || null
    r.rank_suffix = rk?.suffix || ''
  })

  // Class stats
  const validAverages = rows.filter(r => r.average !== null).map(r => r.average)
  const classStats = {
    class_average: validAverages.length > 0 ? parseFloat((validAverages.reduce((a, b) => a + b, 0) / validAverages.length).toFixed(2)) : null,
    highest: validAverages.length > 0 ? Math.max(...validAverages) : null,
    lowest: validAverages.length > 0 ? Math.min(...validAverages) : null,
    graded_count: rows.reduce((sum, r) => sum + r.graded, 0),
    total_count: rows.reduce((sum, r) => sum + r.total_assessments, 0),
  }

  return res.json({ templates, rows, class_stats: classStats, coefficient, appreciation_scale: scale })
})

// ─── POST /api/grades/batch — Save scores ───────────────────
router.post('/batch', requirePermission('grades.edit'), (req, res) => {
  const { scores } = req.body
  if (!scores || !Array.isArray(scores)) return res.status(400).json({ error: 'MISSING_FIELDS' })

  const db = getDb()
  const upsert = db.prepare(`
    INSERT INTO assessment_scores (template_id, student_id, score, is_absent, entered_by)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(template_id, student_id) DO UPDATE SET
      score = excluded.score, is_absent = excluded.is_absent,
      entered_by = excluded.entered_by, entered_at = datetime('now'), is_deleted = 0
  `)
  const getMaxScore = db.prepare('SELECT max_score FROM assessment_templates WHERE id = ?')

  let saved = 0
  const errors = []
  db.transaction(() => {
    for (const s of scores) {
      if (!s.template_id || !s.student_id) continue
      if (s.is_absent) {
        upsert.run(s.template_id, s.student_id, null, 1, req.user.id)
        saved++
        continue
      }
      if (s.score !== null && s.score !== undefined) {
        const tpl = getMaxScore.get(s.template_id)
        if (!tpl) continue
        const num = parseFloat(s.score)
        if (isNaN(num) || num < 0 || num > tpl.max_score) {
          errors.push({ template_id: s.template_id, student_id: s.student_id, reason: `score ${s.score} hors barème (0-${tpl.max_score})` })
          continue
        }
        upsert.run(s.template_id, s.student_id, num, 0, req.user.id)
      } else {
        upsert.run(s.template_id, s.student_id, null, 0, req.user.id)
      }
      saved++
    }
  })()

  return res.json({ success: true, saved, errors })
})

// ─── GET /api/grades/sheet-options — Classes + semesters for bulk download ─
router.get('/sheet-options', requirePermission('grades.view'), (req, res) => {
  const db = getDb()
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  const periodeCount = parseInt(db.prepare("SELECT value FROM app_settings WHERE key = 'periode_count'").get()?.value || '3')
  const classrooms = db.prepare(`
    SELECT c.id, c.label, l.name AS level_name, l.display_order
    FROM classrooms c JOIN levels l ON l.id = c.level_id
    WHERE c.academic_year_id = ? AND c.is_deleted = 0
    ORDER BY l.display_order, c.label
  `).all(yearId || 0)
  return res.json({ classrooms, periode_count: periodeCount })
})

// ─── POST /api/grades/bulk-sheets — ZIP of fiches (1 file per class×subject×semester) ─
// body: { semesters: [1,2], classroom_ids: [3,4] }
router.post('/bulk-sheets', requirePermission('grades.view'), (req, res) => {
  const db = getDb()
  const { semesters, classroom_ids } = req.body
  if (!Array.isArray(semesters) || !semesters.length || !Array.isArray(classroom_ids) || !classroom_ids.length) {
    return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Sélectionnez au moins un trimestre et une classe' })
  }

  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  const yearLabel = db.prepare('SELECT label FROM academic_years WHERE id = ?').get(yearId)?.label || ''
  const yearTag = cleanFilePart(yearLabel)

  // Pre-build all file buffers so we can fail cleanly with JSON if nothing is generated
  const files = []
  for (const cid of classroom_ids) {
    const classroom = db.prepare('SELECT label FROM classrooms WHERE id = ? AND is_deleted = 0').get(cid)
    if (!classroom) continue
    const subjects = getClassroomSubjects(db, cid)
    for (const sem of semesters) {
      for (const sub of subjects) {
        const teacherName = getTeacherName(db, cid, sub.subject_id, yearId)
        const buf = buildSheetWorkbook(db, {
          classroomId: cid, subjectId: sub.subject_id, semester: sem, yearId,
          className: classroom.label, subjectName: sub.subject_name, teacherName, yearLabel,
        })
        if (!buf) continue
        const name = `${yearTag}_${cleanFilePart(classroom.label)}_${cleanFilePart(sub.subject_name)}_${cleanFilePart(teacherName)}_T${sem}.xlsx`
        files.push({ name, buf })
      }
    }
  }

  if (files.length === 0) return res.status(400).json({ error: 'NO_SHEETS', message: 'Aucune fiche à générer (évaluations non configurées ?)' })

  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="fiches_notes_${yearTag}.zip"`)
  const archive = archiver('zip', { zlib: { level: 9 } })
  archive.on('error', () => { try { res.status(500).end() } catch { /* already streaming */ } })
  archive.pipe(res)
  for (const f of files) archive.append(f.buf, { name: f.name })
  archive.finalize()
})

// ─── POST /api/grades/import-sheet — Import one filled fiche (meta-driven) ─
router.post('/import-sheet', express.raw({ type: '*/*', limit: '10mb' }), requirePermission('grades.edit'), (req, res) => {
  try {
    const db = getDb()
    const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value

    let wb
    try { wb = XLSX.read(req.body) } catch { return res.status(400).json({ error: 'BAD_FILE', message: 'Fichier illisible' }) }

    const metaSheet = wb.Sheets['_meta']
    if (!metaSheet) return res.status(400).json({ error: 'NO_META', message: 'Fichier non reconnu — utilisez une fiche générée par le système' })
    const meta = {}
    XLSX.utils.sheet_to_json(metaSheet, { header: 1 }).forEach(([k, v]) => { if (k) meta[k] = v })

    const classroomId = parseInt(meta.classroom_id)
    const subjectId = parseInt(meta.subject_id)
    const semester = parseInt(meta.semester)
    if (!classroomId || !subjectId || !semester) return res.status(400).json({ error: 'BAD_META', message: 'Métadonnées de la fiche invalides' })

    if (parseInt(meta.year_id) !== parseInt(yearId)) {
      return res.status(400).json({ error: 'WRONG_YEAR', message: `Cette fiche concerne une autre année scolaire (${meta.annee || meta.year_id})` })
    }

    const classroom = db.prepare('SELECT label FROM classrooms WHERE id = ? AND is_deleted = 0').get(classroomId)
    if (!classroom) return res.status(400).json({ error: 'NO_CLASS', message: 'Classe introuvable' })
    const subject = db.prepare('SELECT name FROM subjects WHERE id = ?').get(subjectId)

    const templates = getTemplates(db, classroomId, subjectId, yearId, semester)
    if (templates.length === 0) return res.status(400).json({ error: 'NO_TEMPLATES', message: 'Aucune évaluation configurée' })
    const labelToTemplate = {}
    templates.forEach(t => { labelToTemplate[templateLabel(t).toLowerCase()] = t })

    const students = db.prepare(`
      SELECT s.id, s.full_name, s.matricule FROM students s
      JOIN enrollments e ON e.student_id = s.id AND e.classroom_id = ? AND e.is_deleted = 0
      WHERE s.is_deleted = 0
    `).all(classroomId)
    const byMatricule = {}, byName = {}
    students.forEach(s => {
      if (s.matricule) byMatricule[s.matricule.trim().toLowerCase()] = s.id
      byName[s.full_name.trim().toLowerCase()] = s.id
    })

    const notesSheet = wb.Sheets['Notes'] || wb.Sheets[wb.SheetNames.find(n => n !== '_meta')]
    const rows = XLSX.utils.sheet_to_json(notesSheet)
    const baseLabel = (key) => key.replace(/\s*\/\s*\d+\s*$/, '').trim().toLowerCase()

    const upsert = db.prepare(`
      INSERT INTO assessment_scores (template_id, student_id, score, is_absent, entered_by)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(template_id, student_id) DO UPDATE SET
        score = excluded.score, is_absent = excluded.is_absent,
        entered_by = excluded.entered_by, entered_at = datetime('now'), is_deleted = 0
    `)

    const errors = []
    let saved = 0, matched = 0
    db.transaction(() => {
      rows.forEach((row, i) => {
        const matricule = (row['Matricule'] || '').toString().trim().toLowerCase()
        const name = (row['Nom complet'] || '').toString().trim().toLowerCase()
        const studentId = byMatricule[matricule] || byName[name]
        if (!studentId) { errors.push({ row: i + 2, message: `Élève introuvable: ${row['Nom complet'] || row['Matricule'] || '?'}` }); return }
        matched++
        for (const [key, val] of Object.entries(row)) {
          const tpl = labelToTemplate[baseLabel(key)]
          if (!tpl) continue
          const raw = (val ?? '').toString().trim().toUpperCase()
          if (raw === '') continue
          if (raw === 'ABS' || raw === 'A') { upsert.run(tpl.id, studentId, null, 1, req.user.id); saved++; continue }
          const num = parseFloat(raw.replace(',', '.'))
          if (isNaN(num)) { errors.push({ row: i + 2, message: `Valeur invalide "${val}" (${key})` }); continue }
          if (num < 0 || num > tpl.max_score) { errors.push({ row: i + 2, message: `Note hors barème: ${num} (max ${tpl.max_score})` }); continue }
          upsert.run(tpl.id, studentId, num, 0, req.user.id)
          saved++
        }
      })
    })()

    return res.json({
      success: true, saved, matched, total_rows: rows.length, errors,
      classe: classroom.label, matiere: subject?.name || meta.matiere, semester, enseignant: meta.enseignant || '',
    })
  } catch (err) {
    console.error('[GRADES IMPORT SHEET]', err)
    return res.status(500).json({ error: 'PARSE_ERROR', message: 'Impossible de lire le fichier' })
  }
})

// ─── POST /api/grades/compute/:classroomId/:semester — Compute averages ─
router.post('/compute/:classroomId/:semester', requirePermission('grades.edit'), (req, res) => {
  const db = getDb()
  const { classroomId, semester } = req.params
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  const scale = getAppreciationScale(db)

  const classroom = db.prepare('SELECT level_id, serie_id FROM classrooms WHERE id = ? AND is_deleted = 0').get(classroomId)
  if (!classroom) return res.status(404).json({ error: 'NOT_FOUND' })

  // Expelled students are excluded — keeps class_rank/class_size consistent
  // with report card snapshots (which already exclude is_expelled)
  const students = db.prepare(`
    SELECT s.id AS student_id FROM students s
    JOIN enrollments e ON e.student_id = s.id AND e.classroom_id = ? AND e.is_deleted = 0 AND e.is_expelled = 0
    WHERE s.is_deleted = 0
  `).all(classroomId)

  const levelSubjects = classroom.serie_id
    ? db.prepare('SELECT subject_id, coefficient FROM level_subjects WHERE level_id = ? AND is_active = 1 AND (serie_id = ? OR serie_id IS NULL)').all(classroom.level_id, classroom.serie_id)
    : db.prepare('SELECT subject_id, coefficient FROM level_subjects WHERE level_id = ? AND is_active = 1 AND serie_id IS NULL').all(classroom.level_id)

  const classSize = students.length

  // Bulk-fetch all templates for this classroom+semester (1 query instead of N×S)
  const allTemplates = db.prepare(`
    SELECT id, subject_id, assessment_type, max_score, weight FROM assessment_templates
    WHERE classroom_id = ? AND academic_year_id = ? AND semester = ?
  `).all(classroomId, yearId, semester)

  const templatesBySubject = {}
  for (const t of allTemplates) {
    if (!templatesBySubject[t.subject_id]) templatesBySubject[t.subject_id] = []
    templatesBySubject[t.subject_id].push(t)
  }

  // Bulk-fetch all scores for these templates (1 query instead of N×S×T)
  const allScores = allTemplates.length > 0
    ? db.prepare(`
        SELECT template_id, student_id, score, is_absent FROM assessment_scores
        WHERE template_id IN (${allTemplates.map(() => '?').join(',')}) AND is_deleted = 0
      `).all(...allTemplates.map(t => t.id))
    : []

  const scoreMap = {}
  for (const s of allScores) { scoreMap[`${s.template_id}_${s.student_id}`] = s }

  // Compute subject averages per student — all in memory, no more queries
  const studentResults = students.map(student => {
    let totalWeightedPoints = 0
    let totalCoefficients = 0
    const subjectAvgs = []

    for (const ls of levelSubjects) {
      const templates = templatesBySubject[ls.subject_id] || []

      const rawAverage = computeRawAverage(templates, t => scoreMap[`${t.id}_${student.student_id}`])
      const weightedAverage = rawAverage !== null ? parseFloat((rawAverage * ls.coefficient).toFixed(2)) : null

      if (rawAverage !== null) {
        totalWeightedPoints += weightedAverage
        totalCoefficients += ls.coefficient
      }

      subjectAvgs.push({
        student_id: student.student_id,
        subject_id: ls.subject_id,
        coefficient: ls.coefficient,
        raw_average: rawAverage,
        weighted_average: weightedAverage,
      })
    }

    const semesterAverage = totalCoefficients > 0 ? parseFloat((totalWeightedPoints / totalCoefficients).toFixed(2)) : null

    return {
      student_id: student.student_id,
      subject_averages: subjectAvgs,
      semester_average: semesterAverage,
      total_weighted_points: totalWeightedPoints,
      total_coefficients: totalCoefficients,
    }
  })

  // Compute semester rankings (1224)
  const semesterRankMap = computeRanking(studentResults.map(r => ({ student_id: r.student_id, average: r.semester_average })))

  // Compute per-subject rankings
  const subjectRankMaps = {}
  for (const ls of levelSubjects) {
    const items = studentResults.map(r => {
      const sa = r.subject_averages.find(a => a.subject_id === ls.subject_id)
      return { student_id: r.student_id, average: sa?.raw_average ?? null }
    })
    subjectRankMaps[ls.subject_id] = computeRanking(items)
  }

  // Compute class-level stats per subject
  const subjectClassStats = {}
  for (const ls of levelSubjects) {
    const avgs = studentResults.map(r => r.subject_averages.find(a => a.subject_id === ls.subject_id)?.raw_average).filter(a => a !== null)
    subjectClassStats[ls.subject_id] = {
      highest: avgs.length > 0 ? Math.max(...avgs) : null,
      lowest: avgs.length > 0 ? Math.min(...avgs) : null,
      class_average: avgs.length > 0 ? parseFloat((avgs.reduce((a, b) => a + b, 0) / avgs.length).toFixed(2)) : null,
    }
  }

  // Semester class stats
  const semAvgs = studentResults.map(r => r.semester_average).filter(a => a !== null)
  const classHighest = semAvgs.length > 0 ? Math.max(...semAvgs) : null
  const classLowest = semAvgs.length > 0 ? Math.min(...semAvgs) : null
  const classOverall = semAvgs.length > 0 ? parseFloat((semAvgs.reduce((a, b) => a + b, 0) / semAvgs.length).toFixed(2)) : null

  // Store everything in DB
  db.transaction(() => {
    // Clear old data for this classroom+semester
    db.prepare('DELETE FROM subject_averages WHERE classroom_id = ? AND academic_year_id = ? AND semester = ?').run(classroomId, yearId, semester)
    db.prepare('DELETE FROM semester_summaries WHERE classroom_id = ? AND academic_year_id = ? AND semester = ?').run(classroomId, yearId, semester)

    const saStmt = db.prepare(`
      INSERT INTO subject_averages (student_id, classroom_id, subject_id, academic_year_id, semester, raw_average, coefficient, weighted_average, subject_rank, class_highest_score, class_lowest_score, class_subject_average)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const ssStmt = db.prepare(`
      INSERT INTO semester_summaries (student_id, classroom_id, academic_year_id, semester, total_weighted_points, total_coefficients, semester_average, class_rank, class_size, class_highest_average, class_lowest_average, class_overall_average, mention)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const r of studentResults) {
      for (const sa of r.subject_averages) {
        const subjRank = subjectRankMaps[sa.subject_id]?.[r.student_id]?.rank || null
        const cs = subjectClassStats[sa.subject_id]
        saStmt.run(r.student_id, classroomId, sa.subject_id, yearId, semester, sa.raw_average, sa.coefficient, sa.weighted_average, subjRank, cs.highest, cs.lowest, cs.class_average)
      }

      const semRank = semesterRankMap[r.student_id]?.rank || null
      const mention = getAppreciation(r.semester_average, scale)
      ssStmt.run(r.student_id, classroomId, yearId, semester, r.total_weighted_points, r.total_coefficients, r.semester_average, semRank, classSize, classHighest, classLowest, classOverall, mention || null)
    }
  })()

  return res.json({ success: true, computed: studentResults.length })
})

// ─── GET /api/grades/summary/:classroomId/:semester — Computed summaries ─
router.get('/summary/:classroomId/:semester', requirePermission('grades.view'), (req, res) => {
  const db = getDb()
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value

  const summaries = db.prepare(`
    SELECT ss.*, s.full_name, s.matricule
    FROM semester_summaries ss
    JOIN students s ON s.id = ss.student_id
    WHERE ss.classroom_id = ? AND ss.academic_year_id = ? AND ss.semester = ?
    ORDER BY ss.class_rank, s.full_name
  `).all(req.params.classroomId, yearId, req.params.semester)

  return res.json({ summaries })
})

// ─── GET /api/grades/dashboard — Dashboard stats ────────────
router.get('/dashboard/stats', requirePermission('students.view'), (req, res) => {
  const db = getDb()
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  const year = db.prepare('SELECT label FROM academic_years WHERE id = ?').get(yearId)
  const periodeCount = parseInt(db.prepare("SELECT value FROM app_settings WHERE key = 'periode_count'").get()?.value || '3')

  const totalStudents = db.prepare('SELECT COUNT(*) as cnt FROM enrollments WHERE academic_year_id = ? AND is_deleted = 0').get(yearId || 0)?.cnt || 0
  const totalClassrooms = db.prepare('SELECT COUNT(*) as cnt FROM classrooms WHERE academic_year_id = ? AND is_deleted = 0').get(yearId || 0)?.cnt || 0
  const totalTeachers = db.prepare('SELECT COUNT(*) as cnt FROM teachers WHERE is_active = 1 AND is_deleted = 0').get()?.cnt || 0

  // Grade entry progress per semester
  const semesters = []
  for (let s = 1; s <= periodeCount; s++) {
    // Expected = one score per (student in classroom × template for that classroom)
    const totalExpected = db.prepare(`
      SELECT COUNT(*) as cnt
      FROM assessment_templates t
      JOIN enrollments e ON e.classroom_id = t.classroom_id AND e.academic_year_id = t.academic_year_id AND e.is_deleted = 0
      WHERE t.academic_year_id = ? AND t.semester = ?
    `).get(yearId || 0, s)?.cnt || 0

    const totalScores = db.prepare(`
      SELECT COUNT(*) as cnt FROM assessment_scores sc
      JOIN assessment_templates t ON t.id = sc.template_id
      WHERE t.academic_year_id = ? AND t.semester = ? AND sc.is_deleted = 0 AND (sc.score IS NOT NULL OR sc.is_absent = 1)
    `).get(yearId || 0, s)?.cnt || 0

    const pct = totalExpected > 0 ? Math.round((totalScores / totalExpected) * 100) : 0

    const computed = db.prepare('SELECT COUNT(DISTINCT classroom_id) as cnt FROM semester_summaries WHERE academic_year_id = ? AND semester = ?').get(yearId || 0, s)?.cnt || 0
    const bulletins = db.prepare('SELECT COUNT(*) as cnt FROM report_card_snapshots WHERE academic_year_id = ? AND semester = ?').get(yearId || 0, s)?.cnt || 0

    semesters.push({
      semester: s,
      grades_entered_pct: pct,
      classrooms_computed: computed,
      bulletins_generated: bulletins,
    })
  }

  // Recent report cards
  const recentBulletins = db.prepare(`
    SELECT rc.id, rc.semester, rc.generated_at, s.full_name, c.label AS classroom_label
    FROM report_card_snapshots rc
    JOIN students s ON s.id = rc.student_id
    JOIN classrooms c ON c.id = rc.classroom_id
    WHERE rc.academic_year_id = ?
    ORDER BY rc.generated_at DESC LIMIT 5
  `).all(yearId || 0)

  return res.json({
    academic_year: year?.label,
    total_students: totalStudents,
    total_classrooms: totalClassrooms,
    total_teachers: totalTeachers,
    semesters,
    recent_bulletins: recentBulletins,
  })
})

// ─── GET /api/grades/verification-pdf ───────────────────────────────────────
// Returns all grade data grouped by classroom → subject, ready for PDF rendering.
router.get('/verification-pdf', requirePermission('grades.view'), (req, res) => {
  const db = getDb()
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  const yearLabel = yearId ? db.prepare('SELECT label FROM academic_years WHERE id = ?').get(yearId)?.label : ''
  const semester = parseInt(req.query.semester) || 1
  const classroomIds = (req.query.classroom_ids || '').split(',').map(id => parseInt(id)).filter(Boolean)
  if (!classroomIds.length) return res.status(400).json({ error: 'NO_CLASSROOMS' })

  const TYPE_ABBR = { interrogation: 'Int.', devoir: 'Dev.', composition: 'Comp.', tp: 'TP', oral: 'Oral' }

  const classrooms = db.prepare(`
    SELECT c.id, c.label, c.level_id, c.serie_id FROM classrooms c JOIN levels l ON l.id = c.level_id
    WHERE c.id IN (${classroomIds.map(() => '?').join(',')}) AND c.is_deleted = 0
    ORDER BY l.display_order, c.label
  `).all(...classroomIds)

  const result = []

  for (const classroom of classrooms) {
    const subjects = getClassroomSubjects(db, classroom.id)

    const students = db.prepare(`
      SELECT s.id AS student_id, s.full_name FROM students s
      JOIN enrollments e ON e.student_id = s.id AND e.classroom_id = ? AND e.is_deleted = 0
      WHERE s.is_deleted = 0 ORDER BY s.full_name
    `).all(classroom.id)
    if (!students.length) continue

    // One query for all templates of this class+semester
    const allTemplates = db.prepare(`
      SELECT id, subject_id, assessment_type, sequence_number, max_score, weight
      FROM assessment_templates
      WHERE classroom_id = ? AND academic_year_id = ? AND semester = ?
      ORDER BY subject_id,
        CASE assessment_type WHEN 'interrogation' THEN 1 WHEN 'devoir' THEN 2 WHEN 'composition' THEN 3 WHEN 'tp' THEN 4 WHEN 'oral' THEN 5 END,
        sequence_number
    `).all(classroom.id, yearId, semester)

    const templatesBySubject = {}
    for (const t of allTemplates) {
      if (!templatesBySubject[t.subject_id]) templatesBySubject[t.subject_id] = []
      templatesBySubject[t.subject_id].push(t)
    }

    // One query for all scores of those templates
    const scoreMap = {}
    if (allTemplates.length) {
      const allScores = db.prepare(`
        SELECT template_id, student_id, score, is_absent FROM assessment_scores
        WHERE template_id IN (${allTemplates.map(() => '?').join(',')}) AND is_deleted = 0
      `).all(...allTemplates.map(t => t.id))
      for (const s of allScores) scoreMap[`${s.template_id}_${s.student_id}`] = s
    }

    const classroomSubjects = []

    for (const subj of subjects) {
      const templates = templatesBySubject[subj.subject_id] || []
      if (!templates.length) continue

      const columns = templates.map(t => ({
        id: t.id,
        label: `${TYPE_ABBR[t.assessment_type] || t.assessment_type}${t.sequence_number}`,
        max_score: t.max_score,
      }))

      const studentRows = students.map(st => {
        const scores = templates.map(t => {
          const sc = scoreMap[`${t.id}_${st.student_id}`]
          if (!sc) return null
          if (sc.is_absent === 1) return 'ABS'
          return sc.score !== null ? sc.score : null
        })

        const average = computeRawAverage(templates, t => scoreMap[`${t.id}_${st.student_id}`])
        return { student_id: st.student_id, full_name: st.full_name, scores, average, rank: null, rank_ex: false }
      })

      // Rank by subject average
      const withAvg = studentRows.filter(r => r.average !== null).sort((a, b) => b.average - a.average)
      let rank = 1
      for (let i = 0; i < withAvg.length; i++) {
        if (i > 0 && withAvg[i].average < withAvg[i - 1].average) rank = i + 1
        withAvg[i].rank = rank
        withAvg[i].rank_ex = i > 0 && withAvg[i].average === withAvg[i - 1].average
      }
      const rankMap = {}
      withAvg.forEach(r => { rankMap[r.student_id] = { rank: r.rank, ex: r.rank_ex } })
      studentRows.forEach(r => { const rk = rankMap[r.student_id]; r.rank = rk?.rank || null; r.rank_ex = rk?.ex || false })

      classroomSubjects.push({
        subject_id: subj.subject_id,
        subject_name: subj.subject_name,
        coefficient: subj.coefficient,
        teacher_name: getTeacherName(db, classroom.id, subj.subject_id, yearId),
        columns,
        students: studentRows,
      })
    }

    if (classroomSubjects.length) result.push({ classroom: { id: classroom.id, label: classroom.label }, subjects: classroomSubjects })
  }

  return res.json({ semester, year_label: yearLabel, data: result })
})

module.exports = router
