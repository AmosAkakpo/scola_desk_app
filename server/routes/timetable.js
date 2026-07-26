const express = require('express')
const router = express.Router()
const { getDb } = require('../db/init')
const { requireAuth } = require('../middleware/requireAuth')
const { requirePermission } = require('../middleware/requirePermission')

router.use(requireAuth)

function yearId(db) {
  return db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
}

// 'HH:MM' on a 30-min boundary, zero-padded 24h
function validTime(t) {
  if (!/^\d{2}:\d{2}$/.test(t)) return false
  const [h, m] = t.split(':').map(Number)
  return h >= 0 && h <= 23 && (m === 0 || m === 30)
}
// string compare works because times are zero-padded 24h
const overlaps = (s1, e1, s2, e2) => s1 < e2 && s2 < e1

// ─── GET /api/timetable/config ──────────────────────────────
router.get('/config', requirePermission('timetable.view'), (req, res) => {
  const db = getDb()
  const get = k => db.prepare('SELECT value FROM app_settings WHERE key = ?').get(k)?.value
  let days = [1, 2, 3, 4, 5, 6]
  try { days = JSON.parse(get('timetable_days')) } catch { /* default */ }
  const yearId = get('current_academic_year_id')
  const yearLabel = yearId ? db.prepare('SELECT label FROM academic_years WHERE id = ?').get(yearId)?.label : null
  return res.json({
    day_start: get('timetable_day_start') || '07:00',
    day_end: get('timetable_day_end') || '19:00',
    days,
    year_label: yearLabel || '',
  })
})

// ─── PUT /api/timetable/config — admin only ─────────────────
router.put('/config', (req, res) => {
  if (req.user.role_name !== 'admin') return res.status(403).json({ error: 'PERMISSION_DENIED', message: 'Réservé à l\'administrateur' })
  const db = getDb()
  const { day_start, day_end, days } = req.body
  if (day_start && !validTime(day_start)) return res.status(400).json({ error: 'BAD_TIME', message: 'Heure de début invalide' })
  if (day_end && !validTime(day_end)) return res.status(400).json({ error: 'BAD_TIME', message: 'Heure de fin invalide' })
  if (day_start && day_end && day_start >= day_end) return res.status(400).json({ error: 'BAD_RANGE', message: 'L\'heure de fin doit suivre l\'heure de début' })

  const set = (k, v) => db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))").run(k, v)
  if (day_start) set('timetable_day_start', day_start)
  if (day_end) set('timetable_day_end', day_end)
  if (Array.isArray(days)) set('timetable_days', JSON.stringify(days))
  return res.json({ success: true })
})

// ─── GET /api/timetable/options — classes + teachers for pickers ─
router.get('/options', requirePermission('timetable.view'), (req, res) => {
  const db = getDb()
  const yr = yearId(db)
  const classrooms = db.prepare(`
    SELECT c.id, c.label, l.display_order FROM classrooms c JOIN levels l ON l.id = c.level_id
    WHERE c.academic_year_id = ? AND c.is_deleted = 0 ORDER BY l.display_order, c.label
  `).all(yr || 0)
  const teachers = db.prepare('SELECT id, full_name FROM teachers WHERE is_active = 1 AND is_deleted = 0 ORDER BY full_name').all()
  return res.json({ classrooms, teachers })
})

// ─── GET /api/timetable/class/:classroomId ──────────────────
router.get('/class/:classroomId', requirePermission('timetable.view'), (req, res) => {
  const db = getDb()
  const yr = yearId(db)
  const classroom = db.prepare('SELECT id, label, level_id, serie_id FROM classrooms WHERE id = ? AND is_deleted = 0').get(req.params.classroomId)
  if (!classroom) return res.status(404).json({ error: 'NOT_FOUND' })

  // teacher_name/teacher_id are derived LIVE from teacher_schedule, not
  // read from the entry's own (frozen-at-creation) teacher_id column --
  // owner report 2026-07-25: adding a slot for a subject with no teacher
  // assigned yet silently never showed up in that teacher's view once one
  // WAS assigned later, since the stored column never got updated after
  // the fact. Deriving live means an assignment change instantly applies
  // to every past and future slot, both sides, with nothing to go stale.
  const entries = db.prepare(`
    SELECT e.id, e.academic_year_id, e.classroom_id, e.day_of_week, e.start_time, e.end_time, e.subject_id, e.room,
      s.name AS subject_name,
      (SELECT ts.teacher_id FROM teacher_schedule ts
        WHERE ts.classroom_id = e.classroom_id AND ts.subject_id = e.subject_id AND ts.academic_year_id = e.academic_year_id LIMIT 1) AS teacher_id,
      (SELECT t.full_name FROM teacher_schedule ts JOIN teachers t ON t.id = ts.teacher_id
        WHERE ts.classroom_id = e.classroom_id AND ts.subject_id = e.subject_id AND ts.academic_year_id = e.academic_year_id LIMIT 1) AS teacher_name
    FROM timetable_entries e
    JOIN subjects s ON s.id = e.subject_id
    WHERE e.classroom_id = ? AND e.academic_year_id = ?
    ORDER BY e.day_of_week, e.start_time
  `).all(classroom.id, yr || 0)

  // Subjects of this class + their assigned teacher (for the placement picker)
  const subjects = classroom.serie_id
    ? db.prepare(`SELECT DISTINCT ls.subject_id, s.name AS subject_name FROM level_subjects ls JOIN subjects s ON s.id = ls.subject_id
         WHERE ls.level_id = ? AND ls.is_active = 1 AND (ls.serie_id = ? OR ls.serie_id IS NULL) ORDER BY s.name`).all(classroom.level_id, classroom.serie_id)
    : db.prepare(`SELECT ls.subject_id, s.name AS subject_name FROM level_subjects ls JOIN subjects s ON s.id = ls.subject_id
         WHERE ls.level_id = ? AND ls.is_active = 1 AND ls.serie_id IS NULL ORDER BY s.name`).all(classroom.level_id)
  const teacherStmt = db.prepare('SELECT teacher_id FROM teacher_schedule WHERE classroom_id = ? AND subject_id = ? AND academic_year_id = ? LIMIT 1')
  const teacherName = db.prepare('SELECT full_name FROM teachers WHERE id = ?')
  for (const s of subjects) {
    s.teacher_id = teacherStmt.get(classroom.id, s.subject_id, yr || 0)?.teacher_id || null
    s.teacher_name = s.teacher_id ? teacherName.get(s.teacher_id)?.full_name : null
  }

  return res.json({ classroom: { id: classroom.id, label: classroom.label }, entries, subjects })
})

