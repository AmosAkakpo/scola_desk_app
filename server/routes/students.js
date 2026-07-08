const express = require('express')
const router = express.Router()
const { getDb } = require('../db/init')
const { generateUUID, generateStudentUID, getSchoolPrefix } = require('../utils/uid')
const { autoAssignMandatoryFees } = require('../utils/fees')
const { migrateStudentGrades } = require('../utils/transfer')
const { requireAuth } = require('../middleware/requireAuth')
const { requirePermission } = require('../middleware/requirePermission')

router.use(requireAuth)

// ─── GET /api/students — List with search + filters ─────────
router.get('/', requirePermission('students.view'), (req, res) => {
  const db = getDb()
  const { search, classroom_id, level_id, status } = req.query
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value

  let query = `
    SELECT s.id, s.student_uid, s.matricule, s.full_name, s.gender, s.status, s.birth_date,
           e.classroom_id, c.label AS classroom_label, l.name AS level_name
    FROM students s
    LEFT JOIN enrollments e ON e.student_id = s.id AND e.academic_year_id = ? AND e.is_deleted = 0
    LEFT JOIN classrooms c ON c.id = e.classroom_id
    LEFT JOIN levels l ON l.id = c.level_id
    WHERE s.is_deleted = 0
  `
  const params = [yearId || 0]

  if (search) {
    query += ` AND (s.full_name LIKE ? OR s.matricule LIKE ?)`
    params.push(`%${search}%`, `%${search}%`)
  }
  if (classroom_id) { query += ` AND e.classroom_id = ?`; params.push(classroom_id) }
  if (level_id) { query += ` AND c.level_id = ?`; params.push(level_id) }
  if (status) { query += ` AND s.status = ?`; params.push(status) }

  query += ` ORDER BY s.full_name`
  return res.json({ students: db.prepare(query).all(...params) })
})

// ─── GET /api/students/:id — Full profile ───────────────────
router.get('/:id', requirePermission('students.view'), (req, res) => {
  const db = getDb()
  const student = db.prepare('SELECT * FROM students WHERE id = ? AND is_deleted = 0').get(req.params.id)
  if (!student) return res.status(404).json({ error: 'NOT_FOUND', message: 'Élève introuvable' })

  const guardians = db.prepare('SELECT * FROM guardians WHERE student_id = ? AND is_deleted = 0 ORDER BY is_primary DESC').all(student.id)

  const history = db.prepare(`
    SELECT e.academic_year_id, ay.label AS year_label, c.label AS classroom_label, l.name AS level_name,
           ss.semester_average, ss.class_rank, ss.class_size, ss.mention, ss.semester,
           pd.verdict, pd.final_average
    FROM enrollments e
    JOIN academic_years ay ON ay.id = e.academic_year_id
    JOIN classrooms c ON c.id = e.classroom_id
    JOIN levels l ON l.id = c.level_id
    LEFT JOIN semester_summaries ss ON ss.student_id = e.student_id AND ss.academic_year_id = e.academic_year_id
    LEFT JOIN promotion_details pd ON pd.student_id = e.student_id AND pd.old_classroom_id = e.classroom_id
    WHERE e.student_id = ? AND e.is_deleted = 0
    ORDER BY ay.label DESC, ss.semester
  `).all(student.id)

  // Group history by year
  const yearMap = {}
  for (const row of history) {
    if (!yearMap[row.academic_year_id]) {
      yearMap[row.academic_year_id] = {
        year_label: row.year_label, classroom: row.classroom_label, level: row.level_name,
        semesters: [], verdict: row.verdict, final_average: row.final_average,
      }
    }
    if (row.semester_average !== null) {
      yearMap[row.academic_year_id].semesters.push({
        semester: row.semester, average: row.semester_average,
        rank: row.class_rank, class_size: row.class_size, mention: row.mention,
      })
    }
  }

  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  const currentEnrollment = db.prepare(`
    SELECT e.*, c.label AS classroom_label FROM enrollments e
    JOIN classrooms c ON c.id = e.classroom_id
    WHERE e.student_id = ? AND e.academic_year_id = ? AND e.is_deleted = 0
  `).get(student.id, yearId || 0)

  return res.json({
    student, guardians,
    history: Object.values(yearMap),
    current_enrollment: currentEnrollment,
  })
})

