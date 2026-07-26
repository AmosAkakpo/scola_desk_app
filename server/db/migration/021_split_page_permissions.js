// Owner request 2026-07-25 (second pass): "students.view" used to gate
// Élèves AND Enseignants AND Classes AND Emploi du temps together (same
// for "finance.view" across 6 finance pages) -- not real per-page control.
// Splits each into its own code, backfills existing users so nobody's
// effective access shrinks on upgrade, and adds a 'staff' role for
// admin-typed custom titles (Custom role, free-text, alongside the fixed
// Secrétaire/Comptable presets).
function migration021(db) {
  db.exec(`
    INSERT OR IGNORE INTO permissions (code, label) VALUES
      ('teachers.view', 'Voir les enseignants'),
      ('teachers.edit', 'Modifier les enseignants'),
      ('classrooms.view', 'Voir les classes'),
      ('classrooms.edit', 'Modifier les classes'),
      ('timetable.view', 'Voir l''emploi du temps'),
      ('timetable.edit', 'Modifier l''emploi du temps'),
      ('finance_dashboard.view', 'Voir le tableau de bord financier'),
      ('tuition.view', 'Voir les paiements scolarité'),
      ('tuition.edit', 'Gérer les paiements scolarité'),
      ('salaries.view', 'Voir les salaires'),
      ('salaries.edit', 'Gérer les salaires'),
      ('expenses.view', 'Voir les dépenses'),
      ('expenses.edit', 'Gérer les dépenses'),
      ('finance_report.view', 'Voir le rapport financier'),
      ('fee_settings.view', 'Voir les frais et catégories'),
      ('fee_settings.edit', 'Modifier les frais et catégories');

    -- 'staff' role: used when the admin picks "Personnalisé" instead of
    -- one of the fixed Secrétaire/Comptable presets. Carries no default
    -- role_permissions bundle of its own -- a custom account always
    -- starts from a blank checklist, by design.
    INSERT OR IGNORE INTO roles (name, label, description) VALUES
      ('staff', 'Personnalisé', 'Accès personnalisé, titre libre');

    -- Free-text display title for 'staff' accounts (e.g. "Censeur",
    -- "Surveillant général") -- roles.label is shared across every user
    -- of that role, so it can't hold a per-person title.
    ALTER TABLE users ADD COLUMN custom_title TEXT;

    -- role_permissions: extend the two fixed presets to the new split
    -- codes so a FRESH secretary/accountant still gets the equivalent of
    -- the old bundle in one click (POST /users falls back to this when
    -- no explicit permissions array is sent).
    INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM roles r, permissions p
    WHERE r.name = 'secretary' AND p.code IN (
      'teachers.view', 'teachers.edit', 'classrooms.view', 'classrooms.edit',
      'timetable.view', 'timetable.edit'
    );

    INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM roles r, permissions p
    WHERE r.name = 'accountant' AND p.code IN (
      'finance_dashboard.view', 'tuition.view', 'tuition.edit',
      'salaries.view', 'salaries.edit', 'expenses.view', 'expenses.edit',
      'finance_report.view', 'fee_settings.view', 'fee_settings.edit'
    );

    -- Backfill EXISTING users' grants (migration 020's copy used the old
    -- broad codes) -- anyone who already had students.view/edit or
    -- finance.view/edit keeps exactly the same effective access under the
    -- new split codes, nothing narrows silently on upgrade.
    INSERT OR IGNORE INTO user_permissions (user_id, permission_id)
    SELECT up.user_id, p.id
    FROM user_permissions up
    JOIN permissions src ON src.id = up.permission_id AND src.code = 'students.view'
    JOIN permissions p ON p.code IN ('teachers.view', 'classrooms.view', 'timetable.view');

    INSERT OR IGNORE INTO user_permissions (user_id, permission_id)
    SELECT up.user_id, p.id
    FROM user_permissions up
    JOIN permissions src ON src.id = up.permission_id AND src.code = 'students.edit'
    JOIN permissions p ON p.code IN ('teachers.edit', 'classrooms.edit', 'timetable.edit');

    INSERT OR IGNORE INTO user_permissions (user_id, permission_id)
    SELECT up.user_id, p.id
    FROM user_permissions up
    JOIN permissions src ON src.id = up.permission_id AND src.code = 'finance.view'
    JOIN permissions p ON p.code IN ('finance_dashboard.view', 'tuition.view', 'salaries.view', 'expenses.view', 'finance_report.view', 'fee_settings.view');

    INSERT OR IGNORE INTO user_permissions (user_id, permission_id)
    SELECT up.user_id, p.id
    FROM user_permissions up
    JOIN permissions src ON src.id = up.permission_id AND src.code = 'finance.edit'
    JOIN permissions p ON p.code IN ('tuition.edit', 'salaries.edit', 'expenses.edit', 'fee_settings.edit');
  `)
}

module.exports = { migration021 }
