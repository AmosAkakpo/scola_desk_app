const { ipcMain, app } = require('electron')
const axios = require('axios')
const crypto = require('crypto')
const { collectFingerprint } = require('./hardware')
const { storeDbKey } = require('../dbKey')

const CAP_URL = (process.env.CAP_API_URL || 'http://localhost:3001').trim()
const PAYLOAD_SECRET = (process.env.LICENSE_PAYLOAD_SECRET || 'scoladesk-v1-secret-change-in-production').trim()

// Same signature check as server/routes/activation.js's verifySignature --
// duplicated here because this runs from the recovery window, before the
// forked Express server (and its copy of this logic) can even start.
function verifySignature(payload) {
  const copy = { ...payload }
  delete copy.signature
  const expected = crypto.createHmac('sha256', PAYLOAD_SECRET).update(JSON.stringify(copy)).digest('hex')
  return expected === payload.signature
}

// Recovery for a local .dbkey that Windows can no longer decrypt (see
// dbKey.js). CAP already escrows this exact key under the school's
// license (activation rekeys the DB to it) -- /api/activate already
// returns it again for an ACTIVE license whose hardware fingerprint still
// matches, the same path a normal re-activation takes. So this doesn't
// need any new CAP endpoint, just a way to reach that flow before the
// app's own server/UI can boot (owner report 2026-07-27).
function registerKeyRecoveryIPC() {
  ipcMain.handle('recover-db-key', async (event, { schoolCode, licenseKey }) => {
    try {
      const fp = collectFingerprint()
      const response = await axios.post(`${CAP_URL}/api/activate`, {
        school_id: schoolCode.trim().toUpperCase(),
        license_key: licenseKey.trim().toUpperCase(),
        hardware_fingerprint: fp.fingerprint,
      }, {
        headers: { 'X-ScolaDesk-Secret': PAYLOAD_SECRET },
        timeout: 15000,
      })

      const payload = response.data.payload
      if (!payload || !verifySignature(payload)) {
        return { success: false, message: 'Réponse du serveur invalide — signature incorrecte.' }
      }
      if (!payload.db_encryption_key) {
        return { success: false, message: "Le serveur n'a pas retourné de clé de récupération." }
      }

      storeDbKey(payload.db_encryption_key)
      // Restart is the simplest way back into the normal boot path --
      // .dbkey is now valid, so getOrCreateDbKey() will succeed this time.
      setTimeout(() => { app.relaunch(); app.exit() }, 1200)
      return { success: true }
    } catch (err) {
      const message = err.response?.data?.message
        || (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT'
          ? 'Impossible de contacter le serveur ScolaDesk. Vérifiez votre connexion internet.'
          : err.message)
      return { success: false, message }
    }
  })
}

module.exports = { registerKeyRecoveryIPC }
