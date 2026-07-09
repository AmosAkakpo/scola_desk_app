const express = require('express')
const router = express.Router()
const axios = require('axios')
const { getDb } = require('../db/init')
const { SYNC_TABLES, TABLE_LABELS } = require('./sync')

const CAP_URL = (process.env.CAP_API_URL || 'http://localhost:3001').trim()
const PAYLOAD_SECRET = (process.env.LICENSE_PAYLOAD_SECRET || 'scoladesk-v1-secret-change-in-production').trim()

// Restore runs pre-login (there are no users yet) — same trust level as the
// activation routes. It is inert once the school is configured (guard below).
const TABLE_NAMES = new Set(SYNC_TABLES.map(t => t.name))

let running = null // { currentChunk, totalChunks, currentLabel }
let lastResult = null // { status: 'success'|'failed', error, records_restored, finished_at }

function getCredentials(db) {
  const license = db.prepare('SELECT school_id, hardware_fingerprint FROM license_state LIMIT 1').get()
  if (!license?.school_id || !license?.hardware_fingerprint) return null
  return { school_id: license.school_id, hardware_fingerprint: license.hardware_fingerprint }
}

// Restore must only ever fill a not-yet-configured install.
function restoreBlocked(db) {
  const configured = db.prepare('SELECT is_configured FROM school_config LIMIT 1').get()?.is_configured === 1
  const hasStudents = (db.prepare('SELECT COUNT(*) as cnt FROM students').get()?.cnt || 0) > 0
  const hasUsers = (db.prepare('SELECT COUNT(*) as cnt FROM users').get()?.cnt || 0) > 0
  return configured || hasStudents || hasUsers
}

async function postToCap(body) {
  const res = await axios.post(`${CAP_URL}/api/restore`, body, {
    headers: { 'X-ScolaDesk-Secret': PAYLOAD_SECRET },
  })
  return res.data
}

function insertChunk(db, tableName, rows) {
  if (!rows.length) return 0
  const liveCols = new Set(db.prepare(`PRAGMA table_info(${tableName})`).all().map(c => c.name))
  // Intersect backup columns with the live schema: a backup taken on an older
  // schema inserts cleanly into a newer one (new columns take their defaults).
  const cols = Object.keys(rows[0]).filter(c => liveCols.has(c))
  if (!cols.length) return 0
  const stmt = db.prepare(
    `INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
  )
  db.transaction(() => {
    for (const row of rows) stmt.run(cols.map(c => row[c]))
  })()
  return rows.length
}

async function runRestore(syncUid, totalChunks) {
  const db = getDb()
  const creds = getCredentials(db)
  let recordsRestored = 0

  // Incoming data is an internally-consistent snapshot; chunks arrive in the
  // upload's dependency order but FKs are disabled for the duration anyway so
  // a mid-restore poll can't hit a transient inconsistency.
  db.pragma('foreign_keys = OFF')
  try {
    // Wipe migration seeds (levels, subjects, app_settings defaults, ...) so
    // the backup's own rows don't collide; the DB is unconfigured, so seeds
    // are the only rows that exist.
    db.transaction(() => {
      for (let i = SYNC_TABLES.length - 1; i >= 0; i--) {
        db.prepare(`DELETE FROM ${SYNC_TABLES[i].name}`).run()
      }
    })()

    for (let i = 0; i < totalChunks; i++) {
      running.currentChunk = i
      const chunk = await postToCap({
        action: 'chunk',
        ...creds,
        sync_uid: syncUid,
        chunk_index: i,
      })

      if (!TABLE_NAMES.has(chunk.table_name)) {
        throw new Error(`Table inattendue dans la sauvegarde: ${chunk.table_name}`)
      }
      running.currentLabel = TABLE_LABELS[chunk.table_name] || chunk.table_name
      recordsRestored += insertChunk(db, chunk.table_name, chunk.rows || [])
    }

    lastResult = { status: 'success', records_restored: recordsRestored, finished_at: new Date().toISOString() }
  } catch (err) {
    const message = err.response?.data?.message || err.message || 'Erreur de restauration'
    console.error('[RESTORE] Failed', message)
    lastResult = { status: 'failed', error: message, finished_at: new Date().toISOString() }
  } finally {
    db.pragma('foreign_keys = ON')
    running = null
  }
}

// ─── GET /api/restore/check — is there a backup for this school? ─
router.get('/check', async (req, res) => {
  const db = getDb()
  if (restoreBlocked(db)) return res.json({ available: false, reason: 'ALREADY_CONFIGURED' })

  const creds = getCredentials(db)
  if (!creds) return res.json({ available: false, reason: 'NOT_ACTIVATED' })

  try {
    const info = await postToCap({ action: 'info', ...creds })
    if (!info.has_backup) return res.json({ available: false, reason: 'NO_BACKUP' })
    return res.json({
      available: true,
      sync_uid: info.sync_uid,
      chunk_count: info.chunk_count,
      records_sent: info.records_sent,
      synced_at: info.synced_at,
    })
  } catch (err) {
    const message = err.response?.data?.message || 'Impossible de contacter le serveur central'
    return res.status(err.response?.status || 500).json({ error: 'CONNECTION_ERROR', message })
  }
})

// ─── POST /api/restore/start ────────────────────────────────
router.post('/start', async (req, res) => {
  const db = getDb()
  if (running) return res.status(409).json({ error: 'RESTORE_IN_PROGRESS', message: 'Une restauration est déjà en cours' })
  if (restoreBlocked(db)) {
    return res.status(403).json({ error: 'ALREADY_CONFIGURED', message: 'Ce PC contient déjà des données — restauration impossible' })
  }

  const creds = getCredentials(db)
  if (!creds) return res.status(400).json({ error: 'NOT_ACTIVATED', message: 'Activez la licence avant de restaurer' })

  const { sync_uid, chunk_count } = req.body || {}
  if (!sync_uid || !chunk_count) {
    return res.status(400).json({ error: 'MISSING_FIELDS', message: 'sync_uid et chunk_count requis' })
  }

  running = { currentChunk: 0, totalChunks: chunk_count, currentLabel: '' }
  lastResult = null

  runRestore(sync_uid, chunk_count).catch(err => {
    console.error('[RESTORE] Unhandled runner error', err)
    running = null
  })

  res.json({ started: true })
})

// ─── GET /api/restore/progress ──────────────────────────────
router.get('/progress', (req, res) => {
  if (running) {
    return res.json({
      running: true,
      current: running.currentChunk,
      total: running.totalChunks,
      label: running.currentLabel,
    })
  }
  res.json({ running: false, last_result: lastResult })
})

module.exports = router
