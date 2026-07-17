const express = require('express')
const router = express.Router()
const axios = require('axios')
const crypto = require('crypto')
const { getDb } = require('../db/init')

const CAP_URL = (process.env.CAP_API_URL || 'http://localhost:3001').trim()
const PAYLOAD_SECRET = (process.env.LICENSE_PAYLOAD_SECRET || 'scoladesk-v1-secret-change-in-production').trim()

// Switches the live DB from whatever key it's currently using (the
// bootstrap key generated at very first boot, per electron/dbKey.js) to
// the school's official CAP-escrowed key. Non-fatal on failure: the
// activation itself already succeeded server-side by this point, and the
// local key just stays on its current value until the next activation
// retries this. safeStorage lives in the Electron MAIN process only, so
// persisting the new key is delegated via the fork's IPC channel rather
// than done here.
function rekeyIfNeeded(db, newKey) {
  if (!newKey || newKey === process.env.SCOLA_DB_KEY) return
  try {
    // SQLite3MultipleCiphers can't rekey a WAL-mode database.
    db.pragma('wal_checkpoint(TRUNCATE)')
    db.pragma('journal_mode = DELETE')
    db.pragma(`rekey='${newKey}'`)
    db.pragma('journal_mode = WAL')
    process.env.SCOLA_DB_KEY = newKey
    if (typeof process.send === 'function') {
      process.send({ type: 'store-db-key', key: newKey })
    }
    console.log('[DB KEY] Rekeyed to the school\'s official license key.')
  } catch (err) {
    console.error('[DB KEY] Rekey failed — staying on the current key:', err.message)
  }
}

function verifySignature(payload) {
  const copy = { ...payload }
  delete copy.signature
  const expected = crypto.createHmac('sha256', PAYLOAD_SECRET).update(JSON.stringify(copy)).digest('hex')
  return expected === payload.signature
}

function storeLicenseLocally(db, payload, fingerprint) {
  db.transaction(() => {
    // Upsert license_state
    const existing = db.prepare('SELECT id FROM license_state LIMIT 1').get()
    if (existing) {
      db.prepare(`
        UPDATE license_state SET
          school_id = ?, hardware_fingerprint = ?, license_tier = ?,
          license_expiry = ?, is_active = 1,
          rate_per_student = ?, declared_student_count = ?,
          paid_student_count = ?, allowed_students = ?,
          amount_paid = ?, installation_fee = ?,
          installation_fee_paid = ?, semesters_active = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(
        payload.school_id, fingerprint, payload.tier, payload.expiry_date,
        payload.rate_per_student || 0, payload.declared_student_count || 0,
        payload.paid_student_count || 0, payload.allowed_students || 0,
        payload.amount_paid || 0, payload.installation_fee || 0,
        payload.installation_fee_paid ? 1 : 0, payload.semesters_active || 3,
        existing.id
      )
    } else {
      db.prepare(`
        INSERT INTO license_state (
          school_id, hardware_fingerprint, license_tier, license_expiry, is_active,
          rate_per_student, declared_student_count, paid_student_count, allowed_students,
          amount_paid, installation_fee, installation_fee_paid, semesters_active
        ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        payload.school_id, fingerprint, payload.tier, payload.expiry_date,
        payload.rate_per_student || 0, payload.declared_student_count || 0,
        payload.paid_student_count || 0, payload.allowed_students || 0,
        payload.amount_paid || 0, payload.installation_fee || 0,
        payload.installation_fee_paid ? 1 : 0, payload.semesters_active || 3
      )
    }

    // Upsert school_config
    const existingConfig = db.prepare('SELECT id FROM school_config LIMIT 1').get()
    if (existingConfig) {
      db.prepare(`
        UPDATE school_config SET
          school_name = ?, school_code = ?, school_prefix = ?, director_name = ?,
          city = ?, country = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(payload.school_name, payload.school_code, payload.school_prefix || '', payload.director_name, payload.city || '', payload.country || 'Bénin', existingConfig.id)
    } else {
      db.prepare(`
        INSERT INTO school_config (school_name, school_code, school_prefix, director_name, city, country)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(payload.school_name, payload.school_code, payload.school_prefix || '', payload.director_name, payload.city || '', payload.country || 'Bénin')
    }

    // Store features, deadlines, signature in app_settings
    const settings = {
      license_features: JSON.stringify(payload.features || []),
      license_semesters_active: String(payload.semesters_active || 3),
      semester_1_deadline: String(payload.semester_deadlines?.t1 || ''),
      semester_2_deadline: String(payload.semester_deadlines?.t2 || ''),
      semester_3_deadline: String(payload.semester_deadlines?.t3 || ''),
      license_signature: payload.signature || '',
      license_issued_at: payload.issued_at || '',
      last_boot_date: new Date().toISOString(),
    }

    for (const [key, value] of Object.entries(settings)) {
      db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))").run(key, value)
    }
  })()
}

