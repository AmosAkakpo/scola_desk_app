const express = require('express')
const router = express.Router()
const { getDb } = require('../db/init')
const { hashPassword } = require('../utils/password')
const { generateUserUID, generateShortUID, getSchoolPrefix } = require('../utils/uid')
const { requireAuth } = require('../middleware/requireAuth')

// Account caps per tier (matches onboarding Step 2 / CONTEXT.md):
// STANDARD = 1 admin + 1 secretary, no accountant. PRO = unlimited secretary + accountant.
function getLicenseTier(db) {
  return (db.prepare('SELECT license_tier FROM license_state LIMIT 1').get()?.license_tier || 'STANDARD').toUpperCase()
}

router.use(requireAuth)

// Admin-only, every method — even reading usernames is sensitive here.
router.use((req, res, next) => {
  if (req.user?.role_name !== 'admin') {
    return res.status(403).json({ error: 'PERMISSION_DENIED', message: "Réservé à l'administrateur" })
  }
  next()
})

// ─── GET /api/users — List accounts ──────────────────────────
router.get('/', (req, res) => {
  const db = getDb()
  const users = db.prepare(`
    SELECT u.id, u.user_uid, u.full_name, u.username, u.is_active, u.created_at,
           r.name AS role_name, r.label AS role_label
    FROM users u
    JOIN roles r ON r.id = u.role_id
    WHERE u.is_deleted = 0
    ORDER BY (r.name = 'admin') DESC, u.full_name
  `).all()

  // Per-user permission codes (owner request 2026-07-25: access is
  // individually editable now, not just whatever the role bundle says) --
  // admin never has rows here, always full access, not worth a query.
  const permStmt = db.prepare(`
    SELECT p.code FROM user_permissions up JOIN permissions p ON p.id = up.permission_id WHERE up.user_id = ?
  `)
  for (const u of users) {
    u.permissions = u.role_name === 'admin' ? ['*'] : permStmt.all(u.id).map(p => p.code)
  }

  return res.json({ users, tier: getLicenseTier(db) })
})

// ─── GET /api/users/permissions/catalog — page groups for the checklist ─
// One entry = one checkbox in the admin UI = one or more permission codes
// granted/revoked together. proOnly groups are still filtered client-side
// by license tier same as the nav itself.
router.get('/permissions/catalog', (req, res) => {
  return res.json({
    groups: [
      { key: 'academic', label: 'Élèves, enseignants & classes', codes: ['students.view', 'students.edit'] },
      { key: 'grades', label: 'Notes', codes: ['grades.view', 'grades.edit'] },
      { key: 'reports', label: 'Bulletins', codes: ['reports.view', 'reports.generate'] },
      { key: 'attendance', label: 'Présences', codes: ['attendance.view', 'attendance.edit'], proOnly: true },
      { key: 'finance', label: 'Finance', codes: ['finance.view', 'finance.edit'], proOnly: true },
    ],
  })
})

// ─── POST /api/users — Create a secretary or accountant account ─
// Admin accounts are never created here -- onboarding/restore are the only
// paths, matching the single-admin assumption baked into the password-reset
// code flow elsewhere.
router.post('/', async (req, res) => {
  try {
    const { full_name, username, password, role, permissions } = req.body
    if (!full_name?.trim() || !username?.trim() || !password || !role) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Tous les champs sont requis' })
    }
    if (!['secretary', 'accountant'].includes(role)) {
      return res.status(400).json({ error: 'INVALID_ROLE', message: 'Rôle invalide' })
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'PASSWORD_TOO_SHORT', message: 'Mot de passe minimum 6 caractères' })
    }

    const db = getDb()
    const tier = getLicenseTier(db)

    if (role === 'accountant' && tier !== 'PRO') {
      return res.status(403).json({ error: 'TIER_INSUFFICIENT', message: 'Le rôle comptable requiert une licence PRO' })
    }
    if (role === 'secretary' && tier !== 'PRO') {
      const existingSecretary = db.prepare(`
        SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
        WHERE r.name = 'secretary' AND u.is_deleted = 0
      `).get()
      if (existingSecretary) {
        return res.status(403).json({ error: 'TIER_LIMIT', message: 'La licence STANDARD est limitée à un compte secrétaire' })
      }
    }

    const usernameTaken = db.prepare('SELECT id FROM users WHERE username = ? AND is_deleted = 0').get(username.trim().toLowerCase())
    if (usernameTaken) {
      return res.status(409).json({ error: 'USERNAME_TAKEN', message: "Nom d'utilisateur déjà utilisé" })
    }

    const roleRow = db.prepare('SELECT id FROM roles WHERE name = ?').get(role)
    if (!roleRow) return res.status(500).json({ error: 'ROLE_NOT_FOUND', message: 'Rôle introuvable' })

    const passwordHash = await hashPassword(password)
    const prefix = getSchoolPrefix(db)
    db.prepare(`
      INSERT INTO users (user_uid, matricule, full_name, username, password_hash, role_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(generateUserUID(prefix), generateShortUID('U'), full_name.trim(), username.trim().toLowerCase(), passwordHash, roleRow.id)

    const newUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim().toLowerCase())

    // Custom permission set if the admin picked one (array of codes from
    // the checklist); otherwise fall back to the role's default bundle so
    // creating an account still works sensibly with zero extra clicks.
    if (Array.isArray(permissions) && permissions.length > 0) {
      const validCodes = new Set(db.prepare('SELECT code FROM permissions').all().map(p => p.code))
      const insertPerm = db.prepare(`
        INSERT OR IGNORE INTO user_permissions (user_id, permission_id)
        SELECT ?, id FROM permissions WHERE code = ?
      `)
      for (const code of permissions) {
        if (validCodes.has(code)) insertPerm.run(newUser.id, code)
      }
    } else {
      db.prepare(`
        INSERT OR IGNORE INTO user_permissions (user_id, permission_id)
        SELECT ?, permission_id FROM role_permissions WHERE role_id = ?
      `).run(newUser.id, roleRow.id)
    }

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
      VALUES (?, 'USER_CREATED', 'user', ?, ?)
    `).run(req.user.id, String(newUser.id), JSON.stringify({ role, permissions, created_by: req.user.id }))

    return res.status(201).json({ success: true })
  } catch (err) {
    console.error('[USERS CREATE]', err)
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Erreur serveur' })
  }
})

