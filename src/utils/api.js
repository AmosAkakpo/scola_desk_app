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
        return Promise.reject({ ...err, friendlyMessage: message })
    }
)

export default api