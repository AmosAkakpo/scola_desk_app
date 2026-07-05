exports.migration012 = function (db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS salary_payments (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_uid      TEXT NOT NULL UNIQUE,
      teacher_id       INTEGER NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
      academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
      pay_period       TEXT NOT NULL,
      amount           REAL NOT NULL,
      payment_method   TEXT DEFAULT 'especes',
      receipt_number   TEXT,
      payer_name       TEXT,
      receiver_name    TEXT,
      reference        TEXT,
      notes            TEXT,
      recorded_by      INTEGER REFERENCES users(id),
      is_deleted       INTEGER NOT NULL DEFAULT 0,
      created_at       TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_salary_payments_teacher
      ON salary_payments(teacher_id, pay_period, academic_year_id);
  `)

  // Migrate existing paid salary_entries so old receipts still resolve
  const existing = db.prepare(
    "SELECT * FROM salary_entries WHERE is_paid = 1 AND is_deleted = 0"
  ).all()

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO salary_payments
      (payment_uid, teacher_id, academic_year_id, pay_period, amount,
       payment_method, receipt_number, payer_name, receiver_name,
       reference, notes, recorded_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  for (const e of existing) {
    stmt.run(
      e.salary_uid,
      e.teacher_id,
      e.academic_year_id,
      e.month,
      e.amount,
      e.payment_method || 'especes',
      e.receipt_number || null,
      e.payer_name || null,
      e.receiver_name || null,
      e.reference || null,
      e.adjustment_reason || null,
      e.recorded_by || null,
      e.paid_at || e.created_at || null
    )
  }
}
