const express = require('express')
const router = express.Router()
const { getDb } = require('../db/init')
const { requireAuth } = require('../middleware/requireAuth')
const { requirePermission } = require('../middleware/requirePermission')
const { requirePro } = require('../middleware/requirePro')
const { generateUUID } = require('../utils/uid')
const { autoAssignMandatoryFees, getFeeAmountForStudent, getStudentFeeSummary, getFeeSummariesForYear } = require('../utils/fees')

// Dashboard/salaries/expenses/report accept an optional academic_year_id
// query param to view a past year read-only (owner request 2026-07-12:
// finance data must stay reachable after a promotion moves the "current"
// year forward). Every mutation route still calls getYearId(db) with no
// req -- always the live current year, past years are never written to
// through this mechanism.
function getYearId(db, req) {
  const override = req?.query?.academic_year_id
  if (override) return override
  return db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
}

// ─── SUBSCRIPTION INFO (Mon Abonnement) ────────────────────
// Registered BEFORE requireAuth/requirePro on purpose: accessible to all
// tiers and all roles, and must stay reachable from the expired-license
// lock screen (Phase 8). Read-only license info — no sensitive data.

function extractDeadlineMonth(val) {
  if (!val) return null
  const s = String(val).trim()
  const dateMatch = s.match(/^(\d{4})-(\d{1,2})/)
  if (dateMatch) return parseInt(dateMatch[2])
  const n = parseInt(s)
  return (n >= 1 && n <= 12) ? n : null
}

router.get('/subscription', (req, res) => {
  const db = getDb()
  const license = db.prepare('SELECT * FROM license_state LIMIT 1').get()

  // Derive deadline date from current academic year's start year + stored month number
  const ayId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value

  // Scoped to students actually enrolled THIS year, matching the finance
  // dashboard (owner report 2026-07-13: this used to be a lifetime count
  // of every student ever created, inflating the billing number forever
  // as students graduated/were excluded across years).
  const actualStudents = ayId
    ? db.prepare(`
        SELECT COUNT(*) as cnt FROM students s
        JOIN enrollments e ON e.student_id = s.id AND e.academic_year_id = ? AND e.is_deleted = 0
        WHERE s.is_deleted = 0
      `).get(ayId)?.cnt || 0
    : 0

  const settings = db.prepare("SELECT key, value FROM app_settings WHERE key IN ('semester_1_deadline', 'semester_2_deadline', 'semester_3_deadline')").all()
  const deadlines = {}
  settings.forEach(s => { deadlines[s.key] = s.value })

  const ayLabel = ayId ? (db.prepare('SELECT label FROM academic_years WHERE id = ?').get(ayId)?.label || '') : ''
  const startYear = ayLabel.split('-')[0]?.trim() || String(new Date().getFullYear())
  const month1 = extractDeadlineMonth(deadlines.semester_1_deadline)
  const first_deadline = (month1 && startYear)
    ? `${startYear}-${String(month1).padStart(2, '0')}-01`
    : null

  return res.json({
    rate_per_student: license?.rate_per_student || 0,
    declared_student_count: license?.declared_student_count || 0,
    paid_student_count: license?.paid_student_count || 0,
    actual_student_count: actualStudents,
    tier: license?.license_tier || 'standard',
    expiry_date: license?.license_expiry || null,
    amount_paid: license?.amount_paid || 0,
    installation_fee: license?.installation_fee || 0,
    installation_fee_paid: !!license?.installation_fee_paid,
    first_deadline,
  })
})

// Everything below: authenticated + PRO tier only (finance module gate)
router.use(requireAuth)
router.use(requirePro)

function generateReceiptNumber(db, yearId, prefix) {
  const year = new Date().getFullYear()
  let number, candidate
  let attempts = 0
  do {
    number = String(Math.floor(100000000 + Math.random() * 900000000))
    candidate = `${prefix}-${year}-${number}`
    attempts++
    if (attempts > 50) break
  } while (
    db.prepare('SELECT 1 FROM payments WHERE receipt_number = ? LIMIT 1').get(candidate) ||
    db.prepare('SELECT 1 FROM salary_payments WHERE receipt_number = ? LIMIT 1').get(candidate) ||
    db.prepare('SELECT 1 FROM salary_entries WHERE receipt_number = ? LIMIT 1').get(candidate)
  )
  return candidate
}

// getFeeAmountForStudent + getStudentFeeSummary moved to ../utils/fees
// (shared with reportcards.js for the payment banner) — logic unchanged.

// ─── ACADEMIC YEARS (for the year-switcher dropdown) ───────
router.get('/academic-years', requirePermission('finance_dashboard.view'), (req, res) => {
  const db = getDb()
  const years = db.prepare('SELECT id, label, is_active, start_date, end_date FROM academic_years ORDER BY label DESC').all()
  return res.json({ years })
})

// ─── DASHBOARD ──────────────────────────────────────────────

