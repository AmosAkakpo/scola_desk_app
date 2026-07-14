// Production-build obfuscation pass, run by `electron:build` between
// `vite build` and `electron-builder`. Dev (`electron:dev`) never touches
// this -- it runs the plain source directly.
//
// Two targets, different settings:
//  - server/  -> build_server/  (the copy electron-builder ships as
//    resources/server and actually forks in production). This is where the
//    sensitive logic lives (license validation, payload signature checks,
//    rekey, pricing) so it gets the stronger profile. The raw server/ dir
//    is excluded from packaging entirely (see package.json "files").
//  - dist/assets/index-*.js (the app's own bundle, in place). Vendor
//    chunks (jspdf, html2canvas, purify...) are public libraries -- nothing
//    to hide, and obfuscating them just bloats size and load time.
//
// Deliberately NOT enabled anywhere: selfDefending and debugProtection
// (both are known to misbehave under Electron/Node and make real crash
// reports undebuggable), deadCodeInjection (pure size bloat).
const fs = require('fs')
const path = require('path')
const JavaScriptObfuscator = require('javascript-obfuscator')

const root = path.join(__dirname, '..')
const serverSrc = path.join(root, 'server')
const serverOut = path.join(root, 'build_server')
const distAssets = path.join(root, 'dist', 'assets')

const SERVER_OPTIONS = {
    target: 'node',
    compact: true,
    // Low threshold: better-sqlite3 is synchronous, so server CPU time is
    // shared by every LAN user at once -- keep the flattening tax small.
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.3,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.8,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,
    selfDefending: false,
    debugProtection: false,
    deadCodeInjection: false,
}

const FRONTEND_OPTIONS = {
    target: 'browser',
    compact: true,
    // No control-flow flattening in the UI bundle: it runs on the school's
    // (often weak) PCs and grade-entry screens are already render-heavy.
    controlFlowFlattening: false,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.75,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,
    selfDefending: false,
    debugProtection: false,
    deadCodeInjection: false,
}

function obfuscateFile(filePath, options) {
    const source = fs.readFileSync(filePath, 'utf8')
    const result = JavaScriptObfuscator.obfuscate(source, options)
    fs.writeFileSync(filePath, result.getObfuscatedCode(), 'utf8')
}

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const p = path.join(dir, e.name)
        return e.isDirectory() ? walk(p) : [p]
    })
}

// --- server ---
fs.rmSync(serverOut, { recursive: true, force: true })
fs.cpSync(serverSrc, serverOut, { recursive: true })

let count = 0
for (const file of walk(serverOut)) {
    if (file.endsWith('.js')) {
        obfuscateFile(file, SERVER_OPTIONS)
        count++
    }
}
console.log(`[OBFUSCATE] server: ${count} files -> build_server/`)

// --- frontend app bundle ---
if (!fs.existsSync(distAssets)) {
    console.error('[OBFUSCATE] dist/assets missing — run `vite build` first')
    process.exit(1)
}
count = 0
for (const name of fs.readdirSync(distAssets)) {
    if (/^index-.*\.js$/.test(name)) {
        obfuscateFile(path.join(distAssets, name), FRONTEND_OPTIONS)
        count++
    }
}
if (count === 0) {
    console.error('[OBFUSCATE] no index-*.js app bundle found in dist/assets — chunk naming changed?')
    process.exit(1)
}
console.log(`[OBFUSCATE] frontend: ${count} app bundle(s) obfuscated in place`)