// ─── GET /api/activation/status ─────────────────────────────
router.get('/status', (req, res) => {
  const db = getDb()
  const license = db.prepare('SELECT * FROM license_state LIMIT 1').get()
  const config = db.prepare('SELECT * FROM school_config LIMIT 1').get()

  if (!license || !license.hardware_fingerprint) {
    return res.json({ activated: false, configured: false, license_status: 'none' })
  }

  const now = new Date()
  const expiry = license.license_expiry ? new Date(license.license_expiry) : null

  // Time tampering check
  const lastBoot = db.prepare("SELECT value FROM app_settings WHERE key = 'last_boot_date'").get()?.value
  if (lastBoot && new Date(lastBoot) > now) {
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('last_boot_date', ?, datetime('now'))").run(now.toISOString())
    return res.json({
      activated: true, configured: config?.is_configured === 1,
      license_status: 'tampered',
      school_name: config?.school_name, school_code: license?.school_id, tier: license?.license_tier,
    })
  }

  // Update last boot
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('last_boot_date', ?, datetime('now'))").run(now.toISOString())

  // Expiry check
  let licenseStatus = 'active'
  if (expiry && now > expiry) {
    licenseStatus = 'expired'
  }

  if (!license.is_active) {
    licenseStatus = 'suspended'
  }

  // Load features
  const featuresRaw = db.prepare("SELECT value FROM app_settings WHERE key = 'license_features'").get()?.value
  const features = featuresRaw ? JSON.parse(featuresRaw) : []

  const currentYearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  const currentYearRow = currentYearId
    ? db.prepare('SELECT label, end_date FROM academic_years WHERE id = ?').get(currentYearId)
    : null
  const academicYearLabel = currentYearRow?.label || null
  // For the Étape 1 countdown/redirect banner (owner-set 2026-07-13):
  // promotion opens once this date has passed.
  const academicYearEndDate = currentYearRow?.end_date || null

  // Live student count -- scoped to students actually enrolled THIS year,
  // matching the dashboard (owner report 2026-07-13: subscription page
  // showed 103, a lifetime count of every student ever created, vs the
  // dashboard's 89 -- graduated/excluded/not-yet-reenrolled students were
  // inflating the billing number forever). Same join shape as the finance
  // dashboard's total_students so the two numbers can never diverge again.
  const actualStudents = currentYearId
    ? db.prepare(`
        SELECT COUNT(*) as cnt FROM students s
        JOIN enrollments e ON e.student_id = s.id AND e.academic_year_id = ? AND e.is_deleted = 0
        WHERE s.is_deleted = 0
      `).get(currentYearId)?.cnt || 0
    : 0

  // After a cloud restore the school is configured but has zero users
  // (users are never synced) — the boot flow needs to detect that state.
  const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users WHERE is_deleted = 0 AND is_active = 1').get()?.cnt || 0

  return res.json({
    activated: true,
    academic_year_label: academicYearLabel,
    academic_year_end_date: academicYearEndDate,
    configured: config?.is_configured === 1,
    has_users: userCount > 0,
    license_status: licenseStatus,
    school_name: config?.school_name || null,
    school_code: license?.school_id || null,
    school_prefix: config?.school_prefix || null,
    tier: license?.license_tier || null,
    expiry: license?.license_expiry || null,
    features,
    actual_student_count: actualStudents,
    rate_per_student: license?.rate_per_student || 0,
    declared_student_count: license?.declared_student_count || 0,
    paid_student_count: license?.paid_student_count || 0,
    allowed_students: license?.allowed_students || 0,
    amount_paid: license?.amount_paid || 0,
    installation_fee: license?.installation_fee || 0,
    installation_fee_paid: !!license?.installation_fee_paid,
    semesters_active: license?.semesters_active || 3,
  })
})

// ─── GET /api/activation/student-count ──────────────────────
router.get('/student-count', (req, res) => {
  const db = getDb()
  const currentYearId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_academic_year_id'").get()?.value
  const count = currentYearId
    ? db.prepare(`
        SELECT COUNT(*) as cnt FROM students s
        JOIN enrollments e ON e.student_id = s.id AND e.academic_year_id = ? AND e.is_deleted = 0
        WHERE s.is_deleted = 0
      `).get(currentYearId)?.cnt || 0
    : 0
  return res.json({ count })
})

