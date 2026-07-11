import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import api from '../utils/api'

const AuthContext = createContext(null)

const SESSION_KEY = 'scola_token'
const IDLE_MS = 4 * 60 * 60 * 1000       // 4 hours of inactivity → logout
const WARN_BEFORE_MS = 5 * 60 * 1000     // show warning 5 min before

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(true)
    const [idleWarning, setIdleWarning] = useState(false)
    const [sessionMessage, setSessionMessage] = useState('')
    const warnRef = useRef(null)
    const logoutRef = useRef(null)
    const userRef = useRef(null)

    useEffect(() => { userRef.current = user }, [user])

    const doLogout = useCallback(async () => {
        clearTimeout(warnRef.current)
        clearTimeout(logoutRef.current)
        try { await api.post('/api/auth/logout') } catch { /* token already invalid client-side regardless */ }
        sessionStorage.removeItem(SESSION_KEY)
        delete api.defaults.headers.common['Authorization']
        setUser(null)
        setIdleWarning(false)
    }, [])

    // Local-only cleanup for when the session is already dead server-side
    // (replaced by a login elsewhere) -- calling /api/auth/logout here would
    // just 401 again for no benefit.
    const forceLogout = useCallback((message) => {
        clearTimeout(warnRef.current)
        clearTimeout(logoutRef.current)
        sessionStorage.removeItem(SESSION_KEY)
        delete api.defaults.headers.common['Authorization']
        setUser(null)
        setIdleWarning(false)
        setSessionMessage(message)
    }, [])

    useEffect(() => {
        const handler = () => forceLogout('Vous avez été déconnecté — connexion depuis un autre appareil.')
        window.addEventListener('scola:session-replaced', handler)
        return () => window.removeEventListener('scola:session-replaced', handler)
    }, [forceLogout])

    const resetIdle = useCallback(() => {
        if (!userRef.current) return
        clearTimeout(warnRef.current)
        clearTimeout(logoutRef.current)
        setIdleWarning(false)
        warnRef.current = setTimeout(() => setIdleWarning(true), IDLE_MS - WARN_BEFORE_MS)
        logoutRef.current = setTimeout(doLogout, IDLE_MS)
    }, [doLogout])

    // Restore session from sessionStorage on mount (survives reload, cleared on window close)
    useEffect(() => {
        const saved = sessionStorage.getItem(SESSION_KEY)
        if (!saved) { setLoading(false); return }
        api.defaults.headers.common['Authorization'] = `Bearer ${saved}`
        api.get('/api/auth/me')
            .then(res => setUser(res.data.user))
            .catch(() => {
                // Token expired or invalid — clear and show login
                sessionStorage.removeItem(SESSION_KEY)
                delete api.defaults.headers.common['Authorization']
            })
            .finally(() => setLoading(false))
    }, [])

    // Activity tracking — reset idle timer on any user interaction
    useEffect(() => {
        if (!user) {
            clearTimeout(warnRef.current)
            clearTimeout(logoutRef.current)
            return
        }
        const events = ['mousedown', 'keydown', 'touchstart', 'wheel']
        events.forEach(e => window.addEventListener(e, resetIdle, { passive: true }))
        resetIdle()
        return () => {
            events.forEach(e => window.removeEventListener(e, resetIdle))
            clearTimeout(warnRef.current)
            clearTimeout(logoutRef.current)
        }
    }, [user, resetIdle])

    async function login(username, password) {
        const res = await api.post('/api/auth/login', { username, password })
        const { token, user: u } = res.data
        sessionStorage.setItem(SESSION_KEY, token)
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`
        setUser(u)
        return u
    }

    function hasPermission(code) {
        if (!user) return false
        const perms = user.permissions || []
        if (perms.includes('*')) return true
        if (perms.includes(code)) return true
        return perms.includes(`${code.split('.')[0]}.*`)
    }

    return (
        <AuthContext.Provider value={{
            user,
            loading,
            login,
            logout: doLogout,
            hasPermission,
            isAuthenticated: !!user,
            idleWarning,
            stayLoggedIn: resetIdle,
            sessionMessage,
            clearSessionMessage: () => setSessionMessage(''),
        }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used within AuthProvider')
    return ctx
}
