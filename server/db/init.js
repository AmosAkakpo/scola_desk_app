// SQLCipher-capable fork, drop-in API-compatible with better-sqlite3 at
// the same version. Reads plain (unencrypted) SQLite files identically
// until a PRAGMA key is issued -- the swap itself changes no behavior.
const Database = require('better-sqlite3-multiple-ciphers')
const path = require('path')
const fs = require('fs')

let db

// Single source of truth for where the app's writable files live (DB,
// uploaded logos). Packaged: main.js passes the userData-based dir down
// via env, because this process is plain Node -- require('electron')
// doesn't work here, and the old fallback silently landed files inside
// the install folder, unwritable under C:\Program Files.
function getDataDir() {
    const isDev = process.env.NODE_ENV === 'development'

    let base

    if (process.env.SCOLA_DATA_DIR) {
        base = process.env.SCOLA_DATA_DIR
    } else if (isDev) {
        base = path.join(__dirname, '../../data')
    } else {
        try {
            const { app } = require('electron')
            base = path.join(app.getPath('userData'), 'data')
        } catch {
            base = path.join(__dirname, '../../data')
        }
    }

    if (!fs.existsSync(base)) {
        fs.mkdirSync(base, { recursive: true })
    }

    return base
}

function getDatabasePath() {
    return path.join(getDataDir(), 'scolaDesk.db')
}

// Plain SQLite files literally start with this 16-byte header; an
// encrypted file doesn't. Lets boot auto-detect a database from before
// encryption shipped and migrate it in place, once.
const SQLITE_PLAINTEXT_HEADER = Buffer.from('SQLite format 3\0')

function isPlaintextDb(dbPath) {
    if (!fs.existsSync(dbPath)) return false
    const buf = Buffer.alloc(16)
    const fd = fs.openSync(dbPath, 'r')
    const bytesRead = fs.readSync(fd, buf, 0, 16, 0)
    fs.closeSync(fd)
    return bytesRead === 16 && buf.equals(SQLITE_PLAINTEXT_HEADER)
}

// One-time, automatic: encrypts a pre-encryption plaintext DB in place at
// boot (any school upgrading from an older install, plus this dev machine).
// Verifies integrity + per-table row counts on the encrypted result before
// declaring success; on ANY failure it throws with the original preserved
// in a .bak next to it -- boot fails loudly rather than running on a
// half-migrated file. The .bak is deleted only after verification passes
// (a lingering plaintext copy would defeat the encryption it sits next to).
function encryptPlaintextDb(dbPath, key) {
    console.log('[DB] Base non chiffrée détectée — chiffrement en place (opération unique)...')

    // Fold the WAL into the main file and capture row counts for the
    // post-encryption verification.
    let plain = new Database(dbPath)
    const counts = {}
    const tables = plain.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()
    for (const t of tables) {
        counts[t.name] = plain.prepare(`SELECT COUNT(*) AS c FROM "${t.name}"`).get().c
    }
    plain.pragma('wal_checkpoint(TRUNCATE)')
    plain.close()

    const bak = `${dbPath}.pre-encryption-${Date.now()}.bak`
    fs.copyFileSync(dbPath, bak)

    // SQLite3MultipleCiphers cannot rekey a WAL-mode database -- switch to
    // DELETE journaling for the rewrite; normal boot restores WAL right after.
    plain = new Database(dbPath)
    plain.pragma('journal_mode = DELETE')
    plain.pragma(`rekey='${key}'`)
    plain.close()

    const enc = new Database(dbPath)
    enc.pragma(`key='${key}'`)
    const integrity = enc.pragma('integrity_check')
    if (!(integrity.length === 1 && integrity[0].integrity_check === 'ok')) {
        enc.close()
        throw new Error(`[DB] Échec de vérification après chiffrement (integrity_check) — original préservé: ${bak}`)
    }
    for (const name of Object.keys(counts)) {
        const c = enc.prepare(`SELECT COUNT(*) AS c FROM "${name}"`).get().c
        if (c !== counts[name]) {
            enc.close()
            throw new Error(`[DB] Échec de vérification après chiffrement (table ${name}: ${c} ≠ ${counts[name]}) — original préservé: ${bak}`)
        }
    }
    enc.close()

    fs.unlinkSync(bak)
    console.log('[DB] Chiffrement terminé et vérifié (intégrité + comptages).')
}

