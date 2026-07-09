const express = require('express')
const router = express.Router()
const { createHmac } = require('crypto')
const { getDb } = require('../db/init')
const { hashPassword, verifyPassword } = require('../utils/password')
const { signToken } = require('../utils/jwt')
const { generateUUID, generateShortUID, generateUserUID, getSchoolPrefix } = require('../utils/uid')
const { requireAuth } = require('../middleware/requireAuth')

const PAYLOAD_SECRET = (process.env.LICENSE_PAYLOAD_SECRET || 'scoladesk-v1-secret-change-in-production').trim()
const RESET_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

// Day-code for admin password reset: HMAC over school_code + date, mapped to
// 8 safe-charset chars. CAP computes the identical code server-side (same
// secret) and staff read it over the phone — the app verifies it fully
// offline, nothing is stored on either side.
function resetCodeFor(schoolCode, dateStr) {
    const digest = createHmac('sha256', PAYLOAD_SECRET)
        .update(`RESET|${schoolCode.toUpperCase()}|${dateStr}`)
        .digest()
    let code = ''
    for (let i = 0; i < 8; i++) code += RESET_CHARSET[digest[i] % RESET_CHARSET.length]
    return code
}

function localDateStr(offsetDays = 0) {
    const d = new Date()
    d.setDate(d.getDate() + offsetDays)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── POST /api/auth/login ─────────────────────────────────────────
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body

        if (!username || !password) {
            return res.status(400).json({
                error: 'MISSING_FIELDS',
                message: 'Nom d\'utilisateur et mot de passe requis'
            })
        }

        const db = getDb()
        const user = db.prepare(`
      SELECT
        u.id,
        u.user_uid,
        u.full_name,
        u.username,
        u.password_hash,
        u.role_id,
        u.is_active,
        u.is_deleted,
        r.name  AS role_name,
        r.label AS role_label
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.username = ?
        AND u.is_deleted = 0
    `).get(username.trim().toLowerCase())

        if (!user) {
            return res.status(401).json({
                error: 'INVALID_CREDENTIALS',
                message: 'Identifiants incorrects'
            })
        }

        if (!user.is_active) {
            return res.status(401).json({
                error: 'ACCOUNT_DISABLED',
                message: 'Compte désactivé. Contactez l\'administrateur.'
            })
        }

        const valid = await verifyPassword(password, user.password_hash)
        if (!valid) {
            // Log failed attempt
            db.prepare(`
        INSERT INTO audit_logs
          (user_id, action, entity_type, entity_id, ip_address)
        VALUES (?, 'LOGIN_FAILED', 'user', ?, ?)
      `).run(user.id, String(user.id), req.ip)

            return res.status(401).json({
                error: 'INVALID_CREDENTIALS',
                message: 'Identifiants incorrects'
            })
        }

        const token = signToken({
            userId: user.id,
            userUid: user.user_uid,
            role: user.role_name
        })

        // Log successful login
        db.prepare(`
      INSERT INTO audit_logs
        (user_id, action, entity_type, entity_id, ip_address)
      VALUES (?, 'LOGIN_SUCCESS', 'user', ?, ?)
    `).run(user.id, String(user.id), req.ip)

        // Load permissions
        let permissions = ['*']
        if (user.role_name !== 'admin') {
            const perms = db.prepare(`
                SELECT p.code FROM role_permissions rp
                JOIN permissions p ON p.id = rp.permission_id
                WHERE rp.role_id = ?
            `).all(user.role_id)
            permissions = perms.map(p => p.code)
        }

        return res.json({
            token,
            user: {
                id: user.id,
                userUid: user.user_uid,
                fullName: user.full_name,
                username: user.username,
                role: user.role_name,
                roleLabel: user.role_label,
                permissions
            }
        })
    } catch (err) {
        console.error('[LOGIN]', err)
        return res.status(500).json({
            error: 'SERVER_ERROR',
            message: 'Erreur serveur'
        })
    }
})

// ─── GET /api/auth/me ─────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
    return res.json({
        user: {
            id: req.user.id,
            userUid: req.user.user_uid,
            fullName: req.user.full_name,
            username: req.user.username,
            role: req.user.role_name,
            roleLabel: req.user.role_label,
            permissions: req.user.permissions
        }
    })
})

// ─── POST /api/auth/logout ────────────────────────────────────────
router.post('/logout', requireAuth, (req, res) => {
    const db = getDb()
    db.prepare(`
    INSERT INTO audit_logs
      (user_id, action, entity_type, entity_id, ip_address)
    VALUES (?, 'LOGOUT', 'user', ?, ?)
  `).run(req.user.id, String(req.user.id), req.ip)

    return res.json({ message: 'Déconnecté avec succès' })
})

