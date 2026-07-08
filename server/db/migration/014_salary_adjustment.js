// Salary adjustment tracking on the multi-payment model (salary_payments).
// calculated_amount = system-computed month amount (hours_credited × hourly_rate)
// snapshotted at pay time; adjustment_reason is mandatory (enforced in the route)
// when the paid amount differs from the calculated remaining.
exports.migration014 = function (db) {
  const cols = db.prepare("PRAGMA table_info(salary_payments)").all().map(c => c.name)
  if (!cols.includes('calculated_amount')) {
    db.exec(`ALTER TABLE salary_payments ADD COLUMN calculated_amount REAL DEFAULT 0`)
  }
  if (!cols.includes('adjustment_reason')) {
    db.exec(`ALTER TABLE salary_payments ADD COLUMN adjustment_reason TEXT`)
  }
}