router.get('/dashboard', requirePermission('finance_dashboard.view'), (req, res) => {
  const db = getDb()
  const yearId = getYearId(db, req)

  const students = db.prepare(`
    SELECT s.id as student_id, c.level_id, e.classroom_id
    FROM students s
    JOIN enrollments e ON e.student_id = s.id AND e.academic_year_id = ? AND e.is_deleted = 0
    JOIN classrooms c ON c.id = e.classroom_id
    WHERE s.is_deleted = 0
  `).all(yearId)

  let totalDue = 0
  let totalPaid = 0
  let overdueCount = 0
  const classAgg = {} // classroom_id -> { due, paid, count } — real per-class figures
  const summaries = getFeeSummariesForYear(db, yearId, new Map(students.map(s => [s.student_id, s.level_id])))
  for (const s of students) {
    const summary = summaries.get(s.student_id)
    totalDue += summary.totalDue
    totalPaid += summary.totalPaid
    if (summary.totalPaid < summary.totalDue) overdueCount++
    const agg = classAgg[s.classroom_id] || (classAgg[s.classroom_id] = { due: 0, paid: 0, count: 0 })
    agg.due += summary.totalDue
    agg.paid += summary.totalPaid
    agg.count++
  }

  const totalCollected = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE academic_year_id = ? AND is_deleted = 0').get(yearId)?.total || 0
  const totalOtherRevenues = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM other_revenues WHERE academic_year_id = ? AND is_deleted = 0').get(yearId)?.total || 0
  const totalExpenses = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE academic_year_id = ? AND is_deleted = 0').get(yearId)?.total || 0
  const totalSalaries = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM salary_payments WHERE academic_year_id = ? AND is_deleted = 0').get(yearId)?.total || 0

  const monthlyRevenue = db.prepare(`
    SELECT month, SUM(total) as total FROM (
      SELECT strftime('%Y-%m', payment_date) as month, amount as total
      FROM payments WHERE academic_year_id = ? AND is_deleted = 0
      UNION ALL
      SELECT strftime('%Y-%m', revenue_date) as month, amount as total
      FROM other_revenues WHERE academic_year_id = ? AND is_deleted = 0
    )
    GROUP BY month ORDER BY month
  `).all(yearId, yearId)

  // Combine misc expenses + salary payments into one monthly outflow series
  const monthlyExpenses = db.prepare(`
    SELECT month, SUM(total) as total FROM (
      SELECT strftime('%Y-%m', expense_date) as month, amount as total
      FROM expenses WHERE academic_year_id = ? AND is_deleted = 0
      UNION ALL
      SELECT strftime('%Y-%m', created_at) as month, amount as total
      FROM salary_payments WHERE academic_year_id = ? AND is_deleted = 0
    )
    GROUP BY month ORDER BY month
  `).all(yearId, yearId)

  // Real per-class collection: dues/paid aggregated per classroom from the
  // same live fee summaries as the global KPIs (no proration approximation)
  const classrooms = db.prepare(
    'SELECT id, label FROM classrooms WHERE academic_year_id = ? AND is_deleted = 0 ORDER BY label'
  ).all(yearId)
  const classStats = classrooms
    .map(c => {
      const agg = classAgg[c.id] || { due: 0, paid: 0, count: 0 }
      return {
        id: c.id,
        label: c.label,
        student_count: agg.count,
        expected: agg.due,
        collected: agg.paid,
        rate: agg.due > 0 ? Math.round((agg.paid / agg.due) * 100) : 0,
      }
    })
    .filter(c => c.student_count > 0)

  return res.json({
    total_students: students.length,
    total_due: totalDue,
    total_collected: totalCollected,
    total_other_revenues: totalOtherRevenues,
    total_outstanding: totalDue - totalCollected,
    total_expenses: totalExpenses,
    total_salaries: totalSalaries,
    net_balance: totalCollected + totalOtherRevenues - totalExpenses - totalSalaries,
    overdue_count: overdueCount,
    monthly_revenue: monthlyRevenue,
    monthly_expenses: monthlyExpenses,
    class_stats: classStats,
  })
})

// ─── FEE TYPES (settings) ───────────────────────────────────

router.get('/fee-types', requirePermission('fee_settings.view'), (req, res) => {
  const db = getDb()
  const yearId = getYearId(db)

  const types = db.prepare(`
    SELECT ft.* FROM fee_types ft
    WHERE ft.academic_year_id = ? ORDER BY ft.display_order, ft.name
  `).all(yearId)

  for (const ft of types) {
    ft.amounts = db.prepare(`
      SELECT fta.id, fta.level_id, fta.amount, l.name as level_name
      FROM fee_type_amounts fta
      LEFT JOIN levels l ON l.id = fta.level_id
      WHERE fta.fee_type_id = ?
      ORDER BY fta.level_id IS NULL DESC, l.display_order
    `).all(ft.id)
  }

  const levels = db.prepare('SELECT id, name, display_order FROM levels WHERE is_active = 1 ORDER BY display_order').all()

  return res.json({ fee_types: types, levels })
})

router.post('/fee-types', requirePermission('fee_settings.edit'), (req, res) => {
  const db = getDb()
  const yearId = getYearId(db)
  const { name, is_mandatory, display_order, amounts } = req.body
  if (!name || !amounts || !amounts.length) return res.status(400).json({ error: 'MISSING_FIELDS' })

  const existing = db.prepare('SELECT id FROM fee_types WHERE academic_year_id = ? AND name = ?').get(yearId, name.trim())
  if (existing) return res.status(409).json({ error: 'DUPLICATE' })

  db.transaction(() => {
    db.prepare('INSERT INTO fee_types (academic_year_id, name, is_mandatory, display_order) VALUES (?, ?, ?, ?)')
      .run(yearId, name.trim(), is_mandatory ? 1 : 0, display_order ?? 0)

    const ftId = db.prepare('SELECT last_insert_rowid() as id').get().id
    const amtStmt = db.prepare('INSERT INTO fee_type_amounts (fee_type_id, level_id, amount) VALUES (?, ?, ?)')
    for (const a of amounts) {
      amtStmt.run(ftId, a.level_id || null, parseFloat(a.amount))
    }

    if (is_mandatory) {
      const enrolled = db.prepare('SELECT student_id FROM enrollments WHERE academic_year_id = ? AND is_deleted = 0').all(yearId)
      for (const e of enrolled) autoAssignMandatoryFees(db, e.student_id, yearId)
    }
  })()

  return res.json({ success: true })
})

router.put('/fee-types/:id', requirePermission('fee_settings.edit'), (req, res) => {
  const db = getDb()
  const yearId = getYearId(db)
  const ft = db.prepare('SELECT id, is_system FROM fee_types WHERE id = ?').get(req.params.id)
  if (!ft) return res.status(404).json({ error: 'NOT_FOUND' })

  const { name, is_mandatory, display_order, amounts } = req.body

  db.transaction(() => {
    if (ft.is_system) {
      db.prepare('UPDATE fee_types SET name = ? WHERE id = ?').run(name?.trim(), ft.id)
    } else {
      db.prepare('UPDATE fee_types SET name = ?, is_mandatory = ?, display_order = ? WHERE id = ?')
        .run(name?.trim(), is_mandatory ? 1 : 0, display_order ?? 0, ft.id)
    }

    if (amounts && !ft.is_system) {
      db.prepare('DELETE FROM fee_type_amounts WHERE fee_type_id = ?').run(ft.id)
      const amtStmt = db.prepare('INSERT INTO fee_type_amounts (fee_type_id, level_id, amount) VALUES (?, ?, ?)')
      for (const a of amounts) {
        amtStmt.run(ft.id, a.level_id || null, parseFloat(a.amount))
      }
    }

    if (is_mandatory || ft.is_system) {
      const enrolled = db.prepare('SELECT student_id FROM enrollments WHERE academic_year_id = ? AND is_deleted = 0').all(yearId)
      for (const e of enrolled) autoAssignMandatoryFees(db, e.student_id, yearId)
    }
  })()

  return res.json({ success: true })
})

