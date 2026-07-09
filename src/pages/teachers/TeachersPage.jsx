import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../utils/api'
import Pagination from '../../components/Pagination'

const PAGE_SIZE = 50

export default function TeachersPage() {
  const [teachers, setTeachers] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const navigate = useNavigate()
  const searchDebounceRef = useRef(null)

  function handleSearchChange(value) {
    setSearch(value)
    clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(value), 300)
  }

  useEffect(() => { setPage(1) }, [debouncedSearch, statusFilter])

  const fetchTeachers = useCallback(async () => {
    const params = new URLSearchParams()
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (statusFilter) params.set('status', statusFilter)
    params.set('page', page)
    params.set('limit', PAGE_SIZE)
    const res = await api.get(`/api/teachers?${params}`)
    setTeachers(res.data.teachers || [])
    setTotal(res.data.total || 0)
    setTotalPages(res.data.total_pages || 1)
    setLoading(false)
  }, [debouncedSearch, statusFilter, page])

  useEffect(() => { fetchTeachers() }, [fetchTeachers])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-steel-900">Enseignants</h1>
          <p className="text-sm text-steel-500 mt-0.5">{total} enseignant(s)</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-brand hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Ajouter un enseignant
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <input type="text" placeholder="Rechercher par nom..." value={search} onChange={e => handleSearchChange(e.target.value)}
          className="px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand w-72" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
          <option value="">Tous</option><option value="active">Actifs</option><option value="inactive">Inactifs</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-steel-200 bg-steel-50">
              <th className="text-left px-4 py-3 text-steel-500 font-medium">Nom complet</th>
              <th className="text-left px-4 py-3 text-steel-500 font-medium">Téléphone</th>
              <th className="text-left px-4 py-3 text-steel-500 font-medium">Email</th>
              <th className="text-left px-4 py-3 text-steel-500 font-medium">Classes</th>
              <th className="text-center px-4 py-3 text-steel-500 font-medium">Matières</th>
              <th className="text-left px-4 py-3 text-steel-500 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-steel-400">Chargement...</td></tr>
            ) : teachers.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-steel-400">Aucun enseignant trouvé</td></tr>
            ) : teachers.map(t => (
              <tr key={t.id} onClick={() => navigate(`/teachers/${t.id}`)}
                className="border-b border-steel-100 hover:bg-steel-50 cursor-pointer transition-colors">
                <td className="px-4 py-3 text-steel-800 font-medium">{t.full_name}</td>
                <td className="px-4 py-3 text-steel-600">{t.phone || '—'}</td>
                <td className="px-4 py-3 text-steel-600">{t.email || '—'}</td>
                <td className="px-4 py-3 text-steel-600 text-xs">{t.classrooms?.join(', ') || '—'}</td>
                <td className="px-4 py-3 text-center text-steel-600">{t.assignment_count}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.is_active === 1 ? 'bg-brand-50 text-brand-600' : 'bg-steel-100 text-steel-500'}`}>
                    {t.is_active === 1 ? 'Actif' : 'Inactif'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      {showAdd && <AddTeacherModal onClose={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); fetchTeachers() }} />}
    </div>
  )
}

function AddTeacherModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ full_name: '', phone: '', email: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.full_name.trim()) { setError('Nom requis'); return }
    setSaving(true); setError('')
    try { await api.post('/api/teachers', form); onCreated() }
    catch (err) { setError(err.response?.data?.message || 'Erreur'); setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-medium text-steel-900 mb-4">Ajouter un enseignant</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-steel-500 mb-1">Nom complet <span className="text-red-500">*</span></label>
            <input type="text" required value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand" />
          </div>
          <div>
            <label className="block text-xs text-steel-500 mb-1">Téléphone</label>
            <input type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
          </div>
          <div>
            <label className="block text-xs text-steel-500 mb-1">Email</label>
            <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50">Annuler</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
              {saving ? 'Ajout...' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
