exports.migration019 = function (db) {
  // USB backup history — mirrors sync_log's shape (Phase 7) since it's
  // the same "log a background job's runs" pattern, just aimed at a USB
  // drive instead of CAP.
  db.exec(`
    CREATE TABLE IF NOT EXISTS backup_log (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      backup_uid     TEXT NOT NULL UNIQUE,
      started_at     TEXT DEFAULT (datetime('now')),
      completed_at   TEXT,
      status         TEXT DEFAULT 'pending' CHECK(status IN ('pending','success','failed')),
      file_path      TEXT,
      integrity_ok   INTEGER,
      error_message  TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_backup_log_started
      ON backup_log(started_at);
  `)
}