// ─── POST /api/auth/setup ─────────────────────────────────────────
// Creates the first admin user during onboarding.
// Blocked if any user already exists.
router.post('/setup', async (req, res) => {
    try {
        const { fullName, username, password } = req.body

        if (!fullName || !username || !password) {
            return res.status(400).json({
                error: 'MISSING_FIELDS',
                message: 'Tous les champs sont requis'
            })
        }

        if (password.length < 6) {
            return res.status(400).json({
                error: 'PASSWORD_TOO_SHORT',
                message: 'Mot de passe minimum 6 caractères'
            })
        }

        const db = getDb()

        // Block if admin already exists
        const existing = db.prepare(`
      SELECT id FROM users LIMIT 1
    `).get()

        if (existing) {
            return res.status(409).json({
                error: 'SETUP_ALREADY_DONE',
                message: 'Configuration déjà effectuée'
            })
        }

        const adminRole = db.prepare(`
      SELECT id FROM roles WHERE name = 'admin'
    `).get()

        if (!adminRole) {
            return res.status(500).json({
                error: 'ROLE_NOT_FOUND',
                message: 'Rôle admin introuvable'
            })
        }

        const passwordHash = await hashPassword(password)
        const userUid = generateUserUID(getSchoolPrefix(db))
        const matricule = generateShortUID('U')

        db.prepare(`
      INSERT INTO users
        (user_uid, matricule, full_name, username, password_hash, role_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
            userUid,
            matricule,
            fullName.trim(),
            username.trim().toLowerCase(),
            passwordHash,
            adminRole.id
        )

        // Log the event
        const newUser = db.prepare(`
      SELECT id FROM users WHERE user_uid = ?
    `).get(userUid)

        db.prepare(`
      INSERT INTO audit_logs
        (user_id, action, entity_type, entity_id)
      VALUES (?, 'ADMIN_CREATED', 'user', ?)
    `).run(newUser.id, String(newUser.id))

        return res.status(201).json({
            message: 'Administrateur créé avec succès'
        })
    } catch (err) {
        console.error('[SETUP]', err)
        return res.status(500).json({
            error: 'SERVER_ERROR',
            message: 'Erreur serveur'
        })
    }
})

// ─── POST /api/auth/reset-admin ──────────────────────────────────
// Pre-login. Resets the admin account's password against a day-code
// obtained from ScolaDesk over the phone (verified offline via HMAC).
// Accepts today's and yesterday's code (midnight edge on a long call).
router.post('/reset-admin', async (req, res) => {
    try {
        const { code, new_password } = req.body

        if (!code || !new_password) {
            return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Code et nouveau mot de passe requis' })
        }
        if (new_password.length < 6) {
            return res.status(400).json({ error: 'PASSWORD_TOO_SHORT', message: 'Mot de passe minimum 6 caractères' })
        }

        const db = getDb()
        const schoolCode = db.prepare('SELECT school_code FROM school_config LIMIT 1').get()?.school_code
        if (!schoolCode) {
            return res.status(400).json({ error: 'NOT_ACTIVATED', message: 'Application non activée' })
        }

        const normalized = code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
        const valid = [localDateStr(0), localDateStr(-1)]
            .some(d => resetCodeFor(schoolCode, d) === normalized)

        if (!valid) {
            db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address)
        VALUES (NULL, 'ADMIN_RESET_CODE_REJECTED', 'user', NULL, ?)
      `).run(req.ip)
            return res.status(403).json({ error: 'INVALID_CODE', message: 'Code de réinitialisation invalide ou expiré' })
        }

        // Single-use: the code itself carries no state (verified purely by
        // HMAC recomputation, on purpose, for fully offline verification),
        // so replay protection has to live here -- otherwise anyone who
        // overheard/saw the code could keep resetting the admin password
        // for its whole ~48h validity window.
        const alreadyUsed = db.prepare("SELECT value FROM app_settings WHERE key = 'admin_reset_code_used'").get()?.value
        if (alreadyUsed === normalized) {
            db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address)
        VALUES (NULL, 'ADMIN_RESET_CODE_REPLAY_BLOCKED', 'user', NULL, ?)
      `).run(req.ip)
            return res.status(403).json({ error: 'CODE_ALREADY_USED', message: 'Ce code a déjà été utilisé. Contactez ScolaDesk pour un nouveau code.' })
        }

        const admin = db.prepare(`
      SELECT u.id FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE r.name = 'admin' AND u.is_deleted = 0
      ORDER BY u.id LIMIT 1
    `).get()

        if (!admin) {
            return res.status(404).json({ error: 'NO_ADMIN', message: 'Aucun compte administrateur trouvé' })
        }

        const passwordHash = await hashPassword(new_password)
        db.prepare("UPDATE users SET password_hash = ?, is_active = 1, updated_at = datetime('now') WHERE id = ?")
            .run(passwordHash, admin.id)

        db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('admin_reset_code_used', ?, datetime('now'))")
            .run(normalized)

        db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address)
      VALUES (?, 'ADMIN_PASSWORD_RESET', 'user', ?, ?)
    `).run(admin.id, String(admin.id), req.ip)

        return res.json({ message: 'Mot de passe administrateur réinitialisé' })
    } catch (err) {
        console.error('[RESET-ADMIN]', err)
        return res.status(500).json({ error: 'SERVER_ERROR', message: 'Erreur serveur' })
    }
})

module.exports = router