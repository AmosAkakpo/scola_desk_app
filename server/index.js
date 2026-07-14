const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const express = require('express')
const cors = require('cors')
const { initializeDatabase } = require('./db/init')

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Initialize DB
initializeDatabase()

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', app: 'ScolaDesk', version: '1.0.0' })
})

// Routes
app.use('/api/auth', require('./routes/auth'))
app.use('/api/activation', require('./routes/activation'))

// Everything below this point is write-blocked school-wide once the
// license has expired -- /auth (login/logout) and /activation
// (status + reactivation) must always stay reachable, everything else
// doesn't need individual exceptions since GETs are never touched anyway.
app.use(require('./middleware/requireActiveLicense').requireActiveLicense)

app.use('/api/onboarding', require('./routes/onboarding'))
app.use('/api/students', require('./routes/students'))
app.use('/api/classrooms', require('./routes/classrooms'))
app.use('/api/teachers', require('./routes/teachers'))
app.use('/api/settings', require('./routes/settings'))
app.use('/api/grades', require('./routes/grades'))
app.use('/api/timetable', require('./routes/timetable'))
app.use('/api/decisions', require('./routes/decisions'))
app.use('/api/report-cards', require('./routes/reportcards'))
app.use('/api/finance', require('./routes/finance'))
app.use('/api/attendance', require('./routes/attendance'))
app.use('/api/sync', require('./routes/sync'))
app.use('/api/restore', require('./routes/restore'))
app.use('/api/users', require('./routes/users'))
app.use('/api/promotion', require('./routes/promotion'))
app.use('/api/backup', require('./routes/backup'))

// USB backup runs on a background timer, checked every 15 min -- catches
// both "app was already open at 5 PM" and "USB got plugged in later that
// evening" instead of requiring an exact-time trigger.
const { maybeRunScheduledBackup } = require('./utils/usbBackup')
setInterval(() => {
    try {
        const { getDb } = require('./db/init')
        maybeRunScheduledBackup(getDb())
    } catch (err) { console.error('[USB BACKUP SCHEDULER]', err) }
}, 15 * 60 * 1000)

// ─── Static frontend (multi-poste LAN access) ───────────────
// Serves the built React app so secondary PCs on the school's network can
// use a plain browser at http://scoladesk:3000 (or http://<ip>:3000).
// The Electron window loads the same URL in production. In dev, Vite (5173)
// serves the UI and dist/ may not exist — hence the existence guard.
const fs = require('fs')
const distDir = path.join(__dirname, '../dist')
if (fs.existsSync(distDir)) {
    app.use(express.static(distDir))
    // SPA fallback (Express 5: no '*' route patterns — plain middleware).
    // Anything that isn't /api and wasn't a static file gets index.html so
    // BrowserRouter deep links (/students, /finance/...) work in a browser.
    app.use((req, res, next) => {
        if (req.method === 'GET' && !req.path.startsWith('/api')) {
            return res.sendFile(path.join(distDir, 'index.html'))
        }
        next()
    })
}

// Global error handler — ensures every error response is JSON, not HTML
app.use((err, req, res, next) => {
    console.error('[UNHANDLED ERROR]', err)
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message || 'Erreur serveur' })
})

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] ScolaDesk running on port ${PORT}`)
})