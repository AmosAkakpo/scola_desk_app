import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../utils/api'

function formatXOF(n) {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' F'
}

function KPI({ label, value, color, sub }) {
  return (
    <div className="bg-white rounded-xl border border-steel-200 p-4">
      <p className="text-xs text-steel-500 mb-1">{label}</p>
      <p className={`text-lg font-semibold ${color || 'text-steel-900'}`}>{value}</p>
      {sub && <p className="text-[10px] text-steel-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function FinanceDashboardPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/api/finance/dashboard').then(res => {
      setData(res.data)
      setLoading(false)
    }).catch(err => {
      setError(err.response?.data?.message || err.message || 'Erreur inconnue')
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
  if (!data) return <p className="text-red-500 text-sm text-center py-12">Erreur de chargement{error ? ` — ${error}` : ''}</p>

  const collectionPct = data.total_due > 0 ? Math.round((data.total_collected / data.total_due) * 100) : 0

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-steel-900">Finance</h1>
          <p className="text-sm text-steel-500 mt-0.5">Vue d'ensemble financière</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/finance/tuition')} className="px-3 py-2 bg-brand hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors">Paiements scolarité</button>
          <button onClick={() => navigate('/finance/expenses')} className="px-3 py-2 bg-white border border-steel-200 text-steel-700 hover:bg-steel-50 rounded-lg text-sm font-medium transition-colors">Dépenses</button>
<button onClick={() => navigate('/finance/subscription')} className="px-3 py-2 bg-white border border-steel-200 text-steel-700 hover:bg-steel-50 rounded-lg text-sm font-medium transition-colors">Mon abonnement</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPI label="Total attendu" value={formatXOF(data.total_due)} />
        <KPI label="Total encaissé" value={formatXOF(data.total_collected)} color="text-brand" sub={`${collectionPct}% collecté`} />
        <KPI label="Reste à percevoir" value={formatXOF(data.total_outstanding)} color={data.total_outstanding > 0 ? 'text-orange-600' : 'text-brand'} />
        <KPI label="Élèves non soldés" value={data.overdue_count} color={data.overdue_count > 0 ? 'text-red-600' : 'text-steel-900'} sub={`sur ${data.total_students} élèves`} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPI label="Revenus divers" value={formatXOF(data.total_other_revenues || 0)} color="text-brand" />
        <KPI label="Total dépenses" value={formatXOF(data.total_expenses)} color="text-red-600" />
        <KPI label="Salaires versés" value={formatXOF(data.total_salaries)} color="text-red-600" />
        <KPI label="Solde net" value={formatXOF(data.net_balance)} color={data.net_balance >= 0 ? 'text-brand' : 'text-red-600'} />
      </div>

      {/* Collection progress */}
      <div className="bg-white rounded-xl border border-steel-200 p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-steel-700">Taux de recouvrement</span>
          <span className="text-sm font-semibold text-brand">{collectionPct}%</span>
        </div>
        <div className="w-full h-2.5 bg-steel-100 rounded-full">
          <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${Math.min(collectionPct, 100)}%` }} />
        </div>
      </div>

      {/* Revenue vs Expenses chart (simple bars) */}
      {(data.monthly_revenue.length > 0 || data.monthly_expenses.length > 0) && (
        <div className="bg-white rounded-xl border border-steel-200 p-4 mb-6">
          <h2 className="text-sm font-medium text-steel-700 mb-4">Revenus vs Dépenses par mois</h2>
          <MonthlyChart revenue={data.monthly_revenue} expenses={data.monthly_expenses} />
        </div>
      )}

      {/* Per-class table */}
      {data.class_stats.length > 0 && (
        <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-steel-200 bg-steel-50">
            <h2 className="text-sm font-medium text-steel-700">Recouvrement par classe</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-steel-200">
                <th className="text-left px-4 py-2.5 text-steel-500 font-medium">Classe</th>
                <th className="text-center px-4 py-2.5 text-steel-500 font-medium">Élèves</th>
                <th className="text-right px-4 py-2.5 text-steel-500 font-medium">Encaissé</th>
                <th className="text-right px-4 py-2.5 text-steel-500 font-medium">Taux</th>
              </tr>
            </thead>
            <tbody>
              {data.class_stats.map(c => {
                const pct = c.student_count > 0 && data.total_due > 0
                  ? Math.round((c.collected / (data.total_due / data.total_students * c.student_count)) * 100)
                  : 0
                return (
                  <tr key={c.id} className="border-b border-steel-50">
                    <td className="px-4 py-2 text-steel-800 font-medium">{c.label}</td>
                    <td className="px-4 py-2 text-center text-steel-600">{c.student_count}</td>
                    <td className="px-4 py-2 text-right text-steel-800">{formatXOF(c.collected)}</td>
                    <td className="px-4 py-2 text-right">
                      <span className={`font-medium ${pct >= 75 ? 'text-brand' : pct >= 50 ? 'text-orange-600' : 'text-red-600'}`}>{pct}%</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function MonthlyChart({ revenue, expenses }) {
  const months = new Set([...revenue.map(r => r.month), ...expenses.map(e => e.month)])
  const sorted = [...months].sort()
  const revMap = {}; revenue.forEach(r => { revMap[r.month] = r.total })
  const expMap = {}; expenses.forEach(e => { expMap[e.month] = e.total })
  const max = Math.max(...sorted.map(m => Math.max(revMap[m] || 0, expMap[m] || 0)), 1)

  const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

  return (
    <div className="flex items-end gap-2 h-40">
      {sorted.map(m => {
        const rev = revMap[m] || 0
        const exp = expMap[m] || 0
        const revH = (rev / max) * 100
        const expH = (exp / max) * 100
        const monthIdx = parseInt(m.split('-')[1]) - 1
        return (
          <div key={m} className="flex-1 flex flex-col items-center gap-1">
            <div className="flex gap-0.5 items-end h-32 w-full">
              <div className="flex-1 bg-brand/20 rounded-t" style={{ height: `${revH}%` }} title={`Revenus: ${formatXOF(rev)}`} />
              <div className="flex-1 bg-red-200 rounded-t" style={{ height: `${expH}%` }} title={`Dépenses: ${formatXOF(exp)}`} />
            </div>
            <span className="text-[10px] text-steel-400">{MONTH_LABELS[monthIdx]}</span>
          </div>
        )
      })}
    </div>
  )
}
