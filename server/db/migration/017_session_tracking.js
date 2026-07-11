// Adds single-session-per-account enforcement: a fresh session_id is
// stamped on every login and embedded in the JWT; requireAuth rejects any
// token whose session_id no longer matches the row (i.e. someone logged in
// elsewhere since). NULL = no active session (never logged in, or logged
// out) -- matches nothing, so a stale token can't be replayed after logout.
exports.migration017 = function (db) {
  const cols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name)
  if (!cols.includes('session_id')) {
    db.exec(`ALTER TABLE users ADD COLUMN session_id TEXT`)
  }
}
