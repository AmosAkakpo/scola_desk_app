function autoAssignMandatoryFees(db, studentId, yearId) {
  const mandatoryFees = db.prepare(
    'SELECT id FROM fee_types WHERE academic_year_id = ? AND is_mandatory = 1 AND is_active = 1'
  ).all(yearId)

  if (mandatoryFees.length === 0) return

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO student_fee_selections (student_id, fee_type_id, academic_year_id, opted_in)
    VALUES (?, ?, ?, 1)
  `)

  for (const ft of mandatoryFees) {
    stmt.run(studentId, ft.id, yearId)
  }
}

// Level-specific amount takes priority over the NULL (default) row.
// Always read live — fee price changes apply immediately to all balances.
function getFeeAmountForStudent(db, feeTypeId, levelId) {
  const specific = db.prepare(
    'SELECT amount FROM fee_type_amounts WHERE fee_type_id = ? AND level_id = ?'
  ).get(feeTypeId, levelId)
  if (specific) return specific.amount

  const fallback = db.prepare(
    'SELECT amount FROM fee_type_amounts WHERE fee_type_id = ? AND level_id IS NULL'
  ).get(feeTypeId)
  return fallback?.amount ?? 0
}

// Live-computed student balance — the single source of truth for what a
// student owes. Never cached, never stored.
function getStudentFeeSummary(db, studentId, yearId, levelId) {
  const fees = db.prepare(`
    SELECT ft.id as fee_type_id, ft.name, ft.display_order, ft.is_mandatory, ft.is_system
    FROM fee_types ft
    JOIN student_fee_selections sfs ON sfs.fee_type_id = ft.id
      AND sfs.student_id = ? AND sfs.academic_year_id = ? AND sfs.opted_in = 1
    WHERE ft.academic_year_id = ? AND ft.is_active = 1
    ORDER BY ft.display_order ASC
  `).all(studentId, yearId, yearId)

  const paidRows = db.prepare(`
    SELECT pa.fee_type_id, SUM(pa.amount) as paid
    FROM payment_allocations pa
    JOIN payments p ON p.id = pa.payment_id
    WHERE p.student_id = ? AND p.academic_year_id = ? AND p.is_deleted = 0
    GROUP BY pa.fee_type_id
  `).all(studentId, yearId)
  const paidMap = {}
  paidRows.forEach(r => { paidMap[r.fee_type_id] = r.paid })

  let totalDue = 0
  let totalPaid = 0
  const feeList = fees.map(f => {
    const amount = getFeeAmountForStudent(db, f.fee_type_id, levelId)
    const paid = paidMap[f.fee_type_id] || 0
    const effectivePaid = Math.min(paid, amount) // cap paid to amount if fee was lowered
    totalDue += amount
    totalPaid += effectivePaid
    return {
      fee_type_id: f.fee_type_id,
      name: f.name,
      display_order: f.display_order,
      is_mandatory: f.is_mandatory,
      is_system: f.is_system,
      amount_due: amount,
      amount_paid: paid, // show actual paid (history is accurate)
      remaining: Math.max(0, amount - paid),
    }
  })

  const remaining = Math.max(0, totalDue - totalPaid)
  const status = totalPaid === 0 ? 'unpaid' : remaining <= 0 ? 'paid' : 'partial'

  return { fees: feeList, totalDue, totalPaid, remaining, status }
}

// Batch version of getStudentFeeSummary for a whole year at once. Runs a
// constant number of queries (3) regardless of student count, instead of
// ~5 per student — matters once a school has hundreds/thousands of
// students (public schools especially). Still fully live-computed, just
// batched: no caching, no stored values.
// studentLevels: Map<studentId, levelId>
// Returns: Map<studentId, { fees, totalDue, totalPaid, remaining, status }>
function getFeeSummariesForYear(db, yearId, studentLevels) {
  const selections = db.prepare(`
    SELECT sfs.student_id, ft.id as fee_type_id, ft.name, ft.display_order, ft.is_mandatory, ft.is_system
    FROM student_fee_selections sfs
    JOIN fee_types ft ON ft.id = sfs.fee_type_id AND ft.academic_year_id = ? AND ft.is_active = 1
    WHERE sfs.academic_year_id = ? AND sfs.opted_in = 1
    ORDER BY ft.display_order ASC
  `).all(yearId, yearId)

  const paidRows = db.prepare(`
    SELECT p.student_id, pa.fee_type_id, SUM(pa.amount) as paid
    FROM payment_allocations pa
    JOIN payments p ON p.id = pa.payment_id
    WHERE p.academic_year_id = ? AND p.is_deleted = 0
    GROUP BY p.student_id, pa.fee_type_id
  `).all(yearId)

  const amountRows = db.prepare(`
    SELECT fta.fee_type_id, fta.level_id, fta.amount
    FROM fee_type_amounts fta
    JOIN fee_types ft ON ft.id = fta.fee_type_id
    WHERE ft.academic_year_id = ?
  `).all(yearId)

  const lastPaymentRows = db.prepare(`
    SELECT p.student_id, MAX(p.payment_date) as last_payment_date
    FROM payments p
    WHERE p.academic_year_id = ? AND p.is_deleted = 0
    GROUP BY p.student_id
  `).all(yearId)
  const lastPaymentMap = {}
  for (const r of lastPaymentRows) lastPaymentMap[r.student_id] = r.last_payment_date

  // Specific (fee_type_id, level_id) row wins over the NULL-level fallback.
  const amountMap = {}
  for (const r of amountRows) amountMap[`${r.fee_type_id}_${r.level_id ?? 'null'}`] = r.amount
  const amountFor = (feeTypeId, levelId) =>
    amountMap[`${feeTypeId}_${levelId}`] ?? amountMap[`${feeTypeId}_null`] ?? 0

  const paidMap = {}
  for (const r of paidRows) paidMap[`${r.student_id}_${r.fee_type_id}`] = r.paid

  const selectionsByStudent = {}
  for (const s of selections) {
    (selectionsByStudent[s.student_id] ||= []).push(s)
  }

  const result = new Map()
  for (const [studentId, levelId] of studentLevels) {
    const fees = selectionsByStudent[studentId] || []
    let totalDue = 0
    let totalPaid = 0
    const feeList = fees.map(f => {
      const amount = amountFor(f.fee_type_id, levelId)
      const paid = paidMap[`${studentId}_${f.fee_type_id}`] || 0
      const effectivePaid = Math.min(paid, amount)
      totalDue += amount
      totalPaid += effectivePaid
      return {
        fee_type_id: f.fee_type_id,
        name: f.name,
        display_order: f.display_order,
        is_mandatory: f.is_mandatory,
        is_system: f.is_system,
        amount_due: amount,
        amount_paid: paid,
        remaining: Math.max(0, amount - paid),
      }
    })
    const remaining = Math.max(0, totalDue - totalPaid)
    const status = totalPaid === 0 ? 'unpaid' : remaining <= 0 ? 'paid' : 'partial'
    const lastPaymentDate = lastPaymentMap[studentId] || null
    result.set(studentId, { fees: feeList, totalDue, totalPaid, remaining, status, lastPaymentDate })
  }
  return result
}

module.exports = { autoAssignMandatoryFees, getFeeAmountForStudent, getStudentFeeSummary, getFeeSummariesForYear }
