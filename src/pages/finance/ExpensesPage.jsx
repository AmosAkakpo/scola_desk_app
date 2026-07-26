import { useState, useEffect, useCallback } from 'react'
import api from '../../utils/api'
import YearSwitcher from '../../components/YearSwitcher'

function formatXOF(n) {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' F'
}

// Months within [startDate, endDate] inclusive -- same pattern as
// SalariesPage/TeacherSalaryPage, so picking a month with no expenses yet
// just shows an empty list instead of hiding it entirely (owner request
// 2026-07-26: "like in salaire" -- every month of the year is selectable,
// not just the ones that already have entries).
function getMonthOptions(startDate, endDate) {
  if (!startDate || !endDate) return []
  const opts = []
  const d = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')
  while (d <= end) {
    // toISOString() converts to UTC -- in any timezone ahead of UTC (e.g.
    // Bénin, UTC+1) local midnight on the 1st becomes 23:00 the PREVIOUS
    // day in UTC, silently shifting the value back a month while the
    // label (built from the same local date) still read correctly. Build
    // the value from local date parts instead so it matches what's
    // actually stored (owner report 2026-07-26: selecting "Juillet" in the
    // dropdown returned nothing because the value sent was really "06").
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    opts.push({ value: val, label: label.charAt(0).toUpperCase() + label.slice(1) })
    d.setMonth(d.getMonth() + 1)
  }
  return opts
}

export default function ExpensesPage() {
  const [data, setData] = useState(null)
  const [years, setYears] = useState([])
  const [month, setMonth] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [catFilter, setCatFilter] = useState('')
  const [yearId, setYearId] = useState(null) // null = current year

  useEffect(() => {
    api.get('/api/finance/academic-years').then(res => setYears(res.data.years || []))
  }, [])

  const selectedYear = years.find(y => yearId ? y.id === parseInt(yearId) : y.is_active)
  const monthOptions = getMonthOptions(selectedYear?.start_date, selectedYear?.end_date)

  const load = useCallback(() => {
    setLoading(true)
    const params = { month, ...(yearId ? { academic_year_id: yearId } : {}) }
    api.get('/api/finance/expenses', { params }).then(res => {
      setData(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [month, yearId])

  useEffect(() => { load() }, [load])

  // salary rows have row_type='salary' and no category_id; filter 'salaires' matches them
  const expenses = (data?.expenses || []).filter(e => {
    if (!catFilter) return true
    if (catFilter === 'salaires') return e.row_type === 'salary'
    return e.row_type !== 'salary' && e.category_id === parseInt(catFilter)
  })
  const totalAmount = expenses.reduce((s, e) => s + e.amount, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-steel-900">Dépenses</h1>
          <p className="text-sm text-steel-500 mt-0.5">{expenses.length} dépense(s) — {formatXOF(totalAmount)}</p>
        </div>
        <div className="flex items-center gap-3">
          <YearSwitcher yearId={yearId} onChange={setYearId} />
          {yearId ? (
            <span className="px-3 py-2 bg-amber-50 text-amber-600 rounded-lg text-xs font-medium">Année archivée — lecture seule</span>
          ) : (
            <button onClick={() => setShowAdd(true)} className="px-3 py-2 bg-brand hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors">
              + Ajouter
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select value={month} onChange={e => setMonth(e.target.value)}
          className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
          <option value="">Tous les mois</option>
          {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
          <option value="">Toutes les catégories</option>
          <option value="salaires">Salaires</option>
          {(data?.categories || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-steel-200 bg-steel-50">
                <th className="text-left px-4 py-2.5 text-steel-500 font-medium">Date</th>
                <th className="text-left px-4 py-2.5 text-steel-500 font-medium">Catégorie</th>
                <th className="text-left px-4 py-2.5 text-steel-500 font-medium">Description</th>
                <th className="text-right px-4 py-2.5 text-steel-500 font-medium">Montant</th>
                <th className="text-left px-4 py-2.5 text-steel-500 font-medium">Réf.</th>
                <th className="text-left px-4 py-2.5 text-steel-500 font-medium">Enregistré par</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map(e => (
                <tr key={`${e.row_type}-${e.id}`} className="border-b border-steel-50">
                  <td className="px-4 py-2.5 text-steel-600">
                    {e.date_col ? new Date(e.date_col).toLocaleDateString('fr-FR') : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${e.row_type === 'salary' ? 'bg-orange-50 text-orange-600' : 'bg-steel-100 text-steel-600'}`}>
                      {e.category_name || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-steel-800">
                    {e.description || '—'}
                    {e.pay_period && <span className="text-steel-400 text-xs ml-1">({e.pay_period})</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-red-600 font-medium">{formatXOF(e.amount)}</td>
                  <td className="px-4 py-2.5 text-steel-400 text-xs">{e.receipt_ref || '—'}</td>
                  <td className="px-4 py-2.5 text-steel-500 text-xs">{e.recorded_by_name || '—'}</td>
                  <td className="px-2 py-2.5">
                    {e.row_type !== 'salary' && !yearId && (
                      <button onClick={() => handleDelete(e.id)} className="text-steel-400 hover:text-red-500 text-xs">×</button>
                    )}
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr><td colSpan="7" className="px-4 py-8 text-center text-steel-400 text-sm">Aucune dépense enregistrée</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <AddExpenseModal categories={data?.categories || []} onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); load() }} />
      )}
    </div>
  )

  async function handleDelete(id) {
    if (!confirm('Supprimer cette dépense ?')) return
    await api.delete(`/api/finance/expenses/${id}`)
    load()
  }
}

function AddExpenseModal({ categories, onClose, onAdded }) {
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10))
  const [receiptRef, setReceiptRef] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!categoryId || !amount) return
    setSaving(true)
    try {
      await api.post('/api/finance/expenses', {
        category_id: parseInt(categoryId), description: description || null,
        amount: parseFloat(amount), expense_date: expenseDate, receipt_ref: receiptRef || null,
      })
      onAdded()
    } catch { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="p-5 border-b border-steel-200">
          <h2 className="text-lg font-medium text-steel-900">Nouvelle dépense</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div>
            <label className="block text-xs text-steel-500 mb-1">Catégorie *</label>
            <select required value={categoryId} onChange={e => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
              <option value="">— Sélectionner —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-steel-500 mb-1">Description</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" placeholder="Ex: Achat de cahiers" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-steel-500 mb-1">Montant *</label>
              <input type="number" min="1" required value={amount} onChange={e => setAmount(e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
            </div>
            <div>
              <label className="block text-xs text-steel-500 mb-1">Date</label>
              <input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-steel-500 mb-1">N° reçu / référence</label>
            <input type="text" value={receiptRef} onChange={e => setReceiptRef(e.target.value)}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50 transition-colors">Annuler</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
