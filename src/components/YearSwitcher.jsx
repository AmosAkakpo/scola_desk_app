import { useState, useEffect } from 'react'
import api from '../utils/api'

// Small dropdown for viewing a past academic year's finance data read-only.
// Defaults to the current year (yearId=null/undefined means "current" —
// callers pass null on mount and only send academic_year_id to the API
// once the admin actually picks a non-current year, matching the backend's
// own "no override = current year" default).
export default function YearSwitcher({ yearId, onChange }) {
  const [years, setYears] = useState([])

  useEffect(() => {
    api.get('/api/finance/academic-years').then(res => setYears(res.data.years || []))
  }, [])

  if (years.length <= 1) return null

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-steel-500">Année :</label>
      <select value={yearId || ''} onChange={e => onChange(e.target.value || null)}
        className="px-3 py-1.5 border border-steel-200 rounded-lg text-xs bg-white focus:outline-none focus:border-brand">
        {years.map(y => (
          <option key={y.id} value={y.is_active ? '' : y.id}>
            {y.label}{y.is_active ? ' (actuelle)' : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
