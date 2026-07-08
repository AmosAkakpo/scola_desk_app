const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

let db

function getDatabasePath() {
    const isDev = process.env.NODE_ENV === 'development'

    let base

    if (isDev) {
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

    return path.join(base, 'scolaDesk.db')
}

function initializeDatabase() {
    const dbPath = getDatabasePath()

    db = new Database(dbPath)

    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

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

module.exports = { initializeDatabase, getDb }