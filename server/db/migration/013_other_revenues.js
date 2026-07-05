exports.migration013 = function (db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS revenue_categories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      description TEXT,
      is_system   INTEGER NOT NULL DEFAULT 0,
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS other_revenues (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      revenue_uid      TEXT NOT NULL UNIQUE,
      category_id      INTEGER NOT NULL REFERENCES revenue_categories(id) ON DELETE RESTRICT,
      academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
      description      TEXT,
      amount           REAL NOT NULL,
      revenue_date     TEXT NOT NULL DEFAULT (date('now')),
      reference        TEXT,
      recorded_by      INTEGER REFERENCES users(id),
      is_deleted       INTEGER NOT NULL DEFAULT 0,
      created_at       TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_other_revenues_year
      ON other_revenues(academic_year_id, revenue_date);
  `)

  const seed = db.prepare('INSERT OR IGNORE INTO revenue_categories (name, is_system) VALUES (?, ?)')
  seed.run('Scolarité', 1)
  seed.run('Donation', 0)
  seed.run('Subvention', 0)
  seed.run('Autre', 0)
}
