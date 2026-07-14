const express = require('express')
const router = express.Router()
const { getDb } = require('../db/init')
const { requireAuth } = require('../middleware/requireAuth')
const { runBackup, getBackupStatus } = require('../utils/usbBackup')

router.use(requireAuth)

// USB backup is core to both tiers (not requirePro) but admin-only, same
// gating convention as sync.js.
router.use((req, res, next) => {
  if (req.user?.role_name !== 'admin') {
    return res.status(403).json({ error: 'PERMISSION_DENIED', message: "Réservé à l'administrateur" })
  }
  next()
})

// ─── GET /api/backup/status ────────────────────────────────────
router.get('/status', (req, res) => {
  const db = getDb()
  return res.json(getBackupStatus(db))
})

// ─── POST /api/backup/run — manual "Sauvegarder maintenant" ───
router.post('/run', async (req, res) => {
  const db = getDb()
  const result = await runBackup(db)
  if (!result.ok) {
    const message = result.reason === 'NO_USB'
      ? 'Aucune clé USB de sauvegarde détectée. Branchez la clé marquée pour ScolaDesk.'
      : `Échec de la sauvegarde : ${result.error || 'erreur inconnue'}`
    return res.status(400).json({ error: result.reason || 'BACKUP_FAILED', message })
  }
  return res.json({ success: true, file_path: result.filePath, integrity_ok: result.integrityOk })
})

module.exports = router