router.delete('/fee-types/:id', requirePermission('fee_settings.edit'), (req, res) => {
  const db = getDb()
  const ft = db.prepare('SELECT id, is_system FROM fee_types WHERE id = ?').get(req.params.id)
  if (!ft) return res.status(404).json({ error: 'NOT_FOUND' })
  if (ft.is_system) return res.status(403).json({ error: 'SYSTEM_FEE' })

  const used = db.prepare('SELECT COUNT(*) as cnt FROM payment_allocations WHERE fee_type_id = ?').get(req.params.id)?.cnt || 0
  if (used > 0) {
    db.prepare('UPDATE fee_types SET is_active = 0 WHERE id = ?').run(req.params.id)
  } else {
    db.prepare('DELETE FROM fee_type_amounts WHERE fee_type_id = ?').run(req.params.id)
    db.prepare('DELETE FROM student_fee_selections WHERE fee_type_id = ?').run(req.params.id)
    db.prepare('DELETE FROM fee_types WHERE id = ?').run(req.params.id)
  }
  return res.json({ success: true })
})

// ─── TUITION — student list with fee summary ────────────────

router.get('/tuition', requirePermission('tuition.view'), (req, res) => {
  const db = getDb()
  const yearId = getYearId(db)
  const { classroom_id, status, search, sort, page, limit } = req.query
  const pageNum = Math.max(1, parseInt(page) || 1)
  const pageSize = Math.min(200, Math.max(1, parseInt(limit) || 50))

  let studentsQuery = `
    SELECT s.id as student_id, s.full_name, s.matricule, e.classroom_id, c.label as classroom_label,
      c.level_id
    FROM students s
    JOIN enrollments e ON e.student_id = s.id AND e.academic_year_id = ? AND e.is_deleted = 0
    JOIN classrooms c ON c.id = e.classroom_id
    WHERE s.is_deleted = 0
  `
  const params = [yearId]
  if (classroom_id) { studentsQuery += ' AND e.classroom_id = ?'; params.push(classroom_id) }
  if (search) { studentsQuery += " AND (s.full_name LIKE ? OR s.matricule LIKE ?)"; params.push(`%${search}%`, `%${search}%`) }
  studentsQuery += ' ORDER BY c.label, s.full_name'

  const students = db.prepare(studentsQuery).all(...params)

  // Mandatory-fee backfill happens where fees actually change (fee-type
  // create/edit below, and on enrollment in students.js) -- not here.
  // Doing it on every GET meant hundreds of redundant writes per request.
  const summaries = getFeeSummariesForYear(db, yearId, new Map(students.map(s => [s.student_id, s.level_id])))
  const rows = students.map(s => {
    const summary = summaries.get(s.student_id)
    return {
      ...s,
      total_due: summary.totalDue,
      total_paid: summary.totalPaid,
      remaining: summary.remaining,
      status: summary.status,
    }
  })

  let filtered = rows
  if (status) filtered = filtered.filter(r => r.status === status)

  if (sort === 'owed_desc') filtered.sort((a, b) => b.remaining - a.remaining)
  else if (sort === 'owed_asc') filtered.sort((a, b) => a.remaining - b.remaining)

  // status/sort depend on the computed summary, not a DB column, so
  // filtering/sorting happens in memory first (still O(1) queries thanks to
  // the batched summary above) -- pagination is just a slice at the end.
  // Aggregates are computed over the full filtered set BEFORE slicing, so
  // the summary cards reflect all matching students, not just the page.
  const total = filtered.length
  const aggTotalDue = filtered.reduce((s, r) => s + r.total_due, 0)
  const aggTotalPaid = filtered.reduce((s, r) => s + r.total_paid, 0)
  const paged = filtered.slice((pageNum - 1) * pageSize, pageNum * pageSize)

  const classrooms = db.prepare('SELECT c.id, c.label FROM classrooms c WHERE c.academic_year_id = ? AND c.is_deleted = 0 ORDER BY c.label').all(yearId)

  return res.json({
    students: paged, classrooms, total, page: pageNum, page_size: pageSize,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
    total_due: aggTotalDue, total_paid: aggTotalPaid,
  })
})

// ─── TUITION — student detail ───────────────────────────────

router.get('/tuition/:studentId', requirePermission('tuition.view'), (req, res) => {
  const db = getDb()
  const yearId = getYearId(db)
  const { studentId } = req.params

  const student = db.prepare(`
    SELECT s.id, s.full_name, s.matricule, c.label as classroom_label, c.level_id,
      ay.label as year_label
    FROM students s
    JOIN enrollments e ON e.student_id = s.id AND e.academic_year_id = ? AND e.is_deleted = 0
    JOIN classrooms c ON c.id = e.classroom_id
    JOIN academic_years ay ON ay.id = e.academic_year_id
    WHERE s.id = ? AND s.is_deleted = 0
  `).get(yearId, studentId)
  if (!student) return res.status(404).json({ error: 'NOT_FOUND' })

  const summary = getStudentFeeSummary(db, studentId, yearId, student.level_id)

  const payments = db.prepare(`
    SELECT p.*, u.full_name as recorded_by_name
    FROM payments p
    LEFT JOIN users u ON u.id = p.recorded_by
    WHERE p.student_id = ? AND p.academic_year_id = ? AND p.is_deleted = 0
    ORDER BY p.payment_date DESC
  `).all(studentId, yearId)

  for (const p of payments) {
    p.allocations = db.prepare(`
      SELECT pa.*, ft.name as fee_name FROM payment_allocations pa
      JOIN fee_types ft ON ft.id = pa.fee_type_id
      WHERE pa.payment_id = ?
    `).all(p.id)
  }

  return res.json({ student, fees: summary.fees, summary: { totalDue: summary.totalDue, totalPaid: summary.totalPaid, remaining: summary.remaining, status: summary.status }, payments })
})

// ─── TUITION — fee selections (optional fee toggle) ─────────

