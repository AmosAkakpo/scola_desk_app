import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../utils/api'

const pad = n => String(n).padStart(2, '0')

// Local-timezone date helpers (toISOString would shift the day around midnight)
function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

function formatXOF(n) {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' F'
}

// Months within [startDate, today] inclusive -- bounded by the academic
// year like every other month picker in Finance, instead of a fixed
// rolling window. maxDate stays "today": attendance can't be logged for a
// day that hasn't happened yet, but there's no reason to cap how far back
// into the current year you can go (owner report 2026-07-26: the old
// hardcoded ±30 days made it impossible to fix/backfill anything older).
function getMonthOptions(startDate) {
  const opts = []
  const now = new Date()
  const start = startDate ? new Date(startDate + 'T00:00:00') : new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const d = new Date(start.getFullYear(), start.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth(), 1)
  while (d <= end) {
    const val = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
    const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    opts.push({ value: val, label: label.charAt(0).toUpperCase() + label.slice(1) })
    d.setMonth(d.getMonth() + 1)
  }
  return opts.reverse()
}

export default function AttendancePage() {
  const [tab, setTab] = useState('daily')
  const [yearStart, setYearStart] = useState(null)

  useEffect(() => {
    api.get('/api/finance/academic-years').then(res => {
      const active = (res.data.years || []).find(y => y.is_active)
      setYearStart(active?.start_date || null)
    }).catch(() => {})
  }, [])

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-medium text-steel-900">Présences</h1>
        <p className="text-sm text-steel-500 mt-0.5">Feuille de présence des enseignants</p>
      </div>

      <div className="flex gap-1 border-b border-steel-200 mb-6">
        {[
          { key: 'daily', label: 'Feuille du jour' },
          { key: 'month', label: 'Résumé du mois' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-brand text-brand' : 'border-transparent text-steel-500 hover:text-steel-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'daily' && <DailySheet yearStart={yearStart} />}
      {tab === 'month' && <MonthSummary yearStart={yearStart} />}
    </div>
  )
}

function DailySheet({ yearStart }) {
  const [date, setDate] = useState(localToday())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [edits, setEdits] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [showAddHours, setShowAddHours] = useState(false)
  const savedEdits = useRef({})

  const maxDate = localToday()
  const minDate = yearStart || shiftDate(maxDate, -365)
  const canGoPrev = date > minDate
  const canGoNext = date < maxDate

  function setDateGuarded(d) {
    if (!d || d > maxDate || d < minDate) return
    setDate(d)
    setSaved(false)
  }

  function load(d) {
    setLoading(true)
    setError('')
    api.get(`/api/attendance?date=${d}`).then(res => {
      setData(res.data)
      const init = {}
      res.data.teachers.forEach(t => {
        if (t.log) {
          init[t.id] = {
            status: t.log.status,
            hours_credited: String(t.log.hours_credited ?? t.hours_scheduled),
            notes: t.log.notes || '',
          }
        }
      })
      setEdits(init)
      savedEdits.current = init
      setLoading(false)
    }).catch(() => { setError('Impossible de charger les données'); setLoading(false) })
  }

  useEffect(() => { load(date) }, [date])

  function setStatus(teacherId, status, hoursScheduled) {
    setEdits(prev => {
      const existing = prev[teacherId] || {}
      return {
        ...prev,
        [teacherId]: {
          status,
          hours_credited: existing.hours_credited !== undefined ? existing.hours_credited : String(hoursScheduled || 0),
          notes: existing.notes || '',
        },
      }
    })
    setSaved(false)
  }

  function setField(teacherId, field, value) {
    setEdits(prev => ({ ...prev, [teacherId]: { ...(prev[teacherId] || {}), [field]: value } }))
    setSaved(false)
  }

  function markAllPresent() {
    const next = {}
    data.teachers.filter(t => t.has_slots).forEach(t => {
      next[t.id] = {
        status: 'present',
        hours_credited: String(t.hours_scheduled || 0),
        notes: edits[t.id]?.notes || '',
      }
    })
    setEdits(prev => ({ ...prev, ...next }))
    setSaved(false)
  }

  async function save() {
    const entries = Object.entries(edits)
      .filter(([, e]) => e.status)
      .map(([teacherId, e]) => ({
        teacher_id: parseInt(teacherId),
        log_date: date,
        status: e.status,
        hours_credited: parseFloat(e.hours_credited) || 0,
        notes: e.notes || null,
      }))
    if (entries.length === 0) { setError('Aucune entrée à enregistrer'); return }
    setSaving(true); setError('')
    try {
      await api.post('/api/attendance', { entries })
      setSaved(true)
      load(date)
    } catch {
      setError("Erreur lors de l'enregistrement")
    }
    setSaving(false)
  }

  const withSlots = data?.teachers.filter(t => t.has_slots) || []
  const withoutSlots = data?.teachers.filter(t => !t.has_slots) || []
  const recordedCount = Object.values(edits).filter(e => e.status).length
  const isDirty = JSON.stringify(edits) !== JSON.stringify(savedEdits.current)

  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-1.5">
          <button onClick={() => setDateGuarded(shiftDate(date, -1))} disabled={!canGoPrev}
            title="Jour précédent"
            className="w-8 h-8 flex items-center justify-center border border-steel-200 rounded-lg text-steel-600 hover:bg-steel-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <input
            type="date"
            value={date}
            min={minDate}
            max={maxDate}
            onChange={e => setDateGuarded(e.target.value)}
            className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand"
          />
          <button onClick={() => setDateGuarded(shiftDate(date, 1))} disabled={!canGoNext}
            title="Jour suivant"
            className="w-8 h-8 flex items-center justify-center border border-steel-200 rounded-lg text-steel-600 hover:bg-steel-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
          <span className="text-sm text-steel-500 ml-2 capitalize">{dateLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAddHours(true)}
            className="px-3 py-2 border border-steel-200 text-steel-700 hover:bg-steel-50 rounded-lg text-sm font-medium transition-colors">
            + Ajouter des heures
          </button>
          {withSlots.length > 0 && (
            <button onClick={markAllPresent}
              className="px-3 py-2 border border-steel-200 text-steel-700 hover:bg-steel-50 rounded-lg text-sm font-medium transition-colors">
              Tous présents
            </button>
          )}
          <button onClick={save} disabled={saving || recordedCount === 0 || !isDirty}
            className="px-4 py-2 bg-brand hover:bg-brand-600 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors">
            {saving ? 'Enregistrement...' : isDirty ? `Enregistrer (${recordedCount})` : 'Enregistré'}
          </button>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
      {saved && <p className="text-brand text-sm mb-4">Présences enregistrées.</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {withSlots.length > 0 && (
            <div className="bg-white rounded-xl border border-steel-200 overflow-hidden mb-4">
              <div className="px-4 py-3 border-b border-steel-200 bg-steel-50">
                <h2 className="text-sm font-medium text-steel-700">
                  Enseignants avec cours ce jour <span className="text-steel-400 font-normal">({withSlots.length})</span>
                </h2>
              </div>
              <TeacherTable teachers={withSlots} edits={edits} onStatus={setStatus} onField={setField} />
            </div>
          )}

          {withoutSlots.length > 0 && (
            <div className="bg-white rounded-xl border border-steel-200 overflow-hidden opacity-60">
              <div className="px-4 py-3 border-b border-steel-200 bg-steel-50">
                <h2 className="text-sm font-medium text-steel-500">
                  Sans cours ce jour <span className="font-normal">({withoutSlots.length})</span>
                </h2>
              </div>
              <TeacherTable teachers={withoutSlots} edits={edits} onStatus={setStatus} onField={setField} />
            </div>
          )}

          {data?.teachers.length === 0 && (
            <p className="text-steel-400 text-sm text-center py-12">Aucun enseignant actif trouvé</p>
          )}
        </>
      )}

      {showAddHours && (
        <AddHoursModal
          teachers={data?.teachers || []}
          defaultDate={date}
          minDate={minDate}
          maxDate={maxDate}
          onClose={() => setShowAddHours(false)}
          onAdded={() => { setShowAddHours(false); load(date) }}
        />
      )}
    </div>
  )
}