function initializeDatabase() {
    const dbPath = getDatabasePath()

    // Key arrives from the Electron main process (safeStorage custodian)
    // via env -- see electron/dbKey.js. Fail closed: never silently open
    // or create a plaintext database without it.
    const dbKey = (process.env.SCOLA_DB_KEY || '').trim()
    if (!dbKey) {
        throw new Error('[DB] SCOLA_DB_KEY manquante — le serveur doit être lancé par Electron (electron/main.js)')
    }

    if (isPlaintextDb(dbPath)) {
        encryptPlaintextDb(dbPath, dbKey)
    }

    db = new Database(dbPath)

    // MUST be the first statement on the connection -- everything after
    // reads/writes through the cipher.
    db.pragma(`key='${dbKey}'`)
    // Cheap sanity read: throws "file is not a database" here (clear, at
    // boot) if the key is wrong, instead of at some later random query.
    db.prepare('SELECT count(*) FROM sqlite_master').get()

    // WAL: readers never block writers and vice versa -- the multi-poste
    // scenario (admin editing a student while an accountant reads their
    // payments) is exactly what this mode is for; each side sees a
    // consistent snapshot, never a crash or half-written row.
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    // Writer-vs-writer collisions (two people saving at the same instant)
    // wait up to this long before erroring, instead of failing immediately.
    // Was relying on better-sqlite3's undocumented-in-code 5s default;
    // making it explicit now that multi-poste means more concurrent writers.
    db.pragma('busy_timeout = 5000')

    runMigrations()

    console.log('[DB] Initialized at:', dbPath)
    return db
}

function runMigrations() {
    db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      version     TEXT NOT NULL UNIQUE,
      executed_at TEXT DEFAULT (datetime('now'))
    )
  `)

    const migrations = [
        {
            version: '001_initial',
            run: require('./migration/001_initial').migration001
        },
        {
            version: '002_onboarding_fields',
            run: require('./migration/002_onboarding_fields').migration002
        },
        {
            version: '003_permission_codes',
            run: require('./migration/003_permission_codes').migration003
        },
        {
            version: '004_semester_decisions',
            run: require('./migration/004_semester_decisions').migration004
        },
        {
            version: '005_teacher_fields',
            run: require('./migration/005_teacher_fields').migration005
        },
        {
            version: '006_student_fields',
            run: require('./migration/006_student_fields').migration006
        },
        {
            version: '007_license_pricing_fields',
            run: require('./migration/007_license_pricing_fields').migration007
        },
        {
            version: '008_timetable',
            run: require('./migration/008_timetable').migration008
        },
        {
            version: '009_finance_module',
            run: require('./migration/009_finance_module').migration009
        },
        {
            version: '010_expulsion_conseil',
            run: require('./migration/010_expulsion_conseil').migration010
        },
        {
            version: '011_conduite_note',
            run: require('./migration/011_conduite_note').migration011
        },
        {
            version: '012_salary_payments',
            run: require('./migration/012_salary_payments').migration012
        },
        {
            version: '013_other_revenues',
            run: require('./migration/013_other_revenues').migration013
        },
        {
            version: '014_salary_adjustment',
            run: require('./migration/014_salary_adjustment').migration014
        },
        {
            version: '015_sync_checkpoint',
            run: require('./migration/015_sync_checkpoint').migration015
        },
        {
            version: '016_matricule_format',
            run: require('./migration/016_matricule_format').migration016
        },
        {
            version: '017_session_tracking',
            run: require('./migration/017_session_tracking').migration017
        },
        {
            version: '018_promotion_engine',
            run: require('./migration/018_promotion_engine').migration018
        },
        {
            version: '019_backup_log',
            run: require('./migration/019_backup_log').migration019
        }
    ]

    for (const migration of migrations) {
        const already = db
            .prepare('SELECT id FROM schema_migrations WHERE version = ?')
            .get(migration.version)

        if (!already) {
            console.log(`[DB] Running migration: ${migration.version}`)
            migration.run(db)
            db
                .prepare('INSERT INTO schema_migrations (version) VALUES (?)')
                .run(migration.version)
            console.log(`[DB] Migration complete: ${migration.version}`)
        }
    }
}

function getDb() {
    if (!db) throw new Error('[DB] Database not initialized. Call initializeDatabase() first.')
    return db
}

module.exports = { initializeDatabase, getDb, getDataDir, isPlaintextDb, encryptPlaintextDb }