router.get('/tuition/:studentId/fee-selections', requirePermission('tuition.view'), (req, res) => {
  const db = getDb()
  const yearId = getYearId(db)
  const { studentId } = req.params

  const student = db.prepare(`
    SELECT s.id, c.level_id FROM students s
    JOIN enrollments e ON e.student_id = s.id AND e.academic_year_id = ? AND e.is_deleted = 0
    JOIN classrooms c ON c.id = e.classroom_id WHERE s.id = ?
  `).get(yearId, studentId)
  if (!student) return res.status(404).json({ error: 'NOT_FOUND' })

  const allFees = db.prepare('SELECT * FROM fee_types WHERE academic_year_id = ? AND is_active = 1 ORDER BY display_order').all(yearId)
  const selections = db.prepare('SELECT fee_type_id, opted_in FROM student_fee_selections WHERE student_id = ? AND academic_year_id = ?').all(studentId, yearId)
  const selMap = {}
  selections.forEach(s => { selMap[s.fee_type_id] = s.opted_in })

  const paidFees = db.prepare(`
    SELECT DISTINCT pa.fee_type_id FROM payment_allocations pa
    JOIN payments p ON p.id = pa.payment_id
    WHERE p.student_id = ? AND p.academic_year_id = ? AND p.is_deleted = 0
  `).all(studentId, yearId)
  const paidSet = new Set(paidFees.map(r => r.fee_type_id))

  const result = allFees.map(ft => ({
    fee_type_id: ft.id,
    name: ft.name,
    is_mandatory: ft.is_mandatory,
    is_system: ft.is_system,
    amount: getFeeAmountForStudent(db, ft.id, student.level_id),
    opted_in: selMap[ft.id] === 1,
    has_payments: paidSet.has(ft.id),
    can_toggle: !ft.is_mandatory && !ft.is_system && !paidSet.has(ft.id),
  }))

  return res.json({ selections: result })
})

router.put('/tuition/:studentId/fee-selections', requirePermission('tuition.edit'), (req, res) => {
  const db = getDb()
  const yearId = getYearId(db)
  const { studentId } = req.params
  const { fee_type_id, opted_in } = req.body

  const ft = db.prepare('SELECT id, is_mandatory, is_system FROM fee_types WHERE id = ?').get(fee_type_id)
  if (!ft) return res.status(404).json({ error: 'NOT_FOUND' })
  if (ft.is_mandatory || ft.is_system) return res.status(403).json({ error: 'CANNOT_TOGGLE_MANDATORY' })

  if (!opted_in) {
    const hasPaid = db.prepare(`
      SELECT COUNT(*) as cnt FROM payment_allocations pa
      JOIN payments p ON p.id = pa.payment_id
      WHERE p.student_id = ? AND p.academic_year_id = ? AND p.is_deleted = 0 AND pa.fee_type_id = ?
    `).get(studentId, yearId, fee_type_id)?.cnt || 0
    if (hasPaid > 0) return res.status(403).json({ error: 'HAS_PAYMENTS', message: 'Ce frais a déjà reçu un paiement.' })
  }

  db.prepare(`
    INSERT INTO student_fee_selections (student_id, fee_type_id, academic_year_id, opted_in, opted_in_by)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(student_id, fee_type_id, academic_year_id)
    DO UPDATE SET opted_in = excluded.opted_in
  `).run(studentId, fee_type_id, yearId, opted_in ? 1 : 0, req.user.id)

  return res.json({ success: true })
})

// ─── TUITION — record payment ───────────────────────────────

