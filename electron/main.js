const { app, BrowserWindow, shell } = require('electron')
const path = require('path')
const { fork } = require('child_process')
const { registerHardwareIPC } = require('./ipc/hardware')

const isDev = !app.isPackaged

let mainWindow
let serverProcess

function startExpressServer() {
    const serverPath = isDev
        ? path.join(__dirname, '../server/index.js')
        : path.join(process.resourcesPath, 'server/index.js')

    serverProcess = fork(serverPath, [], {
        env: {
            ...process.env,
            PORT: '3000',
            NODE_ENV: isDev ? 'development' : 'production',
        },
        stdio: 'pipe',
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
        icon: path.join(__dirname, '../public/android-chrome-512x512.png'),
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

    mainWindow.loadURL(url)

    mainWindow.once('ready-to-show', () => {
        mainWindow.show()
        if (isDev) mainWindow.webContents.openDevTools()
    })

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url)
        return { action: 'deny' }
    })
}

app.whenReady().then(() => {
    registerHardwareIPC()
    startExpressServer()
    setTimeout(createWindow, 1500)
})

app.on('window-all-closed', () => {
    if (serverProcess) serverProcess.kill()
    if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
    if (serverProcess) serverProcess.kill()
})