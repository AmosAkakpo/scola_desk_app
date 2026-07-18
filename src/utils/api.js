import axios from 'axios'

// Dev: Vite serves the UI on 5173, the API lives on 3000 → absolute URL.
// Prod: Express serves BOTH the UI and the API on the same origin (the
// Electron window and LAN browser clients at http://scoladesk:3000 or
// http://<ip>:3000) → relative URLs so requests hit whichever host the
// page was loaded from, never a hardcoded localhost.
const api = axios.create({
    baseURL: import.meta.env.DEV ? 'http://localhost:3000' : '',
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json'
    }
})

// Response interceptor — handle global errors
api.interceptors.response.use(
    res => res,
    err => {
        const message = err.response?.data?.message || 'Erreur de connexion au serveur'
        // Someone logged into this account elsewhere — fires no matter which
        // page/component made the request. AuthContext listens for this to
        // force a local logout with an explanatory message (a plain window
        // event, not a direct import, to avoid a circular api.js<->AuthContext
        // dependency).
        if (err.response?.data?.error === 'SESSION_REPLACED') {
            window.dispatchEvent(new CustomEvent('scola:session-replaced'))
        }
        // Fires on EVERY blocked write app-wide (requireActiveLicense.js),
        // not just the pages that happen to have their own error handling
        // -- owner report 2026-07-18: expulsion/transfert/sanction just
        // spun and died with an uncaught console error, no feedback at
        // all. One global toast instead of auditing/disabling every
        // mutating button across the app for the same practical result.
        if (err.response?.data?.error === 'LICENSE_EXPIRED' || err.response?.data?.error === 'LICENSE_REACTIVATION_NEEDED') {
            window.dispatchEvent(new CustomEvent('scola:license-blocked', { detail: message }))
        }
        return Promise.reject({ ...err, friendlyMessage: message })
    }
)

export default api