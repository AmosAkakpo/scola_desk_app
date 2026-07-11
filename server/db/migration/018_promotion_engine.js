exports.migration018 = function (db) {
  // ── exam_passing_rules: per-exam-type promotion criteria ────
  // Schools differ on whether a national exam (CEP/BEPC/BAC) counts toward
  // promotion. Default mode 'moyenne_only' preserves today's exact behavior
  // (pure moy_cumulative check) until an admin deliberately changes it.
  db.exec(`
    CREATE TABLE IF NOT EXISTS exam_passing_rules (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_type     TEXT NOT NULL UNIQUE,
      mode          TEXT NOT NULL DEFAULT 'moyenne_only'
                      CHECK(mode IN ('moyenne_only','exam_only','both')),
      min_moyenne   REAL NOT NULL DEFAULT 10,
      updated_at    TEXT DEFAULT (datetime('now'))
    );
  `)

  // Seed one row per exam type currently in use (levels.exam_name where
  // is_exam_cohort = 1) so the settings page has something to list.
  const cohortLevels = db.prepare(
    "SELECT DISTINCT exam_name FROM levels WHERE is_exam_cohort = 1 AND exam_name IS NOT NULL"
  ).all()
  const seedRule = db.prepare(
    `INSERT OR IGNORE INTO exam_passing_rules (exam_type, mode, min_moyenne) VALUES (?, 'moyenne_only', 10)`
  )
  for (const row of cohortLevels) seedRule.run(row.exam_name)

  // ── national_exam_results.exam_type: drop the CEP/BEPC/BAC CHECK ──
  // SQLite can't ALTER off a CHECK constraint -- table rebuild, same
  // pattern as migration 009's teacher_daily_log rebuild. Exam types are
  // now admin-editable (levels.exam_name), so a hardcoded CHECK would
  // silently reject any custom exam name the admin configures.
  const existing = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='national_exam_results'"
  ).get()
  if (existing && existing.sql.includes("CHECK(exam_type IN")) {
    db.exec(`
      CREATE TABLE national_exam_results_new (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id          INTEGER NOT NULL
                              REFERENCES students(id)
                              ON DELETE RESTRICT,
        academic_year_id    INTEGER NOT NULL
                              REFERENCES academic_years(id)
                              ON DELETE RESTRICT,
        exam_type           TEXT NOT NULL,
        registration_number TEXT,
        result              TEXT
                              CHECK(result IN (
                                'admis','recalé','absent',NULL
                              )),
        score               REAL,
        serie               TEXT,
        notes               TEXT,
        created_at          TEXT DEFAULT (datetime('now')),
        UNIQUE(student_id, academic_year_id, exam_type)
      );

      INSERT INTO national_exam_results_new
        SELECT id, student_id, academic_year_id, exam_type, registration_number,
               result, score, serie, notes, created_at
        FROM national_exam_results;

      DROP TABLE national_exam_results;

      ALTER TABLE national_exam_results_new RENAME TO national_exam_results;
    `)
  }
}