// ─── GET /api/timetable/teacher/:teacherId ──────────────────
router.get('/teacher/:teacherId', requirePermission('timetable.view'), (req, res) => {
  const db = getDb()
  const yr = yearId(db)
  const teacher = db.prepare('SELECT id, full_name FROM teachers WHERE id = ? AND is_deleted = 0').get(req.params.teacherId)
  if (!teacher) return res.status(404).json({ error: 'NOT_FOUND' })

  // Same live-derivation as GET /class -- filters on teacher_schedule's
  // CURRENT assignment for each slot's (classroom, subject), not the
  // entry's own frozen teacher_id column. A slot only appears here if
  // this teacher is presently assigned to that classroom+subject.
  const entries = db.prepare(`
    SELECT e.id, e.academic_year_id, e.classroom_id, e.day_of_week, e.start_time, e.end_time, e.subject_id, e.room,
      s.name AS subject_name, c.label AS classroom_label
    FROM timetable_entries e
    JOIN subjects s ON s.id = e.subject_id
    JOIN classrooms c ON c.id = e.classroom_id
    WHERE e.academic_year_id = ?
      AND EXISTS (
        SELECT 1 FROM teacher_schedule ts
        WHERE ts.classroom_id = e.classroom_id AND ts.subject_id = e.subject_id
          AND ts.academic_year_id = e.academic_year_id AND ts.teacher_id = ?
      )
    ORDER BY e.day_of_week, e.start_time
  `).all(yr || 0, teacher.id)

  return res.json({ teacher, entries })
})

