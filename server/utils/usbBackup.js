const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3-multiple-ciphers')
const { generateUUID } = require('./uid')

const MARKER_FILE = '.scoladesk_backup'
const BACKUP_DIR_NAME = 'ScolaDesk_Backups'
const RETENTION_COUNT = 7
const SCHEDULED_HOUR = 17 // 5 PM, owner-set default
const FILENAME_RE = /^scolaDesk_backup_.*\.db$/

// Scans D: through Z: for the marker file. Skips A/B (legacy floppy) and C
// (system drive) -- rural school PCs are Windows, drive letters are the
// simplest portable way to find a plugged-in USB without shelling out to
// WMI/PowerShell. The marker file is a one-time setup step (engineer drops
// an empty `.scoladesk_backup` file on the USB root) rather than relying on
// a fragile volume-label match.
function findBackupDrive() {
  for (let code = 'D'.charCodeAt(0); code <= 'Z'.charCodeAt(0); code++) {
    const letter = String.fromCharCode(code)
    try {
      if (fs.existsSync(`${letter}:\\${MARKER_FILE}`)) return `${letter}:\\`
    } catch { /* drive not ready / no media -- keep scanning */ }
  }
  return null
}

function pruneOldBackups(backupDir) {
  const files = fs.readdirSync(backupDir)
    .filter(f => FILENAME_RE.test(f))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(backupDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  for (const f of files.slice(RETENTION_COUNT)) {
    fs.unlinkSync(path.join(backupDir, f.name))
  }
}

// Not better-sqlite3's online backup API -- verified (2026-07-16) that
// db.backup() fails outright between encrypted databases with this
// library ("incompatible source and target databases"): the native path
// opens the destination fresh with no way to pass it a key, and there's
// no SQL-level export function in this build either (sqlite3mc_export /
// sqlite3_export / sqlcipher_export all probed, none exist). Since the
// live file is already encrypted at rest, a WAL-checkpointed raw file
// copy IS a valid encrypted backup -- no online-backup API needed.
async function runBackup(db) {
  const drive = findBackupDrive()
  if (!drive) return { ok: false, reason: 'NO_USB' }

  const backupUid = generateUUID()
  db.prepare("INSERT INTO backup_log (backup_uid, status) VALUES (?, 'pending')").run(backupUid)

  const backupDir = path.join(drive, BACKUP_DIR_NAME)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filePath = path.join(backupDir, `scolaDesk_backup_${timestamp}.db`)

  try {
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true })

    // db.name is the path better-sqlite3 opened the connection with.
    db.pragma('wal_checkpoint(TRUNCATE)')
    fs.copyFileSync(db.name, filePath)

    // Integrity check on the copy, via a throwaway read-only connection --
    // never trust a backup that hasn't actually been verified openable.
    // A raw file copy of an encrypted DB is still encrypted, so this
    // connection needs the same key.
    const check = new Database(filePath, { readonly: true })
    check.pragma(`key='${process.env.SCOLA_DB_KEY}'`)
    const result = check.pragma('integrity_check')
    check.close()
    const integrityOk = result.length === 1 && result[0].integrity_check === 'ok'

    db.prepare(`
      UPDATE backup_log SET status = 'success', completed_at = datetime('now'), file_path = ?, integrity_ok = ?
      WHERE backup_uid = ?
    `).run(filePath, integrityOk ? 1 : 0, backupUid)

    pruneOldBackups(backupDir)

    return { ok: true, filePath, integrityOk }
  } catch (err) {
    db.prepare(`
      UPDATE backup_log SET status = 'failed', completed_at = datetime('now'), error_message = ?
      WHERE backup_uid = ?
    `).run(err.message, backupUid)
    return { ok: false, reason: 'ERROR', error: err.message }
  }
}

function hasSuccessfulBackupToday(db) {
  return !!db.prepare(`
    SELECT 1 FROM backup_log
    WHERE status = 'success' AND date(completed_at, 'localtime') = date('now', 'localtime')
    LIMIT 1
  `).get()
}

// Checked periodically (see index.js), not on a strict "exactly 5 PM"
// timer -- a school leaving the app open catches it right at 5 PM, but a
// USB plugged in later in the evening still triggers a same-day backup
// instead of silently waiting for tomorrow.
async function maybeRunScheduledBackup(db) {
  if (new Date().getHours() < SCHEDULED_HOUR) return
  if (hasSuccessfulBackupToday(db)) return
  if (!findBackupDrive()) return
  try { await runBackup(db) } catch (err) { console.error('[USB BACKUP]', err) }
}

function getBackupStatus(db) {
  const last = db.prepare("SELECT * FROM backup_log WHERE status = 'success' ORDER BY completed_at DESC LIMIT 1").get()
  const recent = db.prepare('SELECT * FROM backup_log ORDER BY started_at DESC LIMIT 7').all()
  const daysStale = last?.completed_at
    ? Math.floor((Date.now() - new Date(last.completed_at).getTime()) / (24 * 60 * 60 * 1000))
    : null

  return {
    last_backup_at: last?.completed_at || null,
    days_stale: daysStale,
    drive_detected: !!findBackupDrive(),
    recent,
  }
}

module.exports = { findBackupDrive, runBackup, maybeRunScheduledBackup, getBackupStatus }
