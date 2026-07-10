import { NavLink, Outlet } from 'react-router-dom'

const SUB_NAV = [
  { to: '/settings', label: 'École', end: true },
  { to: '/settings/bulletins', label: 'Notes & bulletins' },
  { to: '/settings/structure', label: 'Structure académique' },
  { to: '/settings/affectations', label: 'Affectations enseignants' },
]

export default function SettingsLayout() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-medium text-steel-900">Paramètres</h1>

      <div className="flex gap-1 border-b border-steel-200">
        {SUB_NAV.map(item => (
          <NavLink key={item.to} to={item.to} end={item.end}
            className={({ isActive }) => `px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
              isActive ? 'border-brand text-brand' : 'border-transparent text-steel-500 hover:text-steel-700'
            }`}>
            {item.label}
          </NavLink>
        ))}
      </div>

      <Outlet />
    </div>
  )
}