function AddHoursModal({ teachers, defaultDate, minDate, maxDate, onClose, onAdded }) {
  const [teacherId, setTeacherId] = useState('')
  const [logDate, setLogDate] = useState(defaultDate)
  const [hours, setHours] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    const num = parseFloat(hours)
    if (!teacherId || !logDate || !num || num <= 0) { setError('Enseignant, date et heures requis'); return }
    setSaving(true); setError('')
    try {
      await api.post('/api/attendance/add-hours', {
        teacher_id: parseInt(teacherId),
        log_date: logDate,
        hours: num,
        notes: notes.trim() || null,
      })
      onAdded()
    } catch (err) {
      setError(err.response?.data?.message || "Erreur lors de l'enregistrement")
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="p-5 border-b border-steel-200">
          <h2 className="text-lg font-medium text-steel-900">Ajouter des heures</h2>
          <p className="text-xs text-steel-500 mt-1">Heures supplémentaires ou remplacement — s'ajoutent aux heures déjà créditées du jour.</p>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div>
            <label className="block text-xs text-steel-500 mb-1">Enseignant *</label>
            <select required value={teacherId} onChange={e => setTeacherId(e.target.value)}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
              <option value="">— Sélectionner —</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-steel-500 mb-1">Date *</label>
              <input type="date" required value={logDate} min={minDate} max={maxDate}
                onChange={e => setLogDate(e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
            </div>
            <div>
              <label className="block text-xs text-steel-500 mb-1">Heures *</label>
              <input type="number" required min="0.5" max="12" step="0.5" value={hours}
                onChange={e => setHours(e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand"
                placeholder="Ex: 3" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-steel-500 mb-1">Note</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand"
              placeholder="Ex: Remplacement de M. Kouassi" />
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50 transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
              {saving ? 'Enregistrement...' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function MonthSummary({ yearStart }) {
  const monthOptions = getMonthOptions(yearStart)
  const [month, setMonth] = useState(monthOptions[0].value)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  // Once the academic year's real start date loads, the option list may
  // grow further back -- if the still-default first-render month isn't in
  // range anymore just leave it (it's still a valid, real month), only
  // reset if somehow it fell out of range entirely.
  useEffect(() => {
    if (monthOptions.length && !monthOptions.some(o => o.value === month)) setMonth(monthOptions[0].value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearStart])

  useEffect(() => {
    setLoading(true)
    api.get(`/api/attendance/monthly-summary?pay_period=${month}`).then(res => {
      setData(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [month])

  const teachers = data?.teachers || []

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <select value={month} onChange={e => setMonth(e.target.value)}
          className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
          {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button onClick={() => navigate('/finance/salaries')}
          className="px-3 py-2 bg-brand hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors">
          Aller aux salaires →
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-steel-200 bg-steel-50">
                <th className="text-left px-4 py-2.5 text-steel-500 font-medium">Enseignant</th>
                <th className="text-center px-4 py-2.5 text-steel-500 font-medium">J. présents</th>
                <th className="text-center px-4 py-2.5 text-steel-500 font-medium">J. absents</th>
                <th className="text-right px-4 py-2.5 text-steel-500 font-medium">H. prévues</th>
                <th className="text-right px-4 py-2.5 text-steel-500 font-medium">H. réelles</th>
                <th className="text-right px-4 py-2.5 text-steel-500 font-medium">Taux</th>
                <th className="text-right px-4 py-2.5 text-steel-500 font-medium">Salaire versé</th>
              </tr>
            </thead>
            <tbody>
              {teachers.map(t => (
                <tr key={t.id} className="border-b border-steel-50 hover:bg-steel-50/50">
                  <td className="px-4 py-2.5">
                    <p className="text-steel-800 font-medium">{t.full_name}</p>
                    {t.matricule && <p className="text-[10px] text-steel-400 font-mono">{t.matricule}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-center text-steel-700">{t.days_present}</td>
                  <td className="px-4 py-2.5 text-center">
                    {t.days_absent > 0 ? <span className="text-red-600 font-medium">{t.days_absent}</span> : <span className="text-steel-300">0</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-steel-500 text-xs">{t.hours_prevues > 0 ? `${t.hours_prevues}h` : '—'}</td>
                  <td className="px-4 py-2.5 text-right text-steel-700">{t.hours_reelles}h</td>
                  <td className="px-4 py-2.5 text-right">
                    {t.hours_prevues > 0 ? (
                      <span className={`font-medium ${t.taux >= 90 ? 'text-brand' : t.taux >= 70 ? 'text-orange-600' : 'text-red-600'}`}>{t.taux}%</span>
                    ) : <span className="text-steel-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {t.total_paid > 0 ? (
                      <span className="text-brand font-medium">{formatXOF(t.total_paid)}</span>
                    ) : <span className="text-steel-300 text-xs">Non payé</span>}
                  </td>
                </tr>
              ))}
              {teachers.length === 0 && (
                <tr><td colSpan="7" className="px-4 py-8 text-center text-steel-400 text-sm">Aucune donnée pour ce mois</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function TeacherTable({ teachers, edits, onStatus, onField }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-steel-100">
          <th className="text-left px-4 py-2.5 text-steel-500 font-medium text-xs">Enseignant</th>
          <th className="text-center px-4 py-2.5 text-steel-500 font-medium text-xs w-24">Prévu</th>
          <th className="text-center px-4 py-2.5 text-steel-500 font-medium text-xs w-44">Statut</th>
          <th className="text-center px-4 py-2.5 text-steel-500 font-medium text-xs w-28">H. créditées</th>
          <th className="text-left px-4 py-2.5 text-steel-500 font-medium text-xs">Notes</th>
        </tr>
      </thead>
      <tbody>
        {teachers.map(t => {
          const edit = edits[t.id]
          const status = edit?.status || null
          return (
            <tr key={t.id} className={`border-b border-steel-50 transition-colors ${status === 'absent' ? 'bg-red-50/40' : status === 'present' ? 'bg-brand-50/20' : ''}`}>
              <td className="px-4 py-3">
                <p className="font-medium text-steel-800">{t.full_name}</p>
                {t.matricule && <p className="text-[10px] text-steel-400">{t.matricule}</p>}
              </td>
              <td className="px-4 py-3 text-center text-steel-500 text-xs">
                {t.hours_scheduled > 0 ? `${t.hours_scheduled}h` : '—'}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1 justify-center">
                  <button
                    onClick={() => onStatus(t.id, 'present', t.hours_scheduled)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${status === 'present' ? 'bg-brand text-white border-brand' : 'bg-white text-steel-500 border-steel-200 hover:border-brand hover:text-brand'}`}>
                    Présent
                  </button>
                  <button
                    onClick={() => onStatus(t.id, 'absent', t.hours_scheduled)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${status === 'absent' ? 'bg-red-500 text-white border-red-500' : 'bg-white text-steel-500 border-steel-200 hover:border-red-400 hover:text-red-500'}`}>
                    Absent
                  </button>
                </div>
              </td>
              <td className="px-4 py-3 text-center">
                {status === 'present' ? (
                  <input
                    type="number" min="0" max="12" step="0.5"
                    value={edit?.hours_credited ?? t.hours_scheduled}
                    onChange={e => onField(t.id, 'hours_credited', e.target.value)}
                    className="w-20 px-2 py-1 border border-steel-200 rounded text-sm text-center focus:outline-none focus:border-brand"
                  />
                ) : (
                  <span className="text-steel-300 text-xs">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                <input
                  type="text"
                  value={edit?.notes || ''}
                  onChange={e => onField(t.id, 'notes', e.target.value)}
                  placeholder="Optionnel"
                  className="w-full px-2 py-1 border border-steel-200 rounded text-xs focus:outline-none focus:border-brand bg-transparent"
                />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