router.post('/tuition/:studentId/pay', requirePermission('tuition.edit'), (req, res) => {
  const db = getDb()
  const yearId = getYearId(db)
  const { studentId } = req.params
  const { fees, amount_received, payment_method, payer_name, reference, notes } = req.body

  if (!fees || !Array.isArray(fees) || fees.length === 0)
    return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Sélectionnez au moins un frais à payer' })

  const amountReceived = parseFloat(amount_received) || 0
  if (amountReceived <= 0) return res.status(400).json({ error: 'INVALID_AMOUNT', message: 'Montant remis invalide' })

  const student = db.prepare(`
    SELECT s.id, s.full_name, c.level_id FROM students s
    JOIN enrollments e ON e.student_id = s.id AND e.academic_year_id = ? AND e.is_deleted = 0
    JOIN classrooms c ON c.id = e.classroom_id WHERE s.id = ?
  `).get(yearId, studentId)
  if (!student) return res.status(404).json({ error: 'NOT_FOUND' })

  const summary = getStudentFeeSummary(db, studentId, yearId, student.level_id)
  const feeMap = {}
  summary.fees.forEach(f => { feeMap[f.fee_type_id] = f })

  const allocations = []
  let totalToRecord = 0
  for (const item of fees) {
    const feeTypeId = parseInt(item.fee_type_id)
    const requested = parseFloat(item.amount)
    if (!feeTypeId || !requested || requested <= 0) continue
    const fee = feeMap[feeTypeId]
    if (!fee || fee.remaining <= 0) continue
    const capped = Math.min(requested, fee.remaining)
    allocations.push({ fee_type_id: feeTypeId, amount: capped })
    totalToRecord += capped
  }

  if (allocations.length === 0 || totalToRecord <= 0)
    return res.status(400).json({ error: 'NOTHING_OWED', message: 'Aucun montant valide à enregistrer' })

  const changeToReturn = Math.max(0, amountReceived - totalToRecord)

  let paymentId
  db.transaction(() => {
    const receipt = generateReceiptNumber(db, yearId, 'REC')
    const uid = generateUUID()
    const paymentType = (totalToRecord >= summary.remaining) ? 'complete' : 'partial'

    db.prepare(`
      INSERT INTO payments (payment_uid, student_id, academic_year_id, amount, payment_date, payment_type, payment_method, receipt_number, payer_name, receiver_name, reference, notes, recorded_by)
      VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(uid, studentId, yearId, totalToRecord, paymentType, payment_method || 'especes', receipt, payer_name || null, req.user.fullName || null, reference || null, notes || null, req.user.id)

    paymentId = db.prepare('SELECT last_insert_rowid() as id').get().id

    const allocStmt = db.prepare('INSERT INTO payment_allocations (payment_id, fee_type_id, amount) VALUES (?, ?, ?)')
    for (const a of allocations) {
      allocStmt.run(paymentId, a.fee_type_id, a.amount)
    }

    db.prepare(`
      INSERT INTO ledger_transactions (transaction_uid, type, source_type, source_id, academic_year_id, amount, description, transaction_date, created_by)
      VALUES (?, 'income', 'payment', ?, ?, ?, ?, datetime('now'), ?)
    `).run(generateUUID(), paymentId, yearId, totalToRecord, `Paiement scolarité - ${student.full_name}`, req.user.id)
  })()

  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId)
  payment.allocations = db.prepare('SELECT pa.*, ft.name as fee_name FROM payment_allocations pa JOIN fee_types ft ON ft.id = pa.fee_type_id WHERE pa.payment_id = ?').all(paymentId)

  return res.json({ success: true, payment, amount_recorded: totalToRecord, change_to_return: changeToReturn })
})

// ─── SALARIES ───────────────────────────────────────────────

router.get('/salaries', requirePermission('salaries.view'), (req, res) => {
  const db = getDb()
  const yearId = getYearId(db, req)
  const { pay_period } = req.query
  const targetMonth = pay_period || new Date().toISOString().slice(0, 7)

  const teachers = db.prepare('SELECT id, full_name, matricule, hourly_rate FROM teachers WHERE is_active = 1 AND is_deleted = 0 ORDER BY full_name').all()

  const monthlyPaid = db.prepare(`
    SELECT teacher_id, SUM(amount) as total_paid
    FROM salary_payments
    WHERE academic_year_id = ? AND pay_period = ? AND is_deleted = 0
    GROUP BY teacher_id
  `).all(yearId, targetMonth)
  const paidMap = {}
  monthlyPaid.forEach(p => { paidMap[p.teacher_id] = p.total_paid })

  const monthlyHours = db.prepare(`
    SELECT teacher_id, SUM(hours_credited) as total_hours
    FROM teacher_daily_log
    WHERE academic_year_id = ? AND strftime('%Y-%m', log_date) = ?
    GROUP BY teacher_id
  `).all(yearId, targetMonth)
  const hoursMap = {}
  monthlyHours.forEach(h => { hoursMap[h.teacher_id] = h.total_hours })

  const prevuesRows = db.prepare(`
    WITH RECURSIVE days(d) AS (
      SELECT date(? || '-01')
      UNION ALL SELECT date(d, '+1 day') FROM days WHERE d < date(? || '-01', '+1 month', '-1 day')
    )
    SELECT te.teacher_id,
      SUM(CAST(substr(te.end_time, 1, 2) AS INTEGER) - CAST(substr(te.start_time, 1, 2) AS INTEGER)) AS hours_prevues
    FROM days
    JOIN timetable_entries te ON te.day_of_week = CAST(strftime('%w', d) AS INTEGER)
      AND te.academic_year_id = ?
    WHERE CAST(strftime('%w', d) AS INTEGER) BETWEEN 1 AND 6
    GROUP BY te.teacher_id
  `).all(targetMonth, targetMonth, yearId)
  const prevuesMap = {}
  prevuesRows.forEach(r => { prevuesMap[r.teacher_id] = r.hours_prevues })

  const rows = teachers.map(t => {
    const prevues = prevuesMap[t.id] || 0
    const reelles = hoursMap[t.id] || 0
    const totalPaid = paidMap[t.id] || 0
    return {
      ...t,
      hours_prevues: prevues,
      hours_reelles: reelles,
      calculated_amount: reelles * (t.hourly_rate || 0),
      total_paid: totalPaid,
    }
  })

  const totalCalculated = rows.reduce((s, r) => s + r.calculated_amount, 0)
  const totalVerse = rows.reduce((s, r) => s + r.total_paid, 0)

  return res.json({
    teachers: rows,
    month: targetMonth,
    summary: { total_calculated: totalCalculated, total_verse: totalVerse, total_count: rows.length },
  })
})

// ─── SALARY — teacher detail (payments for a month) ─────────
// NOTE: must be defined before /:teacherId to avoid route shadowing

router.get('/salaries/:teacherId', requirePermission('salaries.view'), (req, res) => {
  const db = getDb()
  const yearId = getYearId(db, req)
  const { teacherId } = req.params
  const { pay_period } = req.query
  const targetMonth = pay_period || new Date().toISOString().slice(0, 7)

  const teacher = db.prepare('SELECT id, full_name, matricule, hourly_rate FROM teachers WHERE id = ? AND is_deleted = 0').get(teacherId)
  if (!teacher) return res.status(404).json({ error: 'NOT_FOUND' })

  const hours_prevues = db.prepare(`
    WITH RECURSIVE days(d) AS (
      SELECT date(? || '-01')
      UNION ALL SELECT date(d, '+1 day') FROM days WHERE d < date(? || '-01', '+1 month', '-1 day')
    )
    SELECT SUM(CAST(substr(te.end_time, 1, 2) AS INTEGER) - CAST(substr(te.start_time, 1, 2) AS INTEGER)) AS hp
    FROM days
    JOIN timetable_entries te ON te.day_of_week = CAST(strftime('%w', d) AS INTEGER)
      AND te.teacher_id = ? AND te.academic_year_id = ?
    WHERE CAST(strftime('%w', d) AS INTEGER) BETWEEN 1 AND 6
  `).get(targetMonth, targetMonth, teacherId, yearId)?.hp || 0

  const logRow = db.prepare(`
    SELECT SUM(hours_credited) as total_hours
    FROM teacher_daily_log
    WHERE teacher_id = ? AND academic_year_id = ? AND strftime('%Y-%m', log_date) = ?
  `).get(teacherId, yearId, targetMonth)
  const hours_reelles = logRow?.total_hours || 0

  const payments = db.prepare(`
    SELECT sp.*, u.full_name as recorded_by_name
    FROM salary_payments sp
    LEFT JOIN users u ON u.id = sp.recorded_by
    WHERE sp.teacher_id = ? AND sp.academic_year_id = ? AND sp.pay_period = ? AND sp.is_deleted = 0
    ORDER BY sp.created_at DESC
  `).all(teacherId, yearId, targetMonth)

  const total_paid = payments.reduce((s, p) => s + p.amount, 0)

  return res.json({
    teacher,
    month: targetMonth,
    hours_prevues,
    hours_reelles,
    calculated_amount: hours_reelles * (teacher.hourly_rate || 0),
    total_paid,
    payments,
  })
})

router.post('/salaries/:teacherId/pay', requirePermission('salaries.edit'), (req, res) => {
  const db = getDb()
  const yearId = getYearId(db)
  const { teacherId } = req.params
  const { pay_period, amount, payment_method, payer_name, reference, notes, adjustment_reason } = req.body

  if (!pay_period || !amount || parseFloat(amount) <= 0)
    return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Mois et montant requis' })

  const teacher = db.prepare('SELECT id, full_name, hourly_rate FROM teachers WHERE id = ? AND is_deleted = 0').get(teacherId)
  if (!teacher) return res.status(404).json({ error: 'NOT_FOUND' })

  // Server-authoritative calculated amount for the month (hours × rate),
  // snapshotted on the payment row. Adjustment reason is mandatory when the
  // paid amount differs from the calculated REMAINING (multi-payment model).
  const monthHours = db.prepare(`
    SELECT COALESCE(SUM(hours_credited), 0) as h FROM teacher_daily_log
    WHERE teacher_id = ? AND academic_year_id = ? AND strftime('%Y-%m', log_date) = ?
  `).get(teacherId, yearId, pay_period)?.h || 0
  const calculatedAmount = monthHours * (teacher.hourly_rate || 0)

  const alreadyPaid = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as t FROM salary_payments
    WHERE teacher_id = ? AND academic_year_id = ? AND pay_period = ? AND is_deleted = 0
  `).get(teacherId, yearId, pay_period)?.t || 0

  const calculatedRemaining = Math.max(0, calculatedAmount - alreadyPaid)
  const isAdjusted = calculatedAmount > 0 && Math.abs(parseFloat(amount) - calculatedRemaining) > 0.01
  if (isAdjusted && !adjustment_reason?.trim()) {
    return res.status(400).json({
      error: 'ADJUSTMENT_REASON_REQUIRED',
      message: `Motif d'ajustement requis (montant différent du calculé restant: ${Math.round(calculatedRemaining)} F)`,
    })
  }

  const uid = generateUUID()
  const receipt = generateReceiptNumber(db, yearId, 'SAL')
  let paymentId

  db.transaction(() => {
    db.prepare(`
      INSERT INTO salary_payments
        (payment_uid, teacher_id, academic_year_id, pay_period, amount, calculated_amount, adjustment_reason, payment_method, receipt_number, payer_name, receiver_name, reference, notes, recorded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(uid, teacherId, yearId, pay_period, parseFloat(amount), calculatedAmount, isAdjusted ? adjustment_reason.trim() : null, payment_method || 'especes', receipt, payer_name || null, req.user?.fullName || null, reference || null, notes || null, req.user.id)

    paymentId = db.prepare('SELECT last_insert_rowid() as id').get().id

    db.prepare(`
      INSERT INTO ledger_transactions
        (transaction_uid, type, source_type, source_id, academic_year_id, amount, description, transaction_date, created_by)
      VALUES (?, 'expense', 'salary', ?, ?, ?, ?, datetime('now'), ?)
    `).run(generateUUID(), teacherId, yearId, parseFloat(amount), `Salaire ${pay_period} - ${teacher.full_name}`, req.user.id)
  })()

  const payment = db.prepare('SELECT * FROM salary_payments WHERE id = ?').get(paymentId)
  return res.json({ success: true, payment })
})

// ─── EXPENSES ───────────────────────────────────────────────

router.get('/expenses', requirePermission('expenses.view'), (req, res) => {
  const db = getDb()
  const yearId = getYearId(db, req)
  const { month, category_id } = req.query

  // Misc expenses
  let expQuery = `
    SELECT e.id, 'expense' as row_type, e.expense_date as date_col, ec.name as category_name,
      e.category_id, e.description, e.amount, e.receipt_ref, u.full_name as recorded_by_name,
      NULL as teacher_id, NULL as pay_period
    FROM expenses e
    LEFT JOIN expense_categories ec ON ec.id = e.category_id
    LEFT JOIN users u ON u.id = e.recorded_by
    WHERE e.academic_year_id = ? AND e.is_deleted = 0
  `
  const expParams = [yearId]
  if (month) { expQuery += " AND strftime('%Y-%m', e.expense_date) = ?"; expParams.push(month) }
  // When filtering by a specific expense category, exclude salary rows entirely
  const filterBySalary = category_id === 'salaires'
  if (category_id && !filterBySalary) { expQuery += ' AND e.category_id = ?'; expParams.push(category_id) }

  const miscRows = filterBySalary ? [] : db.prepare(expQuery).all(...expParams)

  // Salary payments — shown when no category filter OR when 'salaires' is selected
  let salaryRows = []
  if (!category_id || filterBySalary) {
    let salQuery = `
      SELECT sp.id, 'salary' as row_type, sp.created_at as date_col, 'Salaires' as category_name,
        NULL as category_id, t.full_name as description, sp.amount, sp.receipt_number as receipt_ref,
        u.full_name as recorded_by_name, sp.teacher_id, sp.pay_period
      FROM salary_payments sp
      JOIN teachers t ON t.id = sp.teacher_id
      LEFT JOIN users u ON u.id = sp.recorded_by
      WHERE sp.academic_year_id = ? AND sp.is_deleted = 0
    `
    const salParams = [yearId]
    if (month) { salQuery += " AND strftime('%Y-%m', sp.created_at) = ?"; salParams.push(month) }
    salQuery += ' ORDER BY sp.created_at DESC'
    salaryRows = db.prepare(salQuery).all(...salParams)
  }

  const allRows = [...miscRows, ...salaryRows].sort((a, b) => (b.date_col || '').localeCompare(a.date_col || ''))

  const categories = db.prepare('SELECT * FROM expense_categories WHERE is_active = 1 ORDER BY name').all()

  const miscTotals = db.prepare(`
    SELECT ec.name as category, SUM(e.amount) as total
    FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id
    WHERE e.academic_year_id = ? AND e.is_deleted = 0
    GROUP BY ec.name ORDER BY total DESC
  `).all(yearId)

  const salaryTotal = db.prepare(
    'SELECT COALESCE(SUM(amount), 0) as total FROM salary_payments WHERE academic_year_id = ? AND is_deleted = 0'
  ).get(yearId)?.total || 0

  const totals = [
    ...miscTotals,
    ...(salaryTotal > 0 ? [{ category: 'Salaires', total: salaryTotal }] : []),
  ]

  return res.json({ expenses: allRows, categories, totals })
})

router.get('/expenses/months', requirePermission('expenses.view'), (req, res) => {
  const db = getDb()
  const yearId = getYearId(db, req)

  // Months with data = misc expenses UNION salary payments (both shown on the page)
  const months = db.prepare(`
    SELECT month, SUM(total) as total, COUNT(*) as count FROM (
      SELECT strftime('%Y-%m', expense_date) as month, amount as total
      FROM expenses WHERE academic_year_id = ? AND is_deleted = 0
      UNION ALL
      SELECT strftime('%Y-%m', created_at) as month, amount as total
      FROM salary_payments WHERE academic_year_id = ? AND is_deleted = 0
    )
    GROUP BY month ORDER BY month
  `).all(yearId, yearId)

  return res.json({ months })
})

router.post('/expenses', requirePermission('expenses.edit'), (req, res) => {
  const db = getDb()
  const yearId = getYearId(db)
  const { category_id, description, amount, expense_date, receipt_ref } = req.body

  if (!category_id || !amount || amount <= 0) return res.status(400).json({ error: 'MISSING_FIELDS' })

  const uid = generateUUID()
  db.transaction(() => {
    db.prepare(`
      INSERT INTO expenses (expense_uid, category_id, description, amount, expense_date, academic_year_id, receipt_ref, recorded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(uid, category_id, description || null, parseFloat(amount), expense_date || new Date().toISOString().slice(0, 10), yearId, receipt_ref || null, req.user.id)

    const expId = db.prepare('SELECT last_insert_rowid() as id').get().id
    const catName = db.prepare('SELECT name FROM expense_categories WHERE id = ?').get(category_id)?.name || ''

    db.prepare(`
      INSERT INTO ledger_transactions (transaction_uid, type, source_type, source_id, academic_year_id, amount, description, transaction_date, created_by)
      VALUES (?, 'expense', 'expense', ?, ?, ?, ?, ?, ?)
    `).run(generateUUID(), expId, yearId, parseFloat(amount), `${catName} - ${description || ''}`.trim(), expense_date || new Date().toISOString().slice(0, 10), req.user.id)
  })()

  return res.json({ success: true })
})

router.delete('/expenses/:id', requirePermission('expenses.edit'), (req, res) => {
  const db = getDb()
  db.prepare("UPDATE expenses SET is_deleted = 1, deleted_at = datetime('now') WHERE id = ?").run(req.params.id)
  return res.json({ success: true })
})

// ─── EXPENSE CATEGORIES ─────────────────────────────────────

router.get('/expense-categories', requirePermission('expenses.view'), (req, res) => {
  const db = getDb()
  const categories = db.prepare('SELECT * FROM expense_categories WHERE is_active = 1 ORDER BY name').all()
  return res.json({ categories })
})

router.post('/expense-categories', requirePermission('expenses.edit'), (req, res) => {
  const db = getDb()
  const { name, description } = req.body
  if (!name) return res.status(400).json({ error: 'MISSING_FIELDS' })

  const existing = db.prepare('SELECT id FROM expense_categories WHERE name = ?').get(name.trim())
  if (existing) return res.status(409).json({ error: 'DUPLICATE' })

  db.prepare('INSERT INTO expense_categories (name, description) VALUES (?, ?)').run(name.trim(), description || null)
  return res.json({ success: true })
})

router.delete('/expense-categories/:id', requirePermission('expenses.edit'), (req, res) => {
  const db = getDb()
  const cat = db.prepare('SELECT is_system FROM expense_categories WHERE id = ?').get(req.params.id)
  if (cat?.is_system) return res.status(403).json({ error: 'SYSTEM_CATEGORY' })

  const used = db.prepare('SELECT COUNT(*) as cnt FROM expenses WHERE category_id = ? AND is_deleted = 0').get(req.params.id)?.cnt || 0
  if (used > 0) {
    db.prepare('UPDATE expense_categories SET is_active = 0 WHERE id = ?').run(req.params.id)
  } else {
    db.prepare('DELETE FROM expense_categories WHERE id = ?').run(req.params.id)
  }
  return res.json({ success: true })
})

// ─── OTHER REVENUES ─────────────────────────────────────────

router.get('/other-revenues', requirePermission('expenses.view'), (req, res) => {
  const db = getDb()
  const yearId = getYearId(db)
  const { month, category_id } = req.query

  let query = `
    SELECT r.*, rc.name as category_name, u.full_name as recorded_by_name
    FROM other_revenues r
    JOIN revenue_categories rc ON rc.id = r.category_id
    LEFT JOIN users u ON u.id = r.recorded_by
    WHERE r.academic_year_id = ? AND r.is_deleted = 0
  `
  const params = [yearId]
  if (month) { query += " AND strftime('%Y-%m', r.revenue_date) = ?"; params.push(month) }
  if (category_id) { query += ' AND r.category_id = ?'; params.push(category_id) }
  query += ' ORDER BY r.revenue_date DESC, r.created_at DESC'

  const revenues = db.prepare(query).all(...params)
  const categories = db.prepare('SELECT * FROM revenue_categories WHERE is_active = 1 ORDER BY name').all()

  const totals = db.prepare(`
    SELECT rc.name as category, SUM(r.amount) as total
    FROM other_revenues r JOIN revenue_categories rc ON rc.id = r.category_id
    WHERE r.academic_year_id = ? AND r.is_deleted = 0
    GROUP BY rc.name ORDER BY total DESC
  `).all(yearId)

  return res.json({ revenues, categories, totals })
})

router.post('/other-revenues', requirePermission('expenses.edit'), (req, res) => {
  const db = getDb()
  const yearId = getYearId(db)
  const { category_id, description, amount, revenue_date, reference } = req.body

  if (!category_id || !amount || parseFloat(amount) <= 0)
    return res.status(400).json({ error: 'MISSING_FIELDS' })

  const uid = generateUUID()
  const dateVal = revenue_date || new Date().toISOString().slice(0, 10)

  db.transaction(() => {
    db.prepare(`
      INSERT INTO other_revenues (revenue_uid, category_id, academic_year_id, description, amount, revenue_date, reference, recorded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(uid, category_id, yearId, description || null, parseFloat(amount), dateVal, reference || null, req.user.id)

    const revId = db.prepare('SELECT last_insert_rowid() as id').get().id
    const catName = db.prepare('SELECT name FROM revenue_categories WHERE id = ?').get(category_id)?.name || ''

    db.prepare(`
      INSERT INTO ledger_transactions (transaction_uid, type, source_type, source_id, academic_year_id, amount, description, transaction_date, created_by)
      VALUES (?, 'income', 'other_revenue', ?, ?, ?, ?, ?, ?)
    `).run(generateUUID(), revId, yearId, parseFloat(amount), `${catName}${description ? ' - ' + description : ''}`, dateVal, req.user.id)
  })()

  return res.json({ success: true })
})

router.delete('/other-revenues/:id', requirePermission('expenses.edit'), (req, res) => {
  const db = getDb()
  db.prepare("UPDATE other_revenues SET is_deleted = 1 WHERE id = ?").run(req.params.id)
  return res.json({ success: true })
})

router.get('/revenue-categories', requirePermission('expenses.view'), (req, res) => {
  const db = getDb()
  const categories = db.prepare('SELECT * FROM revenue_categories WHERE is_active = 1 ORDER BY name').all()
  return res.json({ categories })
})

router.post('/revenue-categories', requirePermission('expenses.edit'), (req, res) => {
  const db = getDb()
  const { name } = req.body
  if (!name) return res.status(400).json({ error: 'MISSING_FIELDS' })
  const existing = db.prepare('SELECT id FROM revenue_categories WHERE name = ?').get(name.trim())
  if (existing) return res.status(409).json({ error: 'DUPLICATE' })
  db.prepare('INSERT INTO revenue_categories (name) VALUES (?)').run(name.trim())
  return res.json({ success: true })
})

router.delete('/revenue-categories/:id', requirePermission('expenses.edit'), (req, res) => {
  const db = getDb()
  const cat = db.prepare('SELECT is_system FROM revenue_categories WHERE id = ?').get(req.params.id)
  if (!cat) return res.status(404).json({ error: 'NOT_FOUND' })
  if (cat.is_system) return res.status(403).json({ error: 'SYSTEM_CATEGORY' })
  const used = db.prepare('SELECT COUNT(*) as cnt FROM other_revenues WHERE category_id = ? AND is_deleted = 0').get(req.params.id)?.cnt || 0
  if (used > 0) {
    db.prepare('UPDATE revenue_categories SET is_active = 0 WHERE id = ?').run(req.params.id)
  } else {
    db.prepare('DELETE FROM revenue_categories WHERE id = ?').run(req.params.id)
  }
  return res.json({ success: true })
})

// ─── RAPPORT FINANCIER (annual month-by-month report) ──────

router.get('/report', requirePermission('finance_report.view'), (req, res) => {
  const db = getDb()
  const yearId = getYearId(db, req)
  const year = yearId ? db.prepare('SELECT label, start_date, end_date FROM academic_years WHERE id = ?').get(yearId) : null
  const school = db.prepare('SELECT school_name, city, country FROM school_config LIMIT 1').get()

  const rows = {} // 'YYYY-MM' -> { tuition, other, expenses, salaries }
  const add = (list, key) => list.forEach(r => {
    if (!rows[r.month]) rows[r.month] = { tuition: 0, other: 0, expenses: 0, salaries: 0 }
    rows[r.month][key] = r.total || 0
  })

  add(db.prepare(`
    SELECT strftime('%Y-%m', payment_date) as month, SUM(amount) as total
    FROM payments WHERE academic_year_id = ? AND is_deleted = 0 GROUP BY month
  `).all(yearId), 'tuition')

  add(db.prepare(`
    SELECT strftime('%Y-%m', revenue_date) as month, SUM(amount) as total
    FROM other_revenues WHERE academic_year_id = ? AND is_deleted = 0 GROUP BY month
  `).all(yearId), 'other')

  add(db.prepare(`
    SELECT strftime('%Y-%m', expense_date) as month, SUM(amount) as total
    FROM expenses WHERE academic_year_id = ? AND is_deleted = 0 GROUP BY month
  `).all(yearId), 'expenses')

  add(db.prepare(`
    SELECT strftime('%Y-%m', created_at) as month, SUM(amount) as total
    FROM salary_payments WHERE academic_year_id = ? AND is_deleted = 0 GROUP BY month
  `).all(yearId), 'salaries')

  const months = Object.keys(rows).sort().map(m => {
    const r = rows[m]
    return { month: m, ...r, solde: r.tuition + r.other - r.expenses - r.salaries }
  })

  const totals = months.reduce((acc, m) => ({
    tuition: acc.tuition + m.tuition,
    other: acc.other + m.other,
    expenses: acc.expenses + m.expenses,
    salaries: acc.salaries + m.salaries,
    solde: acc.solde + m.solde,
  }), { tuition: 0, other: 0, expenses: 0, salaries: 0, solde: 0 })

  return res.json({ year_label: year?.label || '', school, months, totals })
})

// ─── RECEIPTS (print data) ─────────────────────────────────

router.get('/receipt/payment/:id', requirePermission('tuition.view'), (req, res) => {
  const db = getDb()
  const school = db.prepare('SELECT * FROM school_config LIMIT 1').get()

  const payment = db.prepare(`
    SELECT p.*, s.full_name as student_name, s.matricule, c.label as classroom_label
    FROM payments p
    JOIN students s ON s.id = p.student_id
    JOIN enrollments e ON e.student_id = s.id AND e.academic_year_id = p.academic_year_id AND e.is_deleted = 0
    JOIN classrooms c ON c.id = e.classroom_id
    WHERE p.id = ?
  `).get(req.params.id)
  if (!payment) return res.status(404).json({ error: 'NOT_FOUND' })

  payment.allocations = db.prepare('SELECT pa.*, ft.name as fee_name FROM payment_allocations pa JOIN fee_types ft ON ft.id = pa.fee_type_id WHERE pa.payment_id = ?').all(req.params.id)

  return res.json({ type: 'payment', school, data: payment })
})

router.get('/receipt/salary/:id', requirePermission('salaries.view'), (req, res) => {
  const db = getDb()
  const school = db.prepare('SELECT * FROM school_config LIMIT 1').get()

  // Try salary_payments first (new system), fall back to salary_entries (legacy)
  let entry = db.prepare(`
    SELECT sp.*, t.full_name as teacher_name, t.matricule as teacher_matricule, t.hourly_rate,
      sp.pay_period as month
    FROM salary_payments sp JOIN teachers t ON t.id = sp.teacher_id WHERE sp.id = ?
  `).get(req.params.id)

  if (!entry) {
    entry = db.prepare(`
      SELECT se.*, t.full_name as teacher_name, t.matricule as teacher_matricule, t.hourly_rate
      FROM salary_entries se JOIN teachers t ON t.id = se.teacher_id WHERE se.id = ?
    `).get(req.params.id)
  }

  if (!entry) return res.status(404).json({ error: 'NOT_FOUND' })
  return res.json({ type: 'salary', school, data: entry })
})

router.get('/receipt/statement/:studentId', requirePermission('tuition.view'), (req, res) => {
  const db = getDb()
  const yearId = getYearId(db)
  const school = db.prepare('SELECT * FROM school_config LIMIT 1').get()

  const student = db.prepare(`
    SELECT s.id, s.full_name, s.matricule, c.label as classroom_label, c.level_id,
      ay.label as year_label
    FROM students s
    JOIN enrollments e ON e.student_id = s.id AND e.academic_year_id = ? AND e.is_deleted = 0
    JOIN classrooms c ON c.id = e.classroom_id
    JOIN academic_years ay ON ay.id = e.academic_year_id
    WHERE s.id = ? AND s.is_deleted = 0
  `).get(yearId, req.params.studentId)
  if (!student) return res.status(404).json({ error: 'NOT_FOUND' })

  const summary = getStudentFeeSummary(db, req.params.studentId, yearId, student.level_id)

  return res.json({ type: 'statement', school, student, fees: summary.fees, summary: { totalDue: summary.totalDue, totalPaid: summary.totalPaid, remaining: summary.remaining } })
})

module.exports = router