// ─── POST /api/timetable/entry — create a slot (hard conflict block) ─
router.post('/entry', requirePermission('timetable.edit'), (req, res) => {
  const db = getDb()
  const yr = yearId(db)
  if (!yr) return res.status(400).json({ error: 'NO_YEAR', message: 'Année académique non configurée' })

  const { classroom_id, day_of_week, start_time, end_time, subject_id, room } = req.body
  if (!classroom_id || !day_of_week || !start_time || !end_time || !subject_id) {
    return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Champs requis manquants' })
  }
  if (!validTime(start_time) || !validTime(end_time)) return res.status(400).json({ error: 'BAD_TIME', message: 'Horaires invalides (pas de 30 min)' })
  if (start_time >= end_time) return res.status(400).json({ error: 'BAD_RANGE', message: 'L\'heure de fin doit suivre l\'heure de début' })

  // Teacher for this class+subject (may be null if unassigned)
  const teacherId = db.prepare('SELECT teacher_id FROM teacher_schedule WHERE classroom_id = ? AND subject_id = ? AND academic_year_id = ? LIMIT 1')
    .get(classroom_id, subject_id, yr)?.teacher_id || null

  // Class conflict: this class already busy in an overlapping range that day
  const classDay = db.prepare('SELECT start_time, end_time, subject_id FROM timetable_entries WHERE classroom_id = ? AND academic_year_id = ? AND day_of_week = ?').all(classroom_id, yr, day_of_week)
  for (const e of classDay) {
    if (overlaps(start_time, end_time, e.start_time, e.end_time)) {
      return res.status(409).json({ error: 'CLASS_BUSY', message: `Créneau déjà occupé (${e.start_time}–${e.end_time}) pour cette classe` })
    }
  }

  // Teacher conflict: same teacher in another class at an overlapping time
  // that day -- matched against OTHER entries' current live assignment,
  // not their own frozen teacher_id column (same reasoning as the GET
  // endpoints above: an assignment made after those entries were created
  // must still be caught here).
  if (teacherId) {
    const tDay = db.prepare(`
      SELECT e.start_time, e.end_time, c.label FROM timetable_entries e JOIN classrooms c ON c.id = e.classroom_id
      WHERE e.academic_year_id = ? AND e.day_of_week = ?
        AND EXISTS (
          SELECT 1 FROM teacher_schedule ts
          WHERE ts.classroom_id = e.classroom_id AND ts.subject_id = e.subject_id
            AND ts.academic_year_id = e.academic_year_id AND ts.teacher_id = ?
        )
    `).all(yr, day_of_week, teacherId)
    for (const e of tDay) {
      if (overlaps(start_time, end_time, e.start_time, e.end_time)) {
        const tName = db.prepare('SELECT full_name FROM teachers WHERE id = ?').get(teacherId)?.full_name || 'L\'enseignant'
        return res.status(409).json({ error: 'TEACHER_BUSY', message: `${tName} est déjà en cours en ${e.label} (${e.start_time}–${e.end_time})` })
      }
    }
  }

  const result = db.prepare(`
    INSERT INTO timetable_entries (academic_year_id, classroom_id, day_of_week, start_time, end_time, subject_id, teacher_id, room)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(yr, classroom_id, day_of_week, start_time, end_time, subject_id, teacherId, room?.trim() || null)

  return res.status(201).json({ success: true, id: result.lastInsertRowid })
})

// ─── PUT /api/timetable/entry/:id — move / resize (same conflict rules) ─
router.put('/entry/:id', requirePermission('timetable.edit'), (req, res) => {
  const db = getDb()
  const yr = yearId(db)
  const entry = db.prepare('SELECT * FROM timetable_entries WHERE id = ?').get(req.params.id)
  if (!entry) return res.status(404).json({ error: 'NOT_FOUND' })

  const day_of_week = req.body.day_of_week ?? entry.day_of_week
  const start_time = req.body.start_time ?? entry.start_time
  const end_time = req.body.end_time ?? entry.end_time
  if (!validTime(start_time) || !validTime(end_time)) return res.status(400).json({ error: 'BAD_TIME', message: 'Horaires invalides' })
  if (start_time >= end_time) return res.status(400).json({ error: 'BAD_RANGE', message: 'L\'heure de fin doit suivre l\'heure de début' })

  // Class conflict (ignore self)
  const classDay = db.prepare('SELECT start_time, end_time FROM timetable_entries WHERE classroom_id = ? AND academic_year_id = ? AND day_of_week = ? AND id != ?')
    .all(entry.classroom_id, yr, day_of_week, entry.id)
  for (const e of classDay) {
    if (overlaps(start_time, end_time, e.start_time, e.end_time)) {
      return res.status(409).json({ error: 'CLASS_BUSY', message: `Créneau déjà occupé (${e.start_time}–${e.end_time}) pour cette classe` })
    }
  }
  // Teacher conflict (ignore self) -- current assignment for this slot's
  // (classroom, subject), same live derivation as the GET endpoints, not
  // the entry's own frozen teacher_id column.
  const currentTeacherId = db.prepare('SELECT teacher_id FROM teacher_schedule WHERE classroom_id = ? AND subject_id = ? AND academic_year_id = ? LIMIT 1')
    .get(entry.classroom_id, entry.subject_id, yr)?.teacher_id || null
  if (currentTeacherId) {
    const tDay = db.prepare(`
      SELECT e.start_time, e.end_time, c.label FROM timetable_entries e JOIN classrooms c ON c.id = e.classroom_id
      WHERE e.academic_year_id = ? AND e.day_of_week = ? AND e.id != ?
        AND EXISTS (
          SELECT 1 FROM teacher_schedule ts
          WHERE ts.classroom_id = e.classroom_id AND ts.subject_id = e.subject_id
            AND ts.academic_year_id = e.academic_year_id AND ts.teacher_id = ?
        )
    `).all(yr, day_of_week, entry.id, currentTeacherId)
    for (const e of tDay) {
      if (overlaps(start_time, end_time, e.start_time, e.end_time)) {
        const tName = db.prepare('SELECT full_name FROM teachers WHERE id = ?').get(currentTeacherId)?.full_name || 'L\'enseignant'
        return res.status(409).json({ error: 'TEACHER_BUSY', message: `${tName} est déjà en cours en ${e.label} (${e.start_time}–${e.end_time})` })
      }
    }
  }

  db.prepare('UPDATE timetable_entries SET day_of_week = ?, start_time = ?, end_time = ? WHERE id = ?')
    .run(day_of_week, start_time, end_time, entry.id)
  return res.json({ success: true })
})

// ─── DELETE /api/timetable/entry/:id ────────────────────────
router.delete('/entry/:id', requirePermission('timetable.edit'), (req, res) => {
  const db = getDb()
  db.prepare('DELETE FROM timetable_entries WHERE id = ?').run(req.params.id)
  return res.json({ success: true })
})

module.exports = router
