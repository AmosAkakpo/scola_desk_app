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
//
// /api/sync and /api/backup are exempt even for writes (owner 2026-07-13:
// an unpaid school should still be able to back up its data -- data
// safety shouldn't depend on payment status).
//
// Also blocks when CAP no longer recognizes this device's license at all
// (owner report 2026-07-18: renewed via CAP, got the "new key issued"
// banner, but could still add grades/payments/attendance freely -- the
// stale locally-cached license_expiry hadn't itself passed yet, so this
// check alone let everything through). license_reactivation_needed is
// set by the background check-in (activation.js) whenever CAP's answer
// for this fingerprint isn't an ACTIVE match; same read-only treatment
// as an actual expiry, cleared the moment the new key is entered.
function requireActiveLicense(req, res, next) {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next()
    if (req.path.startsWith('/api/sync') || req.path.startsWith('/api/backup')) return next()

    try {
        const db = getDb()
        const license = db.prepare('SELECT license_expiry FROM license_state LIMIT 1').get()

        if (license?.license_expiry && new Date(license.license_expiry) < new Date()) {
            return res.status(403).json({
                error: 'LICENSE_EXPIRED',
                message: "Licence expirée — mode lecture seule. Renouvelez votre abonnement dans Paramètres > Licence pour continuer."
            })
        }

        const reactivationNeeded = db.prepare("SELECT value FROM app_settings WHERE key = 'license_reactivation_needed'").get()?.value === '1'
        if (reactivationNeeded) {
            return res.status(403).json({
                error: 'LICENSE_REACTIVATION_NEEDED',
                message: "Nouvelle clé de licence requise — mode lecture seule. Entrez la nouvelle clé dans Paramètres > Licence pour continuer."
            })
        }

        next()
    } catch (err) {
        console.error('[LICENSE CHECK]', err)
        next() // fail open -- a DB hiccup here shouldn't itself lock the school out
    }
}

module.exports = { requireActiveLicense }
