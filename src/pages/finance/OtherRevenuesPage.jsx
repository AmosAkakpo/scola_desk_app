import { useState, useEffect } from 'react'
import api from '../../utils/api'

function formatXOF(n) {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' F'
}

export default function OtherRevenuesPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [catFilter, setCatFilter] = useState('')
  const [monthFilter, setMonthFilter] = useState('')

  function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (catFilter) params.set('category_id', catFilter)
    if (monthFilter) params.set('month', monthFilter)
    api.get(`/api/finance/other-revenues?${params}`).then(res => {
      setData(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [catFilter, monthFilter])

  const revenues = data?.revenues || []
  const totalAmount = revenues.reduce((s, r) => s + r.amount, 0)

  async function handleDelete(id) {
    if (!confirm('Supprimer cette entrée ?')) return
    await api.delete(`/api/finance/other-revenues/${id}`)
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-steel-900">Revenus divers</h1>
          <p className="text-sm text-steel-500 mt-0.5">{revenues.length} entrée(s) — {formatXOF(totalAmount)}</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="px-3 py-2 bg-brand hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors">
          + Ajouter
        </button>
      </div>

      {/* Category totals */}
      {(data?.totals || []).length > 0 && (
        <div className="flex gap-3 mb-4 flex-wrap">
          {data.totals.map(t => (
            <div key={t.category} className="bg-white rounded-lg border border-steel-200 px-3 py-2">
              <p className="text-[10px] text-steel-400">{t.category}</p>
              <p className="text-sm font-semibold text-brand">{formatXOF(t.total)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
          <option value="">Toutes les catégories</option>
          {(data?.categories || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
          className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand" />
        {monthFilter && (
          <button onClick={() => setMonthFilter('')} className="px-3 py-2 text-steel-400 hover:text-steel-700 text-sm">
            Effacer
          </button>
        )}
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
                <th className="text-left px-4 py-2.5 text-steel-500 font-medium">Référence</th>
                <th className="text-left px-4 py-2.5 text-steel-500 font-medium">Enregistré par</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {revenues.map(r => (
                <tr key={r.id} className="border-b border-steel-50 hover:bg-steel-50/50">
                  <td className="px-4 py-2.5 text-steel-600">
                    {r.revenue_date ? new Date(r.revenue_date).toLocaleDateString('fr-FR') : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-brand/10 text-brand">
                      {r.category_name}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-steel-800">{r.description || '—'}</td>
                  <td className="px-4 py-2.5 text-right text-green-600 font-medium">{formatXOF(r.amount)}</td>
                  <td className="px-4 py-2.5 text-steel-400 text-xs">{r.reference || '—'}</td>
                  <td className="px-4 py-2.5 text-steel-500 text-xs">{r.recorded_by_name || '—'}</td>
                  <td className="px-2 py-2.5">
                    <button onClick={() => handleDelete(r.id)} className="text-steel-400 hover:text-red-500 text-xs">×</button>
                  </td>
                </tr>
              ))}
              {revenues.length === 0 && (
                <tr><td colSpan="7" className="px-4 py-8 text-center text-steel-400 text-sm">Aucun revenu enregistré</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <AddRevenueModal
          categories={(data?.categories || []).filter(c => c.name !== 'Scolarité')}
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); load() }}
        />
      )}
    </div>
  )
}

function AddRevenueModal({ categories, onClose, onAdded }) {
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [revenueDate, setRevenueDate] = useState(new Date().toISOString().slice(0, 10))
  const [reference, setReference] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!categoryId || !amount) return
    setSaving(true)
    try {
      await api.post('/api/finance/other-revenues', {
        category_id: parseInt(categoryId),
        description: description || null,
        amount: parseFloat(amount),
        revenue_date: revenueDate,
        reference: reference || null,
      })
      onAdded()
    } catch { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="p-5 border-b border-steel-200">
          <h2 className="text-lg font-medium text-steel-900">Nouveau revenu</h2>
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
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand"
              placeholder="Ex: Don de la mairie" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-steel-500 mb-1">Montant (F CFA) *</label>
              <input type="number" min="1" required value={amount} onChange={e => setAmount(e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
            </div>
            <div>
              <label className="block text-xs text-steel-500 mb-1">Date</label>
              <input type="date" value={revenueDate} onChange={e => setRevenueDate(e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-steel-500 mb-1">Référence</label>
            <input type="text" value={reference} onChange={e => setReference(e.target.value)}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand"
              placeholder="Ex: BON-2025-001" />
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
