const { app, safeStorage } = require('electron')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

// SQLCipher key custody — MAIN PROCESS ONLY. The Express server is a
// fork()ed child where safeStorage does not exist, so main.js bootstraps
// the key here and hands the plaintext down via the SCOLA_DB_KEY env var;
// the server sends new keys (activation rekey) back up the fork's IPC
// channel and storeDbKey() persists them.
//
// The key lives in <data-dir>/.dbkey as a base64 blob encrypted with the
// OS's own protection (Windows DPAPI via safeStorage — tied to this
// Windows account + machine, same trust anchor as the hardware-bound
// license). Never plaintext on disk, never inside the DB it unlocks.

function getDataDir() {
  const base = app.isPackaged
    ? path.join(app.getPath('userData'), 'data')
    : path.join(__dirname, '../data')
  if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true })
  return base
}

function keyFilePath() {
  return path.join(getDataDir(), '.dbkey')
}

function requireSafeStorage() {
  if (!safeStorage.isEncryptionAvailable()) {
    // Fail closed: storing the key un-protected would silently defeat the
    // whole feature. On Windows (our only target) DPAPI is always there.
    throw new Error('[DB KEY] safeStorage indisponible — impossible de protéger la clé de chiffrement')
  }
}

function storeDbKey(keyHex) {
  requireSafeStorage()
  const blob = safeStorage.encryptString(keyHex)
  fs.writeFileSync(keyFilePath(), blob.toString('base64'), 'utf8')
}

// Reads the persisted key, or generates a fresh random one on very first
// boot (the DB must exist — encrypted — before activation can even fetch
// the school's official CAP key; Step 4 rekeys to that one later).
function getOrCreateDbKey() {
  requireSafeStorage()
  const file = keyFilePath()
  if (fs.existsSync(file)) {
    const blob = Buffer.from(fs.readFileSync(file, 'utf8'), 'base64')
    try {
      return safeStorage.decryptString(blob)
    } catch (err) {
      // Windows can no longer decrypt this machine/account-bound blob --
      // usually a profile reset/reinstall, or the file got corrupted (e.g.
      // a power cut mid-write, plausible in this app's actual deployment
      // environment). Not necessarily fatal: activation already escrows
      // this exact key on CAP, so main.js catches this tagged error and
      // offers to re-fetch it instead of just crashing (owner report
      // 2026-07-27).
      const wrapped = new Error(`Impossible de déchiffrer la clé locale : ${err.message}`)
      wrapped.code = 'DBKEY_DECRYPT_FAILED'
      throw wrapped
    }
  }
  const keyHex = crypto.randomBytes(32).toString('hex')
  storeDbKey(keyHex)
  return keyHex
}

module.exports = { getOrCreateDbKey, storeDbKey }
