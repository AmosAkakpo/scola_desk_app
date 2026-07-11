const { verifyToken } = require('../utils/jwt')
const { getDb } = require('../db/init')

async function requireAuth(req, res, next) {
    try {
        const authHeader = req.headers['authorization']
        const token = authHeader && authHeader.startsWith('Bearer ')
            ? authHeader.slice(7)
            : null

        if (!token) {
            return res.status(401).json({
                error: 'AUTH_REQUIRED',
                message: 'Token manquant'
            })
        }

        const payload = verifyToken(token)
        if (!payload) {
            return res.status(401).json({
                error: 'AUTH_INVALID',
                message: 'Token invalide ou expiré'
            })
        }

        const db = getDb()
        const user = db.prepare(`
      SELECT
        u.id,
        u.user_uid,
        u.full_name,
        u.username,
        u.role_id,
        u.is_active,
        u.is_deleted,
        u.session_id,
        r.name  AS role_name,
        r.label AS role_label
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?
        AND u.is_active = 1
        AND u.is_deleted = 0
    `).get(payload.userId)

        if (!user) {
            return res.status(401).json({
                error: 'AUTH_USER_NOT_FOUND',
                message: 'Utilisateur introuvable ou désactivé'
            })
        }

        // Single session per account: someone logged in elsewhere since this
        // token was issued (its sessionId no longer matches the DB's current
        // one) -- reject with a distinct code so the frontend can explain
        // why, instead of a generic "session expired".
        if (!payload.sessionId || payload.sessionId !== user.session_id) {
            return res.status(401).json({
                error: 'SESSION_REPLACED',
                message: 'Session terminée — connexion depuis un autre appareil'
            })
        }

        delete user.session_id // internal-only, never needs to leave this middleware

        // Load permissions for this user's role
        // Admin gets all permissions without DB lookup
        if (user.role_name === 'admin') {
            user.permissions = ['*']
        } else {
            const perms = db.prepare(`
        SELECT p.code
        FROM role_permissions rp
        JOIN permissions p ON p.id = rp.permission_id
        WHERE rp.role_id = ?
      `).all(user.role_id)
            user.permissions = perms.map(p => p.code)
        }

        req.user = user
        next()
    } catch (err) {
        console.error('[AUTH]', err)
        return res.status(500).json({
            error: 'AUTH_ERROR',
            message: 'Erreur d\'authentification'
        })
    }
}

module.exports = { requireAuth }