import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../utils/api'
import Pagination from '../../components/Pagination'

function formatXOF(n) {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' F'
}

const STATUS_COLORS = { paid: 'bg-brand-50 text-brand-600', partial: 'bg-orange-50 text-orange-600', unpaid: 'bg-red-50 text-red-600' }
const STATUS_LABELS = { paid: 'Soldé', partial: 'Partiel', unpaid: 'Impayé' }
const PAGE_SIZE = 50

export default function TuitionPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [classroomId, setClassroomId] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sort, setSort] = useState('')
  const [page, setPage] = useState(1)
  const navigate = useNavigate()
  const searchDebounceRef = useRef(null)

  function handleSearchChange(value) {
    setSearch(value)
    clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(value), 300)
  }

  useEffect(() => { setPage(1) }, [classroomId, statusFilter, debouncedSearch, sort])

  function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (classroomId) params.set('classroom_id', classroomId)
    if (statusFilter) params.set('status', statusFilter)
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (sort) params.set('sort', sort)
    params.set('page', page)
    params.set('limit', PAGE_SIZE)
    api.get(`/api/finance/tuition?${params.toString()}`).then(res => {
      setData(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [classroomId, statusFilter, debouncedSearch, sort, page])

  if (loading && !data) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>

  const students = data?.students || []
  const totalCount = data?.total || 0
  // Aggregates come from the server, computed over ALL matching students,
  // not just this page -- summing the paged `students` array would silently
  // undercount once there's more than one page.
  const totalDue = data?.total_due || 0
  const totalPaid = data?.total_paid || 0

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-steel-900">Paiements scolarité</h1>
          <p className="text-sm text-steel-500 mt-0.5">{totalCount} élève(s) — {formatXOF(totalPaid)} / {formatXOF(totalDue)}</p>
        </div>
        <button onClick={() => navigate('/finance/tuition/report')}
          className="px-4 py-2 border border-steel-200 hover:bg-steel-50 text-steel-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-6m4 6V7m4 10v-3M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
          État financier
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <select value={classroomId} onChange={e => setClassroomId(e.target.value)}
          className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
          <option value="">Toutes les classes</option>
          {(data?.classrooms || []).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
          <option value="">Tous les statuts</option>
          <option value="paid">Soldé</option>
          <option value="partial">Partiel</option>
          <option value="unpaid">Impayé</option>
        </select>
        <select value={sort} onChange={e => setSort(e.target.value)}
          className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
          <option value="">Trier par...</option>
          <option value="owed_desc">Reste à payer (plus élevé)</option>
          <option value="owed_asc">Reste à payer (moins élevé)</option>
        </select>
        <input type="text" value={search} onChange={e => handleSearchChange(e.target.value)} placeholder="Rechercher..."
          className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand w-48" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-steel-200 bg-steel-50">
              <th className="text-left px-4 py-2.5 text-steel-500 font-medium">Élève</th>
              <th className="text-left px-4 py-2.5 text-steel-500 font-medium">Classe</th>
              <th className="text-right px-4 py-2.5 text-steel-500 font-medium">Total dû</th>
              <th className="text-right px-4 py-2.5 text-steel-500 font-medium">Payé</th>
              <th className="text-right px-4 py-2.5 text-steel-500 font-medium">Reste</th>
              <th className="text-center px-4 py-2.5 text-steel-500 font-medium">Statut</th>
              <th className="text-center px-4 py-2.5 text-steel-500 font-medium w-24"></th>
            </tr>
          </thead>
          <tbody>
            {students.map(s => (
              <tr key={s.student_id} className="border-b border-steel-50 hover:bg-steel-50/50">
                <td className="px-4 py-2.5">
                  <p className="text-steel-800 font-medium">{s.full_name}</p>
                  <p className="text-[10px] text-steel-400 font-mono">{s.matricule || '—'}</p>
                </td>
                <td className="px-4 py-2.5 text-steel-600">{s.classroom_label}</td>
                <td className="px-4 py-2.5 text-right text-steel-800">{formatXOF(s.total_due)}</td>
                <td className="px-4 py-2.5 text-right text-brand font-medium">{formatXOF(s.total_paid)}</td>
                <td className="px-4 py-2.5 text-right text-steel-600">{formatXOF(s.remaining)}</td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[s.status]}`}>{STATUS_LABELS[s.status]}</span>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <button onClick={() => navigate(`/finance/tuition/${s.student_id}`)} className="px-2.5 py-1 bg-brand hover:bg-brand-600 text-white rounded text-xs font-medium transition-colors">
                    Voir / Payer
                  </button>
                </td>
              </tr>
            ))}
            {students.length === 0 && (
              <tr><td colSpan="7" className="px-4 py-8 text-center text-steel-400 text-sm">Aucun élève trouvé</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={data?.total_pages || 1} onPageChange={setPage} />
    </div>
  )
}
