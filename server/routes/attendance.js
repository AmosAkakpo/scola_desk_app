const express = require('express')
const router = express.Router()
const { getDb } = require('../db/init')
const { requireAuth } = require('../middleware/requireAuth')
const { requirePermission } = require('../middleware/requirePermission')

router.use(requireAuth)

function getYearId(db) {
  return db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
}

// ─── GET daily attendance ───────────────────────────────────

router.get('/', requirePermission('attendance.view'), (req, res) => {
  const db = getDb()
  const yearId = getYearId(db)
  const { date } = req.query
  const targetDate = date || new Date().toISOString().slice(0, 10)

  const jsDate = new Date(targetDate)
  let dayOfWeek = jsDate.getDay()
  if (dayOfWeek === 0) dayOfWeek = 7

  const teachers = db.prepare(`
    SELECT t.id, t.full_name, t.matricule, t.hourly_rate
    FROM teachers t WHERE t.is_active = 1 AND t.is_deleted = 0
    ORDER BY t.full_name
  `).all()

  const scheduledStmt = db.prepare(`
    SELECT teacher_id,
      SUM(CAST(substr(end_time, 1, 2) AS INTEGER) - CAST(substr(start_time, 1, 2) AS INTEGER)) as hours
    FROM timetable_entries
    WHERE academic_year_id = ? AND day_of_week = ?
    GROUP BY teacher_id
  `)
  const scheduled = scheduledStmt.all(yearId, dayOfWeek)
  const schedMap = {}
  scheduled.forEach(s => { schedMap[s.teacher_id] = s.hours })

  const logs = db.prepare(
    'SELECT * FROM teacher_daily_log WHERE academic_year_id = ? AND log_date = ?'
  ).all(yearId, targetDate)
  const logMap = {}
  logs.forEach(l => { logMap[l.teacher_id] = l })

  const rows = teachers.map(t => {
    const hoursScheduled = schedMap[t.id] || 0
    const log = logMap[t.id] || null
    return {
      ...t,
      hours_scheduled: hoursScheduled,
      has_slots: hoursScheduled > 0,
      log: log ? {
        id: log.id,
        status: log.status,
        hours_credited: log.hours_credited,
        notes: log.notes,
      } : null,
    }
  })

  return res.json({ teachers: rows, date: targetDate, day_of_week: dayOfWeek })
})

// ─── POST daily attendance (bulk UPSERT) ────────────────────

router.post('/', requirePermission('attendance.edit'), (req, res) => {
  const db = getDb()
  const yearId = getYearId(db)
  const { entries } = req.body

  if (!entries || !Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: 'MISSING_FIELDS' })
  }

  const upsertStmt = db.prepare(`
    INSERT INTO teacher_daily_log (teacher_id, log_date, academic_year_id, status, hours_credited, notes, recorded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(teacher_id, log_date)
    DO UPDATE SET status = excluded.status, hours_credited = excluded.hours_credited, notes = excluded.notes, recorded_by = excluded.recorded_by
  `)

  db.transaction(() => {
    for (const e of entries) {
      if (!e.teacher_id || !e.log_date || !e.status) continue
      if (e.status !== 'present' && e.status !== 'absent') continue
      upsertStmt.run(
        e.teacher_id, e.log_date, yearId, e.status,
        e.hours_credited ?? 0, e.notes || null, req.user.id
      )
    }
  })()

  return res.json({ success: true, count: entries.length })
})

// ─── POST add extra hours (substitute teachers) ─────────────

router.post('/add-hours', requirePermission('attendance.edit'), (req, res) => {
  const db = getDb()
  const yearId = getYearId(db)
  const { teacher_id, log_date, hours, notes } = req.body

  if (!teacher_id || !log_date || !hours || hours <= 0) {
    return res.status(400).json({ error: 'MISSING_FIELDS' })
  }

  const existing = db.prepare(
    'SELECT id, hours_credited, notes FROM teacher_daily_log WHERE teacher_id = ? AND log_date = ?'
  ).get(teacher_id, log_date)

  if (existing) {
    const newHours = (existing.hours_credited || 0) + parseFloat(hours)
    const combinedNotes = [existing.notes, notes].filter(Boolean).join(' | ')
    db.prepare('UPDATE teacher_daily_log SET hours_credited = ?, notes = ?, recorded_by = ? WHERE id = ?')
      .run(newHours, combinedNotes, req.user.id, existing.id)
  } else {
    db.prepare(`
      INSERT INTO teacher_daily_log (teacher_id, log_date, academic_year_id, status, hours_credited, notes, recorded_by)
      VALUES (?, ?, ?, 'present', ?, ?, ?)
    `).run(teacher_id, log_date, yearId, parseFloat(hours), notes || null, req.user.id)
  }

  return res.json({ success: true })
})

// ─── GET monthly summary ────────────────────────────────────

router.get('/monthly-summary', requirePermission('attendance.view'), (req, res) => {
  const db = getDb()
  const yearId = getYearId(db)
  const { pay_period } = req.query
  const targetMonth = pay_period || new Date().toISOString().slice(0, 7)

  const teachers = db.prepare(`
    SELECT t.id, t.full_name, t.matricule, t.hourly_rate
    FROM teachers t WHERE t.is_active = 1 AND t.is_deleted = 0
    ORDER BY t.full_name
  `).all()

  const monthlyLogs = db.prepare(`
    SELECT teacher_id,
      SUM(hours_credited) as total_hours,
      SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as days_present,
      SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as days_absent
    FROM teacher_daily_log
    WHERE academic_year_id = ? AND strftime('%Y-%m', log_date) = ?
    GROUP BY teacher_id
  `).all(yearId, targetMonth)
  const logMap = {}
  monthlyLogs.forEach(l => { logMap[l.teacher_id] = l })

  const weeklyHours = db.prepare(`
    SELECT teacher_id,
      SUM(CAST(substr(end_time, 1, 2) AS INTEGER) - CAST(substr(start_time, 1, 2) AS INTEGER)) as weekly
    FROM timetable_entries WHERE academic_year_id = ?
    GROUP BY teacher_id
  `).all(yearId)
  const weeklyMap = {}
  weeklyHours.forEach(w => { weeklyMap[w.teacher_id] = w.weekly })

  // Paid status from salary_payments (multi-payment model) — salary_entries is legacy
  const salaryPaid = db.prepare(`
    SELECT teacher_id, SUM(amount) as total_paid FROM salary_payments
    WHERE academic_year_id = ? AND pay_period = ? AND is_deleted = 0
    GROUP BY teacher_id
  `).all(yearId, targetMonth)
  const salaryMap = {}
  salaryPaid.forEach(s => { salaryMap[s.teacher_id] = s.total_paid })

  // Include teachers with timetable hours OR credited hours (substitutes have no slots)
  const rows = teachers.filter(t => weeklyMap[t.id] > 0 || (logMap[t.id]?.total_hours || 0) > 0).map(t => {
    const log = logMap[t.id] || {}
    const prevues = (weeklyMap[t.id] || 0) * 4
    const reelles = log.total_hours || 0
    return {
      ...t,
      hours_prevues: prevues,
      hours_reelles: reelles,
      taux: prevues > 0 ? Math.round((reelles / prevues) * 100) : 0,
      days_present: log.days_present || 0,
      days_absent: log.days_absent || 0,
      total_paid: salaryMap[t.id] || 0,
      salary_paid: (salaryMap[t.id] || 0) > 0,
    }
  })

  return res.json({ teachers: rows, month: targetMonth })
})

module.exports = router