// ─── PUT /api/students/:id — Update personal info ───────────
router.put('/:id', requirePermission('students.edit'), (req, res) => {
  const db = getDb()
  const { full_name, birth_date, birth_place, gender, national_student_number } = req.body
  const student = db.prepare('SELECT id FROM students WHERE id = ? AND is_deleted = 0').get(req.params.id)
  if (!student) return res.status(404).json({ error: 'NOT_FOUND' })

  db.prepare(`
    UPDATE students SET full_name = ?, birth_date = ?, birth_place = ?, gender = ?,
    national_student_number = ?, updated_at = datetime('now') WHERE id = ?
  `).run(full_name?.trim(), birth_date || null, birth_place || null, gender || null, national_student_number || null, req.params.id)

  return res.json({ success: true })
})

// ─── POST /api/students — Add new student ───────────────────
router.post('/', requirePermission('students.edit'), (req, res) => {
  const db = getDb()
  const { full_name, birth_date, birth_place, gender, classroom_id, matricule } = req.body
  if (!full_name?.trim() || !classroom_id) return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Nom et classe requis' })

  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  if (!yearId) return res.status(400).json({ error: 'NO_YEAR', message: 'Année académique non configurée' })

  const mode = db.prepare("SELECT value FROM app_settings WHERE key = 'matricule_mode'").get()?.value || 'custom'
  let finalMatricule = matricule || null

  if (mode === 'custom' && !finalMatricule) {
    const schoolCode = db.prepare('SELECT school_code FROM school_config LIMIT 1').get()?.school_code || 'SCH'
    // MAX(id)+1, not COUNT(*)+1 — COUNT collides with the UNIQUE matricule after deletions
    const seq = (db.prepare('SELECT MAX(id) as m FROM students').get()?.m || 0) + 1
    const year = new Date().getFullYear()
    finalMatricule = `${schoolCode}/${year}/${String(seq).padStart(4, '0')}`
  }

  const uid = generateStudentUID(getSchoolPrefix(db))
  const result = db.prepare(`
    INSERT INTO students (student_uid, matricule, full_name, birth_date, birth_place, gender)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uid, finalMatricule, full_name.trim(), birth_date || null, birth_place || null, gender || null)

  const studentId = result.lastInsertRowid
  db.prepare(`
    INSERT INTO enrollments (enrollment_uid, student_id, classroom_id, academic_year_id)
    VALUES (?, ?, ?, ?)
  `).run(generateUUID(), studentId, classroom_id, parseInt(yearId))

  autoAssignMandatoryFees(db, studentId, parseInt(yearId))

  db.prepare(`
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id)
    VALUES (?, 'STUDENT_CREATED', 'student', ?)
  `).run(req.user.id, String(studentId))

  return res.status(201).json({ success: true, student_id: studentId })
})

// ─── POST /api/students/:id/transfer — Move classroom ──────
router.post('/:id/transfer', requirePermission('students.edit'), (req, res) => {
  const db = getDb()
  const { classroom_id } = req.body
  if (!classroom_id) return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Classe cible requise' })

  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  const enrollment = db.prepare('SELECT id, classroom_id FROM enrollments WHERE student_id = ? AND academic_year_id = ? AND is_deleted = 0').get(req.params.id, yearId || 0)
  if (!enrollment) return res.status(404).json({ error: 'NOT_ENROLLED' })

  const oldClassroom = enrollment.classroom_id
  let migration = { moved: 0, unmatched: 0 }
  db.transaction(() => {
    db.prepare('UPDATE enrollments SET classroom_id = ? WHERE id = ?').run(classroom_id, enrollment.id)
    // Move the student's grades/decisions to the new classroom's templates
    migration = migrateStudentGrades(db, parseInt(req.params.id), oldClassroom, parseInt(classroom_id), parseInt(yearId))
  })()

  db.prepare(`
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values)
    VALUES (?, 'STUDENT_TRANSFERRED', 'student', ?, ?, ?)
  `).run(req.user.id, req.params.id, JSON.stringify({ classroom_id: oldClassroom }), JSON.stringify({ classroom_id, grades_moved: migration.moved, grades_unmatched: migration.unmatched }))

  return res.json({ success: true, grades_moved: migration.moved, grades_unmatched: migration.unmatched })
})

// ─── POST /api/students/:id/guardians — Add guardian ────────
router.post('/:id/guardians', requirePermission('students.edit'), (req, res) => {
  const { full_name, phone, relationship, is_primary } = req.body
  if (!full_name?.trim()) return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Nom du tuteur requis' })
  const db = getDb()
  db.prepare(`
    INSERT INTO guardians (student_id, full_name, phone, relationship, is_primary)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.params.id, full_name.trim(), phone || null, relationship || null, is_primary ? 1 : 0)
  return res.status(201).json({ success: true })
})

