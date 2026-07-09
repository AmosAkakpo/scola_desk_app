const express = require('express')
const router = express.Router()
const { getDb } = require('../db/init')
const { generateUUID, generateTeacherUID, getSchoolPrefix } = require('../utils/uid')
const { requireAuth } = require('../middleware/requireAuth')
const { requirePermission } = require('../middleware/requirePermission')

router.use(requireAuth)

// ─── GET /api/teachers — List with search + filters ─────────
router.get('/', requirePermission('students.view'), (req, res) => {
  const db = getDb()
  const { search, status, page, limit } = req.query
  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value

  const pageNum = Math.max(1, parseInt(page) || 1)
  const pageSize = Math.min(200, Math.max(1, parseInt(limit) || 50))

  let whereClause = ` WHERE t.is_deleted = 0`
  const params = []
  if (search) { whereClause += ` AND (t.full_name LIKE ? OR t.matricule LIKE ?)`; params.push(`%${search}%`, `%${search}%`) }
  if (status === 'active') { whereClause += ` AND t.is_active = 1` }
  else if (status === 'inactive') { whereClause += ` AND t.is_active = 0` }

  const total = db.prepare(`SELECT COUNT(*) as cnt FROM teachers t${whereClause}`).get(...params)?.cnt || 0

  const teachers = db.prepare(`
    SELECT t.id, t.teacher_uid, t.matricule, t.full_name, t.phone, t.email, t.is_active
    FROM teachers t
    ${whereClause}
    ORDER BY t.full_name
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, (pageNum - 1) * pageSize)

  // Assignment counts + classroom labels, batched for this page only
  // (was 2 queries PER teacher — fine at 50/page, was unbounded before).
  if (teachers.length > 0) {
    const ids = teachers.map(t => t.id)
    const placeholders = ids.map(() => '?').join(',')

    const countMap = {}
    db.prepare(`
      SELECT teacher_id, COUNT(*) as cnt FROM teacher_schedule
      WHERE teacher_id IN (${placeholders}) AND academic_year_id = ?
      GROUP BY teacher_id
    `).all(...ids, yearId || 0).forEach(r => { countMap[r.teacher_id] = r.cnt })

    const classMap = {}
    db.prepare(`
      SELECT DISTINCT ts.teacher_id, c.label FROM teacher_schedule ts
      JOIN classrooms c ON c.id = ts.classroom_id
      WHERE ts.teacher_id IN (${placeholders}) AND ts.academic_year_id = ?
    `).all(...ids, yearId || 0).forEach(r => { (classMap[r.teacher_id] ||= []).push(r.label) })

    for (const t of teachers) {
      t.assignment_count = countMap[t.id] || 0
      t.classrooms = classMap[t.id] || []
    }
  }

  return res.json({
    teachers, total, page: pageNum, page_size: pageSize,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
  })
})

// ─── GET /api/teachers/:id — Full profile ───────────────────
router.get('/:id', requirePermission('students.view'), (req, res) => {
  const db = getDb()
  const teacher = db.prepare(`
    SELECT t.*, s.name AS specialty_name FROM teachers t
    LEFT JOIN subjects s ON s.id = t.subject_specialty_id
    WHERE t.id = ? AND t.is_deleted = 0
  `).get(req.params.id)
  if (!teacher) return res.status(404).json({ error: 'NOT_FOUND', message: 'Enseignant introuvable' })

  const yearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value

  const assignments = db.prepare(`
    SELECT ts.classroom_id, ts.subject_id, c.label AS classroom_label, sub.name AS subject_name, l.name AS level_name
    FROM teacher_schedule ts
    JOIN classrooms c ON c.id = ts.classroom_id
    JOIN subjects sub ON sub.id = ts.subject_id
    JOIN levels l ON l.id = c.level_id
    WHERE ts.teacher_id = ? AND ts.academic_year_id = ?
    ORDER BY l.display_order, c.label, sub.name
  `).all(req.params.id, yearId || 0)

  const history = db.prepare(`
    SELECT ts.academic_year_id, ay.label AS year_label, c.label AS classroom_label, sub.name AS subject_name
    FROM teacher_schedule ts
    JOIN academic_years ay ON ay.id = ts.academic_year_id
    JOIN classrooms c ON c.id = ts.classroom_id
    JOIN subjects sub ON sub.id = ts.subject_id
    WHERE ts.teacher_id = ?
    ORDER BY ay.label DESC, c.label
  `).all(req.params.id)

  // Group history by year
  const yearMap = {}
  for (const row of history) {
    if (!yearMap[row.year_label]) yearMap[row.year_label] = []
    yearMap[row.year_label].push({ classroom: row.classroom_label, subject: row.subject_name })
  }

  return res.json({ teacher, assignments, history: Object.entries(yearMap).map(([year, items]) => ({ year, items })) })
})

// ─── PUT /api/teachers/:id — Update info ────────────────────
router.put('/:id', requirePermission('students.edit'), (req, res) => {
  const db = getDb()
  const { full_name, phone, email, qualification, hourly_rate } = req.body
  const teacher = db.prepare('SELECT id FROM teachers WHERE id = ? AND is_deleted = 0').get(req.params.id)
  if (!teacher) return res.status(404).json({ error: 'NOT_FOUND' })

  db.prepare('UPDATE teachers SET full_name = ?, phone = ?, email = ?, qualification = ?, hourly_rate = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(full_name?.trim(), phone || null, email || null, qualification || null, hourly_rate != null ? parseFloat(hourly_rate) : 0, req.params.id)

  return res.json({ success: true })
})

// ─── PATCH /api/teachers/:id/toggle-active — Toggle active status ─
router.patch('/:id/toggle-active', requirePermission('students.edit'), (req, res) => {
  const db = getDb()
  const teacher = db.prepare('SELECT id, is_active FROM teachers WHERE id = ? AND is_deleted = 0').get(req.params.id)
  if (!teacher) return res.status(404).json({ error: 'NOT_FOUND' })

  const newStatus = teacher.is_active === 1 ? 0 : 1
  db.prepare('UPDATE teachers SET is_active = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newStatus, req.params.id)

  return res.json({ success: true, is_active: newStatus })
})

// ─── POST /api/teachers — Add new teacher ───────────────────
router.post('/', requirePermission('students.edit'), (req, res) => {
  const db = getDb()
  const { full_name, phone, email } = req.body
  if (!full_name?.trim()) return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Nom requis' })

  const result = db.prepare('INSERT INTO teachers (teacher_uid, full_name, phone, email) VALUES (?, ?, ?, ?)')
    .run(generateTeacherUID(getSchoolPrefix(db)), full_name.trim(), phone || null, email || null)

  return res.status(201).json({ success: true, teacher_id: result.lastInsertRowid })
})

module.exports = router
