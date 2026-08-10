import { useState, useEffect } from 'react'
import { NavLink, Link, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import api from '../utils/api.js'

const PROMO_BANNER_DAYS = 14

// Dismissible per year (owner request 2026-07-13): keyed by the threshold
// date, so dismissing it this year doesn't suppress it again next year --
// a fresh date is a fresh "x" to click. The threshold itself is a fixed
// calendar date (August 1st, every school, every year) rather than each
// school's own configured academic year end_date or license renewal date
// (owner decision 2026-08-09) -- alreadyDone hides it for good once this
// year's promotion has actually been run, regardless of the date.
function PromotionBanner({ thresholdDate, alreadyDone }) {
  const [dismissed, setDismissed] = useState(false)
  const storageKey = `scola_promo_banner_dismissed_${thresholdDate}`

  useEffect(() => {
    if (thresholdDate && sessionStorage.getItem(storageKey)) setDismissed(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thresholdDate])

  if (!thresholdDate || dismissed || alreadyDone) return null

  const end = new Date(thresholdDate + 'T00:00:00')
  const daysLeft = Math.ceil((end.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  if (daysLeft > PROMO_BANNER_DAYS) return null

  function dismiss() {
    sessionStorage.setItem(storageKey, '1')
    setDismissed(true)
  }

  const ready = daysLeft <= 0

  return (
    <div className={`flex items-center justify-between px-4 py-2 text-sm shrink-0 ${ready ? 'bg-brand text-white' : 'bg-amber-50 text-amber-700 border-b border-amber-200'}`}>
      {ready ? (
        <Link to="/fin-annee" className="font-medium hover:underline">
          La promotion de fin d'année est disponible — cliquez ici pour commencer →
        </Link>
      ) : (
        <span>La promotion de fin d'année sera disponible dans {daysLeft} jour{daysLeft > 1 ? 's' : ''}.</span>
      )}
      <button onClick={dismiss} className={`ml-3 shrink-0 ${ready ? 'text-white/80 hover:text-white' : 'text-amber-500 hover:text-amber-700'}`}>✕</button>
    </div>
  )
}

const LICENSE_BANNER_DAYS = 14

// Advance warning before the license actually expires -- once it has
// actually expired, the persistent red read-only banner (below, in the
// main Layout render) already covers it, so this one only shows in the
// countdown window and never after. Dismissible, keyed to the expiry date
// itself so renewing resets it.
function LicenseExpiryBanner({ expiry }) {
  const [dismissed, setDismissed] = useState(false)
  const storageKey = `scola_license_banner_dismissed_${expiry}`

  useEffect(() => {
    if (expiry && sessionStorage.getItem(storageKey)) setDismissed(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiry])

  if (!expiry || dismissed) return null

  const end = new Date(expiry + 'T00:00:00')
  const daysLeft = Math.ceil((end.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  if (daysLeft > LICENSE_BANNER_DAYS || daysLeft <= 0) return null

  function dismiss() {
    sessionStorage.setItem(storageKey, '1')
    setDismissed(true)
  }

  return (
    <div className="flex items-center justify-between px-4 py-2 text-sm shrink-0 bg-amber-50 text-amber-700 border-b border-amber-200">
      <span>
        Votre licence expire dans {daysLeft} jour{daysLeft > 1 ? 's' : ''} (le {end.toLocaleDateString('fr-FR')}) — pensez à renouveler.
        {' '}<Link to="/settings/license" className="font-medium hover:underline">Renouveler →</Link>
      </span>
      <button onClick={dismiss} className="ml-3 shrink-0 text-amber-500 hover:text-amber-700">✕</button>
    </div>
  )
}

// Access matrix (admin sees everything, within the license tier):
//   - Gestion académique  → admin + secretary
//   - Finance             → admin + accountant, PRO tier only
//   - Mon abonnement      → ALL roles, ALL tiers (locked constraint)
//   - Présences           → secretary records (PRO feature)
//   - Paramètres          → admin only (SETTINGS_ITEM below)
// Nav visibility is driven ENTIRELY by permission codes now (owner request
// 2026-07-25: admin assigns each user's page access individually, editable
// anytime, instead of being locked to a fixed "secretary"/"accountant"
// bundle). The old hardcoded `roles: [...]` arrays used to hide items from
// accountants/secretaries regardless of their actual granted permissions --
// with per-user custom access that would silently contradict what the
// admin just configured, so they're gone; `perm` alone decides visibility.
export const NAV_GROUPS = [
  {
    label: null,
    items: [
      // Same permission /api/grades/dashboard/stats itself requires --
      // whoever doesn't have it gets a working page (Finance dashboard,
      // etc.) instead of this one 403ing (owner report 2026-07-18).
      { to: '/dashboard', label: 'Tableau de bord', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', perm: 'students.view' },
      { to: '/users', label: 'Utilisateurs', icon: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a4 4 0 10-4-4', perm: 'admin' },
    ],
  },
  {
    label: 'Gestion académique',
    items: [
      { to: '/students', label: 'Élèves', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z', perm: 'students.view' },
      { to: '/teachers', label: 'Enseignants', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z', perm: 'teachers.view' },
      { to: '/classrooms', label: 'Classes', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4', perm: 'classrooms.view' },
      { to: '/timetable', label: 'Emploi du temps', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', perm: 'timetable.view' },
      { to: '/finance/attendance', label: 'Présences', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', perm: 'attendance.view', proOnly: true },
      { to: '/grades', label: 'Notes', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 5h6m-6 4h4', perm: 'grades.view' },
      { to: '/report-cards', label: 'Bulletins', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', perm: 'reports.view' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/finance', label: 'Tableau de bord', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', perm: 'finance_dashboard.view', end: true, proOnly: true },
      { to: '/finance/tuition', label: 'Paiements scolarité', icon: 'M3 10h18M7 15h2m2 0h6M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z', perm: 'tuition.view', proOnly: true },
      { to: '/finance/salaries', label: 'Salaires', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', perm: 'salaries.view', proOnly: true },
      { to: '/finance/expenses', label: 'Dépenses', icon: 'M20 12H4M20 12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4a2 2 0 012-2M20 12V8a2 2 0 00-2-2H6a2 2 0 00-2 2v4', perm: 'expenses.view', proOnly: true },
      { to: '/finance/report', label: 'Rapport financier', icon: 'M9 17v-6m4 6V7m4 10v-3M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z', perm: 'finance_report.view', proOnly: true },
      { to: '/finance/settings', label: 'Frais & catégories', icon: 'M9 7h6m0 10v-3m-3 3v-6m-3 6v-9m12 9V7a2 2 0 00-2-2H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2z', perm: 'fee_settings.view', proOnly: true },
      { to: '/finance/subscription', label: 'Mon abonnement', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', perm: null },
    ],
  },
]

const SETTINGS_ITEM = { to: '/settings', label: 'Paramètres', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z', perm: 'admin' }
const SYNC_ITEM = { to: '/sync', label: 'Synchronisation', icon: 'M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12', perm: 'admin' }
const FIN_ANNEE_ITEM = { to: '/fin-annee', label: "Fin d'année", icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4', perm: 'admin' }

function StudentCount({ actual = 0, allowed = 0 }) {
  if (!allowed) return null
  const over = actual > allowed
  return (
    <span className={`text-xs font-medium ${over ? 'text-red-600' : 'text-brand'}`}>
      {actual} / {allowed} élèves
    </span>
  )
}

// Top-bar reveal panel: every URL a secondary PC's browser can use.
// Hostname first (the stable printable link), IPs as fallback.
function NetworkPanel() {
  const [open, setOpen] = useState(false)
  const [info, setInfo] = useState(null)
  const [copied, setCopied] = useState('')

  function toggle() {
    if (!open && !info) {
      api.get('/api/settings/network').then(res => setInfo(res.data)).catch(() => {})
    }
    setOpen(!open)
  }

  function copy(url) {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(url)
      setTimeout(() => setCopied(''), 1500)
    }).catch(() => {})
  }

  const urls = info
    ? [`http://${info.hostname}:${info.port}`, ...info.ips.map(ip => `http://${ip}:${info.port}`)]
    : []

  return (
    <div className="relative">
      <button onClick={toggle} title="Accès depuis d'autres postes"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors text-xs ${
          open ? 'text-brand bg-brand-50' : 'text-steel-400 hover:text-steel-700 hover:bg-steel-100'
        }`}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
        </svg>
        Multi-postes
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 bg-white border border-steel-200 rounded-xl shadow-lg z-30 w-80 p-4">
            <p className="text-xs font-semibold text-steel-700 mb-1">Accès depuis d'autres postes</p>
            <p className="text-[11px] text-steel-500 mb-3">
              Ouvrez l'une de ces adresses dans un navigateur (Chrome, Edge) sur un autre PC connecté au même réseau Wi-Fi.
            </p>
            {!info ? (
              <p className="text-xs text-steel-400 py-2">Chargement...</p>
            ) : (
              <div className="space-y-1.5">
                {urls.map((url, i) => (
                  <div key={url} className="flex items-center justify-between gap-2 bg-steel-50 rounded-lg px-3 py-2">
                    <span className={`font-mono text-xs ${i === 0 ? 'text-steel-900 font-semibold' : 'text-steel-600'}`}>{url}</span>
                    <button onClick={() => copy(url)}
                      className="text-[11px] text-brand hover:text-brand-600 font-medium shrink-0">
                      {copied === url ? 'Copié ✓' : 'Copier'}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-steel-400 mt-3">
              Si la connexion échoue, autorisez ScolaDesk dans le pare-feu Windows de ce PC.
            </p>
          </div>
        </>
      )}
    </div>
  )
}

// Status dot: green if backed up today/yesterday, orange 2-3 days stale,
// red beyond that or never backed up (owner spec: "orange/red if stale
// >3 days").
function backupStatusColor(daysStale) {
  if (daysStale === null || daysStale > 3) return 'bg-red-500'
  if (daysStale >= 2) return 'bg-amber-500'
  return 'bg-brand'
}

function BackupPanel() {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  function load() {
    api.get('/api/backup/status').then(res => setStatus(res.data)).catch(() => {})
  }

  useEffect(() => { load() }, [])

  function toggle() {
    if (!open) load()
    setOpen(!open)
  }

  async function runNow() {
    setRunning(true)
    setError('')
    try {
      await api.post('/api/backup/run')
      load()
    } catch (err) {
      setError(err.response?.data?.message || err.friendlyMessage || 'Erreur')
    }
    setRunning(false)
  }

  const dotColor = backupStatusColor(status?.days_stale)

  return (
    <div className="relative">
      <button onClick={toggle} title="Sauvegarde USB"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors text-xs ${
          open ? 'text-brand bg-brand-50' : 'text-steel-400 hover:text-steel-700 hover:bg-steel-100'
        }`}>
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 01-2-2V4a2 2 0 012-2h14a2 2 0 012 2v2a2 2 0 01-2 2M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
        </svg>
        Sauvegarde USB
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 bg-white border border-steel-200 rounded-xl shadow-lg z-30 w-80 p-4">
            <p className="text-xs font-semibold text-steel-700 mb-1">Sauvegarde sur clé USB</p>
            {!status ? (
              <p className="text-xs text-steel-400 py-2">Chargement...</p>
            ) : (
              <div className="space-y-2 mb-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-steel-500">Dernière sauvegarde</span>
                  <span className="font-medium text-steel-800">
                    {status.last_backup_at ? new Date(status.last_backup_at).toLocaleString('fr-FR') : 'Jamais'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-steel-500">Clé USB détectée</span>
                  <span className={`font-medium ${status.drive_detected ? 'text-brand' : 'text-red-500'}`}>
                    {status.drive_detected ? 'Oui' : 'Non'}
                  </span>
                </div>
              </div>
            )}
            {error && <p className="text-red-500 text-[11px] mb-2">{error}</p>}
            <button onClick={runNow} disabled={running}
              className="w-full py-2 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors">
              {running ? 'Sauvegarde en cours...' : 'Sauvegarder maintenant'}
            </button>
            <p className="text-[11px] text-steel-400 mt-3">
              Branchez la clé USB marquée pour ScolaDesk (fichier <code>.scoladesk_backup</code> à sa racine). Sauvegarde automatique quotidienne à partir de 17h.
            </p>
          </div>
        </>
      )}
    </div>
  )
}

export default function Layout({ schoolInfo }) {
  const { user, logout, hasPermission, idleWarning, stayLoggedIn } = useAuth()
  const [actualStudents, setActualStudents] = useState(0)
  const [licenseToast, setLicenseToast] = useState('')

  useEffect(() => {
    api.get('/api/grades/dashboard/stats').then(res => {
      setActualStudents(res.data.total_students || 0)
    }).catch(() => {})
  }, [])

  // Fires from api.js on ANY blocked write, anywhere in the app -- not
  // just pages with their own error handling (owner report 2026-07-18:
  // expulsion/transfert/sanction just spun and died silently). One
  // global toast covers every current and future mutating action.
  useEffect(() => {
    const handler = (e) => {
      setLicenseToast(e.detail || 'Action bloquée — licence non active.')
      setTimeout(() => setLicenseToast(''), 5000)
    }
    window.addEventListener('scola:license-blocked', handler)
    return () => window.removeEventListener('scola:license-blocked', handler)
  }, [])

  const isPro = (schoolInfo?.tier || '').toUpperCase() === 'PRO'
  const visibleGroups = NAV_GROUPS.map(group => ({
    ...group,
    items: group.items.filter(item => {
      // Tier gate: PRO-only items disappear entirely on STANDARD installs
      if (item.proOnly && !isPro) return false
      if (!item.perm) return true
      if (item.perm === 'admin') return user?.role === 'admin'
      return hasPermission(item.perm)
    }),
  })).filter(group => group.items.length > 0)

  return (
    <div className="flex h-screen overflow-hidden print:h-auto print:overflow-visible">
      {/* Sidebar */}
      <aside className="w-56 bg-steel-800 flex flex-col shrink-0 print:hidden">
        <div className="p-4 border-b border-steel-700">
          <div className="flex items-center gap-2.5">
            <img src="/favicon-32x32.png" alt="ScolaDesk" className="w-9 h-9 rounded-xl" />
            <span className="text-steel-200 font-semibold text-sm">ScolaDesk</span>
          </div>
        </div>

        <nav className="flex-1 p-2 space-y-3 overflow-y-auto">
          {visibleGroups.map((group, gi) => (
            <div key={gi} className="space-y-0.5">
              {group.label && (
                <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-steel-500 uppercase tracking-wide">{group.label}</p>
              )}
              {group.items.map(item => (
                <NavLink key={item.to} to={item.to} end={item.end || item.to === '/dashboard' || item.to === '/grades'}
                  className={({ isActive }) => `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive ? 'bg-steel-700/50 text-steel-200' : 'text-steel-400 hover:text-steel-200 hover:bg-steel-700/30'
                  }`}>
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
                  </svg>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="p-2 border-t border-steel-700">
          {user?.role === 'admin' && (
            <>
              <NavLink to={SYNC_ITEM.to}
                className={({ isActive }) => `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-steel-700/50 text-steel-200' : 'text-steel-400 hover:text-steel-200 hover:bg-steel-700/30'
                }`}>
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={SYNC_ITEM.icon} />
                </svg>
                {SYNC_ITEM.label}
              </NavLink>
              <NavLink to={FIN_ANNEE_ITEM.to}
                className={({ isActive }) => `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-steel-700/50 text-steel-200' : 'text-steel-400 hover:text-steel-200 hover:bg-steel-700/30'
                }`}>
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={FIN_ANNEE_ITEM.icon} />
                </svg>
                {FIN_ANNEE_ITEM.label}
              </NavLink>
              <NavLink to={SETTINGS_ITEM.to}
                className={({ isActive }) => `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-steel-700/50 text-steel-200' : 'text-steel-400 hover:text-steel-200 hover:bg-steel-700/30'
                }`}>
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={SETTINGS_ITEM.icon} />
                </svg>
                {SETTINGS_ITEM.label}
              </NavLink>
            </>
          )}
          <div className="px-3 py-2 mb-1">
            <p className="text-steel-300 text-xs font-medium truncate">{user?.fullName}</p>
            <p className="text-steel-500 text-[10px]">{user?.roleLabel}</p>
          </div>
          <button onClick={logout}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-steel-400 hover:text-steel-200 hover:bg-steel-700/30 text-sm w-full transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Idle warning modal */}
      {idleWarning && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-80 text-center">
            <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-steel-900 mb-1">Session inactive</h2>
            <p className="text-sm text-steel-500 mb-5">Vous serez déconnecté dans 5 minutes en raison d'inactivité.</p>
            <div className="flex gap-3">
              <button onClick={logout} className="flex-1 py-2.5 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50 transition-colors">
                Déconnexion
              </button>
              <button onClick={stayLoggedIn} className="flex-1 py-2.5 bg-brand hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors">
                Rester connecté
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden print:overflow-visible print:h-auto">
        {/* Read-only banner — persistent, no dismiss. Covers two distinct
            server-side triggers (requireActiveLicense.js) that both mean
            the same thing to the user: writes are blocked until a key is
            entered in Paramètres > Licence. One banner, not two, so a
            renewal doesn't show both "new key issued" AND "read-only"
            with different wording for the same lockout. */}
        {(schoolInfo?.license_status === 'expired' || schoolInfo?.reactivation_needed) && (
          <div className="flex items-center justify-between px-4 py-2 bg-red-600 text-white text-sm shrink-0 print:hidden">
            <span className="font-medium">
              {schoolInfo?.license_status === 'expired'
                ? 'Licence expirée — mode lecture seule. Les ajouts et modifications sont désactivés.'
                : 'Nouvelle clé de licence requise — mode lecture seule. Les ajouts et modifications sont désactivés.'}
            </span>
            {user?.role === 'admin' && (
              <Link to="/settings/license" className="underline hover:no-underline shrink-0 ml-3">
                {schoolInfo?.license_status === 'expired' ? 'Renouveler →' : 'Entrer la nouvelle clé →'}
              </Link>
            )}
          </div>
        )}

        {/* License-expiry advance warning, admin-only, dismissible */}
        {user?.role === 'admin' && <div className="print:hidden"><LicenseExpiryBanner expiry={schoolInfo?.expiry} /></div>}

        {/* Promotion countdown/redirect banner, admin-only, dismissible */}
        {user?.role === 'admin' && <div className="print:hidden"><PromotionBanner thresholdDate={schoolInfo?.promotion_available_date} alreadyDone={schoolInfo?.promotion_already_done} /></div>}

        {/* Top bar */}
        <header className="h-12 bg-white border-b border-steel-200 flex items-center justify-between px-6 shrink-0 print:hidden">
          <div className="flex items-center gap-3">
            <span className="text-sm text-steel-800 font-semibold">{schoolInfo?.school_name || ''}</span>
            {schoolInfo?.academic_year_label && (
              <span className="px-2 py-0.5 rounded bg-steel-100 text-steel-600 text-xs font-medium">{schoolInfo.academic_year_label}</span>
            )}
            {schoolInfo?.tier && (
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
                schoolInfo.tier === 'PRO' ? 'bg-brand/10 text-brand' : 'bg-steel-100 text-steel-600'
              }`}>{schoolInfo.tier}</span>
            )}
            {schoolInfo?.features?.length > 0 && (
              <span className="text-xs text-steel-400">{schoolInfo.features.length} module(s)</span>
            )}
            <StudentCount actual={actualStudents} allowed={schoolInfo?.allowed_students} />
          </div>
          <div className="flex items-center gap-1">
            {user?.role === 'admin' && <BackupPanel />}
            <NetworkPanel />
            <button
              onClick={() => window.location.reload()}
              title="Actualiser"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-steel-400 hover:text-steel-700 hover:bg-steel-100 rounded-lg transition-colors text-xs"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Actualiser
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6 bg-steel-50 print:overflow-visible print:h-auto print:p-0 print:bg-white">
          <Outlet />
        </main>
      </div>

      {/* Global toast — any blocked write, anywhere (see the listener above) */}
      {licenseToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 bg-red-600 text-white text-sm rounded-lg shadow-lg">
          <span>{licenseToast}</span>
          {user?.role === 'admin' && (
            <Link to="/settings/license" className="underline hover:no-underline font-medium shrink-0">
              Paramètres &gt; Licence
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