// ─── POST /api/activation/activate ──────────────────────────
router.post('/activate', async (req, res) => {
  try {
    const { school_code, license_key, fingerprint } = req.body

    if (!school_code || !license_key || !fingerprint) {
      return res.status(400).json({
        error: 'MISSING_FIELDS',
        message: 'Code école, clé de licence et empreinte matérielle requis',
      })
    }

    // 1 PC = 1 school: never overwrite one school's identity onto another
    // school's data. Re-activating the SAME school (renewal, reissued key)
    // stays allowed — this only fires on a school-code mismatch.
    const existingConfig = getDb().prepare('SELECT school_code, is_configured FROM school_config LIMIT 1').get()
    if (existingConfig?.school_code && existingConfig.is_configured === 1
        && existingConfig.school_code !== school_code.trim().toUpperCase()) {
      return res.status(403).json({
        error: 'SCHOOL_MISMATCH',
        message: `Ce PC contient déjà les données d'un autre établissement (${existingConfig.school_code}). Contactez ScolaDesk.`,
      })
    }

    const response = await axios.post(`${CAP_URL}/api/activate`, {
      school_id: school_code.trim().toUpperCase(),
      license_key: license_key.trim().toUpperCase(),
      hardware_fingerprint: fingerprint,
    }, {
      headers: { 'X-ScolaDesk-Secret': PAYLOAD_SECRET },
    })

    const payload = response.data.payload
    if (!payload) {
      return res.status(400).json({ error: 'NO_PAYLOAD', message: 'Aucune licence retournée' })
    }

    // Verify signature
    if (!verifySignature(payload)) {
      return res.status(400).json({ error: 'SIGNATURE_INVALID', message: 'Signature de licence invalide — possible altération' })
    }

    // Store locally
    const db = getDb()
    storeLicenseLocally(db, payload, fingerprint)
    rekeyIfNeeded(db, payload.db_encryption_key)

    return res.json({
      success: true,
      school: {
        school_name: payload.school_name,
        school_code: payload.school_code,
        school_prefix: payload.school_prefix,
        director_name: payload.director_name,
        tier: payload.tier,
        expiry_date: payload.expiry_date,
        semesters_active: payload.semesters_active,
        features: payload.features,
        rate_per_student: payload.rate_per_student,
        declared_student_count: payload.declared_student_count,
        allowed_students: payload.allowed_students,
      },
    })
  } catch (err) {
    const data = err.response?.data
    const status = err.response?.status || 500
    console.error('[ACTIVATION]', data?.error || err.message)
    return res.status(status).json(
      data || { error: 'CONNECTION_ERROR', message: 'Impossible de contacter le serveur central. Vérifiez votre connexion internet.' }
    )
  }
})

// ─── Background license check-in ────────────────────────────
// Owner request 2026-07-16: CAP-side changes (renewal, suspension,
// reissue) had no way to reach an already-activated install short of the
// admin manually re-entering a key in Paramètres > Licence. Called from
// index.js's timer -- gated there to at most once per calendar day, and
// only attempted at all while the necessary local state exists.
// A same-device renewal/reissue is picked up silently; a genuine
// HARDWARE_MISMATCH (different device) is left untouched -- that still
// requires the admin to manually re-activate, unchanged from before.
async function runLicenseCheckin(db) {
  const license = db.prepare('SELECT school_id, hardware_fingerprint FROM license_state LIMIT 1').get()
  if (!license?.school_id || !license?.hardware_fingerprint) return { ok: false, reason: 'NOT_ACTIVATED' }

  try {
    const response = await axios.post(`${CAP_URL}/api/license-status`, {
      school_id: license.school_id,
      hardware_fingerprint: license.hardware_fingerprint,
    }, {
      headers: { 'X-ScolaDesk-Secret': PAYLOAD_SECRET },
      timeout: 15000,
    })

    const payload = response.data.payload
    if (!payload || !verifySignature(payload)) return { ok: false, reason: 'INVALID_PAYLOAD' }

    storeLicenseLocally(db, payload, license.hardware_fingerprint)
    rekeyIfNeeded(db, payload.db_encryption_key)
    return { ok: true }
  } catch (err) {
    const data = err.response?.data
    if (data?.error === 'LICENSE_SUSPENDED') {
      db.prepare('UPDATE license_state SET is_active = 0').run()
      console.log('[LICENSE CHECKIN] Suspended by CAP.')
      return { ok: true, suspended: true }
    }
    if (data?.error === 'HARDWARE_MISMATCH' || data?.error === 'NOT_FOUND') {
      // Doesn't match what CAP has on file (e.g. a device change reissue) --
      // leave local state untouched, admin re-activates manually as before.
      console.log('[LICENSE CHECKIN]', data.error)
      return { ok: false, reason: data.error }
    }
    // Offline or CAP unreachable -- normal, expected, not worth logging noisily.
    return { ok: false, reason: 'UNREACHABLE' }
  }
}

module.exports = router
module.exports.runLicenseCheckin = runLicenseCheckin
