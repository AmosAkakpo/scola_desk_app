// Owner request 2026-07-25: admin assigns each non-admin user's page
// access individually (editable anytime), instead of everyone with the
// same role being locked to one fixed permission bundle. role_id/roles
// stay in place purely as a display label ("Secrétaire", "Comptable",
// "Autre") -- actual access now comes entirely from this table.
function migration020(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_permissions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      permission_id INTEGER NOT NULL REFERENCES permissions(id),
      UNIQUE(user_id, permission_id)
    );

    -- Backfill: every existing non-admin user keeps EXACTLY what their
    -- role already granted them today -- nothing changes for anyone
    -- until an admin deliberately edits their access afterward.
    INSERT OR IGNORE INTO user_permissions (user_id, permission_id)
    SELECT u.id, rp.permission_id
    FROM users u
    JOIN role_permissions rp ON rp.role_id = u.role_id
    WHERE u.is_deleted = 0;
  `)
}

module.exports = { migration020 }