// ─── PUT /api/users/:id/permissions — edit page access, anytime ─
// Owner request 2026-07-25: access isn't fixed at creation -- admin can
// come back and add/remove pages for any account whenever needed.
router.put('/:id/permissions', (req, res) => {
  const db = getDb()
  const user = db.prepare(`
    SELECT u.id, r.name AS role_name FROM users u
    JOIN roles r ON r.id = u.role_id WHERE u.id = ? AND u.is_deleted = 0
  `).get(req.params.id)
  if (!user) return res.status(404).json({ error: 'NOT_FOUND' })
  if (user.role_name === 'admin') {
    return res.status(403).json({ error: 'CANNOT_MODIFY_ADMIN', message: "L'accès administrateur est fixe, non modifiable" })
  }

  const { permissions } = req.body
  if (!Array.isArray(permissions)) {
    return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Liste de permissions requise' })
  }

  const validCodes = new Set(db.prepare('SELECT code FROM permissions').all().map(p => p.code))
  db.transaction(() => {
    db.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(user.id)
    const insertPerm = db.prepare(`
      INSERT OR IGNORE INTO user_permissions (user_id, permission_id)
      SELECT ?, id FROM permissions WHERE code = ?
    `)
    for (const code of permissions) {
      if (validCodes.has(code)) insertPerm.run(user.id, code)
    }
  })()

  db.prepare(`
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
    VALUES (?, 'USER_PERMISSIONS_UPDATED', 'user', ?, ?)
  `).run(req.user.id, String(user.id), JSON.stringify({ permissions }))

  return res.json({ success: true })
})

// ─── PATCH /api/users/:id/toggle-active ──────────────────────
router.patch('/:id/toggle-active', (req, res) => {
  const db = getDb()
  const user = db.prepare(`
    SELECT u.id, u.is_active, r.name AS role_name FROM users u
    JOIN roles r ON r.id = u.role_id WHERE u.id = ? AND u.is_deleted = 0
  `).get(req.params.id)
  if (!user) return res.status(404).json({ error: 'NOT_FOUND' })
  if (user.role_name === 'admin') {
    return res.status(403).json({ error: 'CANNOT_MODIFY_ADMIN', message: "Impossible de désactiver le compte administrateur" })
  }

  const newStatus = user.is_active === 1 ? 0 : 1
  db.prepare("UPDATE users SET is_active = ?, updated_at = datetime('now') WHERE id = ?").run(newStatus, user.id)
  db.prepare(`
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values)
    VALUES (?, 'USER_TOGGLE_ACTIVE', 'user', ?, ?)
  `).run(req.user.id, String(user.id), JSON.stringify({ is_active: newStatus }))

  return res.json({ success: true, is_active: newStatus })
})

// ─── POST /api/users/:id/reset-password ──────────────────────
// Admin resets a secretary/accountant's password directly -- no code needed,
// the admin is already authenticated. The admin's OWN password reset is a
// separate, offline-code-verified flow (server/routes/auth.js) since nobody
// is logged in yet when that one runs.
router.post('/:id/reset-password', async (req, res) => {
  try {
    const { new_password } = req.body
    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ error: 'PASSWORD_TOO_SHORT', message: 'Mot de passe minimum 6 caractères' })
    }

    const db = getDb()
    const user = db.prepare(`
      SELECT u.id, r.name AS role_name FROM users u
      JOIN roles r ON r.id = u.role_id WHERE u.id = ? AND u.is_deleted = 0
    `).get(req.params.id)
    if (!user) return res.status(404).json({ error: 'NOT_FOUND' })
    if (user.role_name === 'admin') {
      return res.status(403).json({ error: 'CANNOT_MODIFY_ADMIN', message: "Utilisez le code de réinitialisation pour le compte administrateur" })
    }

    const passwordHash = await hashPassword(new_password)
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(passwordHash, user.id)
    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id)
      VALUES (?, 'USER_PASSWORD_RESET', 'user', ?)
    `).run(req.user.id, String(user.id))

    return res.json({ success: true })
  } catch (err) {
    console.error('[USERS RESET-PASSWORD]', err)
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Erreur serveur' })
  }
})

module.exports = router
