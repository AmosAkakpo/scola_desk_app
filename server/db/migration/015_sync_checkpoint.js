// Resumable sync support on sync_log.
// checkpoint = index of the next task to run (last completed task index + 1).
// total_chunks = task list length for the current/last attempt, for "étape X/N" UI.
// student_count = live student_count sent with the completion call.
exports.migration015 = function (db) {
  const cols = db.prepare("PRAGMA table_info(sync_log)").all().map(c => c.name)
  if (!cols.includes('checkpoint')) {
    db.exec(`ALTER TABLE sync_log ADD COLUMN checkpoint INTEGER DEFAULT 0`)
  }
  if (!cols.includes('total_chunks')) {
    db.exec(`ALTER TABLE sync_log ADD COLUMN total_chunks INTEGER DEFAULT 0`)
  }
  if (!cols.includes('student_count')) {
    db.exec(`ALTER TABLE sync_log ADD COLUMN student_count INTEGER DEFAULT 0`)
  }
}
