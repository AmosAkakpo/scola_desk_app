const { app, BrowserWindow, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')
const { fork } = require('child_process')
const { registerHardwareIPC } = require('./ipc/hardware')
const { getOrCreateDbKey, storeDbKey } = require('./dbKey')

const isDev = !app.isPackaged

// Owner report 2026-07-18: nothing stopped opening the app twice -- two
// instances would both try to bind port 3000 and both open the same
// encrypted DB file, real risk of corruption or a confusing silent
// failure. Must be claimed BEFORE anything else runs: if a second
// launch loses the race, it quits immediately here, before ever
// forking a server or touching the database.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
    // app.quit() alone doesn't stop the rest of this script from running --
    // without the early return below, this losing instance would still
    // reach app.whenReady() further down and fork its own server.
    app.quit()
    return
}

// Packaged GUI-subsystem exe has no console a support call could ever read
// on a school PC -- mirror console output to a plain file next to the DB
// so a remote support session can ask the owner to open one text file.
// Overwritten each launch (previous run's log renamed .old), stays small.
function setupFileLogging() {
    const logDir = path.join(app.getPath('userData'), 'logs')
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })
    const logPath = path.join(logDir, 'main.log')
    if (fs.existsSync(logPath)) {
        fs.renameSync(logPath, path.join(logDir, 'main.log.old'))
    }
    const stream = fs.createWriteStream(logPath, { flags: 'a' })
    const write = (level, args) => {
        const line = `[${new Date().toISOString()}] [${level}] ${args.map(a => (a instanceof Error ? a.stack : String(a))).join(' ')}\n`
        stream.write(line)
    }
    const origLog = console.log.bind(console)
    const origErr = console.error.bind(console)
    console.log = (...args) => { origLog(...args); write('LOG', args) }
    console.error = (...args) => { origErr(...args); write('ERR', args) }
    process.on('uncaughtException', (err) => console.error('[UNCAUGHT]', err))
    process.on('unhandledRejection', (err) => console.error('[UNHANDLED REJECTION]', err))
    console.log(`ScolaDesk starting — packaged=${app.isPackaged}, version=${app.getVersion()}`)
}

let mainWindow
let serverProcess

function startExpressServer() {
    const serverPath = isDev
        ? path.join(__dirname, '../server/index.js')
        : path.join(process.resourcesPath, 'server/index.js')

    // Key custody lives here (safeStorage is main-process only — the
    // server is a forked child); the plaintext key rides down via env.
    const dbKey = getOrCreateDbKey()

    serverProcess = fork(serverPath, [], {
        env: {
            ...process.env,
            PORT: '3000',
            NODE_ENV: isDev ? 'development' : 'production',
            SCOLA_DB_KEY: dbKey,
            // Without this, a packaged fork (process.defaultApp === false)
            // tries to launch the child as another full Electron app
            // instance instead of running serverPath as plain Node — it
            // silently never binds the port. Dev "works" without it only
            // because unpackaged Electron sets defaultApp=true, which
            // happens to let fork() run a script directly; that's
            // packaging-fragile, so force it explicitly either way.
            ELECTRON_RUN_AS_NODE: '1',
            // Packaged, the server sits in resources/server but its
            // dependencies live inside app.asar — outside the child's
            // normal directory walk-up. Electron's fs patches make the
            // asar path readable; NODE_PATH makes require() look there.
            ...(isDev ? {} : {
                NODE_PATH: path.join(process.resourcesPath, 'app.asar', 'node_modules'),
                // The forked server runs as plain Node (no Electron API),
                // so it can't resolve userData itself -- without this it
                // falls back to a directory inside the install folder,
                // which isn't writable under C:\Program Files.
                SCOLA_DATA_DIR: path.join(app.getPath('userData'), 'data'),
            }),
        },
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    })

    serverProcess.on('error', (err) => {
        console.error('[SERVER] Failed to start:', err)
    })
    serverProcess.on('exit', (code, signal) => {
        console.error(`[SERVER] Exited unexpectedly (code=${code}, signal=${signal})`)
    })

    // Activation rekeys the DB to the school's official CAP-escrowed key —
    // the server can't persist it (no safeStorage there), so it sends it up.
    serverProcess.on('message', (m) => {
        if (m && m.type === 'store-db-key' && typeof m.key === 'string' && m.key) {
            try { storeDbKey(m.key) } catch (err) { console.error('[DB KEY]', err) }
        }
    })

    serverProcess.stdout?.on('data', (d) =>
        console.log('[SERVER]', d.toString())
    )
    serverProcess.stderr?.on('data', (d) =>
        console.error('[SERVER ERR]', d.toString())
    )
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1024,
        minHeight: 600,
        // dev reads from public/ directly; production ships dist/ (Vite
        // already copies public/'s contents there at build time) as an
        // extraResource — public/ itself is never packaged.
        icon: isDev
            ? path.join(__dirname, '../public/android-chrome-512x512.png')
            : path.join(process.resourcesPath, 'dist/android-chrome-512x512.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        show: false,
        titleBarStyle: 'default',
    })

    // Production loads from the embedded Express server (which serves dist/)
    // instead of file:// — same origin as the API, BrowserRouter deep links
    // work, and it's the exact same URL LAN browser clients use.
    const url = isDev
        ? 'http://localhost:5173'
        : 'http://localhost:3000'

    mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
        console.error(`[WINDOW] Failed to load ${validatedURL}: ${errorDescription} (${errorCode})`)
    })

    mainWindow.loadURL(url)

    mainWindow.once('ready-to-show', () => {
        mainWindow.show()
        if (isDev) mainWindow.webContents.openDevTools()
    })

    // Belt-and-suspenders: ready-to-show should always fire, but a window
    // that silently never shows is worse than one that shows a moment
    // early -- never leave the user staring at nothing.
    setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
            mainWindow.show()
        }
    }, 5000)

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url)
        return { action: 'deny' }
    })
}

// First boot can run 19 migrations (or the one-time plaintext->encrypted
// migration) before the server binds its port -- poll instead of guessing
// a fixed delay, so the window never opens on a server that isn't ready
// yet, but also never waits longer than necessary on a normal boot.
function waitForServer(url, { timeoutMs = 30000, intervalMs = 300 } = {}) {
    const deadline = Date.now() + timeoutMs
    return new Promise((resolve) => {
        const attempt = () => {
            const req = http.get(`${url}/api/health`, (res) => {
                res.resume()
                if (res.statusCode === 200) return resolve(true)
                retry()
            })
            req.on('error', retry)
            req.setTimeout(intervalMs, () => req.destroy())
        }
        const retry = () => {
            if (Date.now() >= deadline) return resolve(false)
            setTimeout(attempt, intervalMs)
        }
        attempt()
    })
}

// Fires on the WINNING instance when a second launch is attempted --
// bring the existing window forward instead of leaving the user
// wondering why nothing happened when they double-clicked the icon.
app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
})

app.whenReady().then(async () => {
    setupFileLogging()
    registerHardwareIPC()
    startExpressServer()
    const url = isDev ? 'http://localhost:5173' : 'http://localhost:3000'
    const ready = await waitForServer(url)
    if (!ready) console.error('[BOOT] Server did not become ready within timeout — loading anyway')
    createWindow()
}).catch((err) => {
    console.error('[BOOT] whenReady chain failed:', err)
})

app.on('window-all-closed', () => {
    if (serverProcess) serverProcess.kill()
    if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
    if (serverProcess) serverProcess.kill()
})