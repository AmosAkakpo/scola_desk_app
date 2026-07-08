import { useState, useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import api from '../utils/api.js'

const NAV_GROUPS = [
  {
    label: null,
    items: [
      { to: '/dashboard', label: 'Tableau de bord', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', perm: null },
    ],
  },
  {
    label: 'Gestion académique',
    items: [
      { to: '/students', label: 'Élèves', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z', perm: 'students.view' },
      { to: '/teachers', label: 'Enseignants', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z', perm: 'students.view' },
      { to: '/classrooms', label: 'Classes', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4', perm: 'students.view' },
      { to: '/timetable', label: 'Emploi du temps', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', perm: 'students.view' },
      { to: '/finance/attendance', label: 'Présences', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', perm: 'attendance.view' },
      { to: '/grades', label: 'Notes', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 5h6m-6 4h4', perm: 'grades.view' },
      { to: '/report-cards', label: 'Bulletins', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', perm: 'reports.view' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/finance', label: 'Tableau de bord', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', perm: 'finance.view', end: true },
      { to: '/finance/tuition', label: 'Paiements scolarité', icon: 'M3 10h18M7 15h2m2 0h6M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z', perm: 'finance.view' },
{ to: '/finance/salaries', label: 'Salaires', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', perm: 'finance.view' },
      { to: '/finance/expenses', label: 'Dépenses', icon: 'M20 12H4M20 12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4a2 2 0 012-2M20 12V8a2 2 0 00-2-2H6a2 2 0 00-2 2v4', perm: 'finance.view' },
      { to: '/finance/report', label: 'Rapport financier', icon: 'M9 17v-6m4 6V7m4 10v-3M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z', perm: 'finance.view' },
      { to: '/finance/subscription', label: 'Mon abonnement', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', perm: null },
      { to: '/finance/settings', label: 'Frais & catégories', icon: 'M9 7h6m0 10v-3m-3 3v-6m-3 6v-9m12 9V7a2 2 0 00-2-2H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2z', perm: 'finance.edit' },
    ],
  },
]

const SETTINGS_ITEM = { to: '/settings', label: 'Paramètres', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z', perm: 'admin' }

function StudentCount({ actual = 0, allowed = 0 }) {
  if (!allowed) return null
  const over = actual > allowed
  return (
    <span className={`text-xs font-medium ${over ? 'text-red-600' : 'text-brand'}`}>
      {actual} / {allowed} élèves
    </span>
  )
}

export default function Layout({ schoolInfo }) {
  const { user, logout, hasPermission, idleWarning, stayLoggedIn } = useAuth()
  const [actualStudents, setActualStudents] = useState(0)

  useEffect(() => {
    api.get('/api/grades/dashboard/stats').then(res => {
      setActualStudents(res.data.total_students || 0)
    }).catch(() => {})
  }, [])

  const visibleGroups = NAV_GROUPS.map(group => ({
    ...group,
    items: group.items.filter(item => {
      if (!item.perm) return true
      if (item.perm === 'admin') return user?.role === 'admin'
      return hasPermission(item.perm)
    }),
  })).filter(group => group.items.length > 0)

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-steel-800 flex flex-col shrink-0">
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
            <NavLink to={SETTINGS_ITEM.to}
              className={({ isActive }) => `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive ? 'bg-steel-700/50 text-steel-200' : 'text-steel-400 hover:text-steel-200 hover:bg-steel-700/30'
              }`}>
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={SETTINGS_ITEM.icon} />
              </svg>
              {SETTINGS_ITEM.label}
            </NavLink>
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
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-12 bg-white border-b border-steel-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-sm text-steel-800 font-semibold">{schoolInfo?.school_name || ''}</span>
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
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6 bg-steel-50">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