// ─── PUT /api/students/:id/guardians/:gid — Update guardian ─
router.put('/:id/guardians/:gid', requirePermission('students.edit'), (req, res) => {
  const { full_name, phone, relationship, is_primary } = req.body
  const db = getDb()
  db.prepare(`
    UPDATE guardians SET full_name = ?, phone = ?, relationship = ?, is_primary = ? WHERE id = ? AND student_id = ?
  `).run(full_name?.trim(), phone || null, relationship || null, is_primary ? 1 : 0, req.params.gid, req.params.id)
  return res.json({ success: true })
})

// ─── DELETE /api/students/:id/guardians/:gid — Soft delete ──
router.delete('/:id/guardians/:gid', requirePermission('students.edit'), (req, res) => {
  const db = getDb()
  db.prepare('UPDATE guardians SET is_deleted = 1, deleted_at = datetime(\'now\') WHERE id = ? AND student_id = ?').run(req.params.gid, req.params.id)
  return res.json({ success: true })
})

// ─── GET /api/students/:id/sanctions/:semester — Get sanctions ─
router.get('/:id/sanctions/:semester', requirePermission('students.view'), (req, res) => {
  const db = getDb()
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  const enrollment = db.prepare('SELECT classroom_id FROM enrollments WHERE student_id = ? AND academic_year_id = ? AND is_deleted = 0 LIMIT 1').get(req.params.id, yearId)
  if (!enrollment) return res.json({ sanctions: null })

  const row = db.prepare(`
    SELECT avertissement, blame, conduite_score, conduite_note, felicitation, encouragement, tableau_honneur, conseil_decision, conseil_decision_pass
    FROM semester_decisions
    WHERE student_id = ? AND classroom_id = ? AND academic_year_id = ? AND semester = ?
  `).get(req.params.id, enrollment.classroom_id, yearId, req.params.semester)

  const defaultConduite = parseFloat(db.prepare("SELECT value FROM app_settings WHERE key = 'default_conduite_score'").get()?.value || '18')
  return res.json({ sanctions: row || { avertissement: 0, blame: 0, conduite_score: null, conduite_note: null, felicitation: 0, encouragement: 0, tableau_honneur: 0, conseil_decision: null, conseil_decision_pass: null }, default_conduite: defaultConduite })
})

// ─── PUT /api/students/:id/sanctions/:semester — Save sanctions + conduite ─
router.put('/:id/sanctions/:semester', requirePermission('students.edit'), (req, res) => {
  const db = getDb()
  const { avertissement, blame, conduite_score, conduite_note } = req.body
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  const enrollment = db.prepare('SELECT classroom_id FROM enrollments WHERE student_id = ? AND academic_year_id = ? AND is_deleted = 0 LIMIT 1').get(req.params.id, yearId)
  if (!enrollment) return res.status(400).json({ error: 'NOT_ENROLLED' })

  const conduiteVal = conduite_score !== undefined && conduite_score !== null ? parseFloat(conduite_score) : null

  db.prepare(`
    INSERT INTO semester_decisions (student_id, classroom_id, academic_year_id, semester, avertissement, blame, conduite_score, conduite_note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(student_id, classroom_id, academic_year_id, semester) DO UPDATE SET
      avertissement = excluded.avertissement,
      blame = excluded.blame,
      conduite_score = excluded.conduite_score,
      conduite_note = excluded.conduite_note,
      updated_at = datetime('now')
  `).run(req.params.id, enrollment.classroom_id, yearId, req.params.semester, avertissement ? 1 : 0, blame ? 1 : 0, conduiteVal, conduite_note || null)

  return res.json({ success: true })
})

// ─── POST /api/students/:id/expel — Expel student ────────────
router.post('/:id/expel', requirePermission('students.edit'), (req, res) => {
  const db = getDb()
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value

  const enrollment = db.prepare('SELECT id FROM enrollments WHERE student_id = ? AND academic_year_id = ? AND is_deleted = 0 LIMIT 1').get(req.params.id, yearId)
  if (!enrollment) return res.status(400).json({ error: 'NOT_ENROLLED' })

  db.transaction(() => {
    db.prepare("UPDATE enrollments SET is_expelled = 1, updated_at = datetime('now') WHERE id = ?").run(enrollment.id)
    db.prepare("UPDATE students SET status = 'excluded', updated_at = datetime('now') WHERE id = ?").run(req.params.id)
  })()

  return res.json({ success: true })
})

module.exports = router
