import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../utils/api'
import YearSwitcher from '../../components/YearSwitcher'

function formatXOF(n) {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' F'
}

function getMonthOptions() {
  const opts = []
  const now = new Date()
  for (let i = -3; i <= 1; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const val = d.toISOString().slice(0, 7)
    const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    opts.push({ value: val, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }
  return opts
}

export default function SalariesPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [yearId, setYearId] = useState(null) // null = current year
  const navigate = useNavigate()

  const load = useCallback(() => {
    setLoading(true)
    api.get('/api/finance/salaries', { params: { pay_period: month, ...(yearId ? { academic_year_id: yearId } : {}) } }).then(res => {
      setData(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [month, yearId])

  useEffect(() => { load() }, [load])

  function goToTeacher(teacherId) {
    const params = new URLSearchParams({ pay_period: month, ...(yearId ? { academic_year_id: yearId } : {}) })
    navigate(`/finance/salaries/${teacherId}?${params.toString()}`)
  }

  const teachers = data?.teachers || []
  const totalVerse = teachers.reduce((s, t) => s + t.total_paid, 0)
  const totalCalculated = teachers.reduce((s, t) => s + t.calculated_amount, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-steel-900">Salaires</h1>
          <p className="text-sm text-steel-500 mt-0.5">
            {teachers.length} enseignant(s) — {formatXOF(totalVerse)} versés ce mois
          </p>
        </div>
        <YearSwitcher yearId={yearId} onChange={setYearId} />
      </div>

      <div className="flex gap-3 mb-4">
        <select value={month} onChange={e => setMonth(e.target.value)}
          className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
          {getMonthOptions().map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {yearId && <span className="px-3 py-2 bg-amber-50 text-amber-600 rounded-lg text-xs font-medium">Année archivée — lecture seule</span>}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-steel-200 bg-steel-50">
                <th className="text-left px-4 py-2.5 text-steel-500 font-medium">Enseignant</th>
                <th className="text-right px-4 py-2.5 text-steel-500 font-medium">H. prévues</th>
                <th className="text-right px-4 py-2.5 text-steel-500 font-medium">H. réelles</th>
                <th className="text-right px-4 py-2.5 text-steel-500 font-medium">Montant calculé</th>
                <th className="text-right px-4 py-2.5 text-steel-500 font-medium">Total versé</th>
                <th className="text-center px-4 py-2.5 text-steel-500 font-medium w-20"></th>
              </tr>
            </thead>
            <tbody>
              {teachers.map(t => {
                const taux = t.hours_prevues > 0 ? Math.round((t.hours_reelles / t.hours_prevues) * 100) : null
                return (
                  <tr key={t.id} className="border-b border-steel-50 hover:bg-steel-50/50 cursor-pointer"
                    onClick={() => goToTeacher(t.id)}>
                    <td className="px-4 py-2.5">
                      <p className="text-steel-800 font-medium">{t.full_name}</p>
                      {t.matricule && <p className="text-[10px] text-steel-400 font-mono">{t.matricule}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-steel-500 text-xs">
                      {t.hours_prevues > 0 ? `${t.hours_prevues}h` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs">
                      {t.hours_reelles > 0 ? (
                        <span className={taux !== null && taux < 80 ? 'text-orange-600 font-medium' : 'text-steel-700'}>
                          {t.hours_reelles}h
                        </span>
                      ) : <span className="text-steel-300">0h</span>}
                      {taux !== null && <span className="text-steel-400 ml-1">({taux}%)</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-steel-500 text-xs">
                      {t.calculated_amount > 0 ? formatXOF(t.calculated_amount) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium">
                      {t.total_paid > 0 ? (
                        <span className="text-brand">{formatXOF(t.total_paid)}</span>
                      ) : (
                        <span className="text-steel-300">0 F</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => goToTeacher(t.id)}
                        className="px-2.5 py-1 bg-brand hover:bg-brand-600 text-white rounded text-xs font-medium transition-colors"
                      >
                        Voir
                      </button>
                    </td>
                  </tr>
                )
              })}
              {teachers.length === 0 && (
                <tr><td colSpan="6" className="px-4 py-8 text-center text-steel-400 text-sm">Aucun enseignant actif</td></tr>
              )}
            </tbody>
            {teachers.length > 0 && (
              <tfoot>
                <tr className="bg-steel-50 border-t border-steel-200 font-semibold text-sm">
                  <td className="px-4 py-2.5 text-steel-700" colSpan={3}>Total</td>
                  <td className="px-4 py-2.5 text-right text-steel-500">{formatXOF(totalCalculated)}</td>
                  <td className="px-4 py-2.5 text-right text-brand">{formatXOF(totalVerse)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}
