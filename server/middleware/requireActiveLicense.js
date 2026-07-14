const { getDb } = require('../db/init')

// Global read-only enforcement when the license has expired (owner request
// 2026-07-13): every write (POST/PUT/PATCH/DELETE) is blocked school-wide
// until the admin enters a fresh key via Paramètres > Licence, which just
// re-hits POST /api/activation/activate -- the same endpoint used for
// first-time activation, already fully idempotent for a same-school
// re-activation. GETs always pass through untouched (read/download stays
// available). No expiry set yet (fresh, never-activated install) also
// passes through -- this middleware only fires once a real expiry exists
// and has passed.
function requireActiveLicense(req, res, next) {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next()

    try {
        const db = getDb()
        const license = db.prepare('SELECT license_expiry FROM license_state LIMIT 1').get()

        if (license?.license_expiry && new Date(license.license_expiry) < new Date()) {
            return res.status(403).json({
                error: 'LICENSE_EXPIRED',
                message: "Licence expirée — mode lecture seule. Renouvelez votre abonnement dans Paramètres > Licence pour continuer."
            })
        }

        next()
    } catch (err) {
        console.error('[LICENSE CHECK]', err)
        next() // fail open -- a DB hiccup here shouldn't itself lock the school out
    }
}

module.exports = { requireActiveLicense }
