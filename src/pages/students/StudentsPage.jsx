import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../utils/api'
import Pagination from '../../components/Pagination'

const STATUS_LABELS = { active: 'Actif', graduated: 'Diplômé', transferred: 'Transféré', excluded: 'Exclu' }
const STATUS_COLORS = { active: 'bg-brand-50 text-brand-600', graduated: 'bg-steel-100 text-steel-600', transferred: 'bg-yellow-100 text-yellow-700', excluded: 'bg-red-100 text-red-700' }
const PAGE_SIZE = 50

export default function StudentsPage() {
  const [students, setStudents] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [classrooms, setClassrooms] = useState([])
  const [levels, setLevels] = useState([])
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const navigate = useNavigate()
  const searchDebounceRef = useRef(null)

  function handleSearchChange(value) {
    setSearch(value)
    clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(value), 300)
  }

  // Any filter/search change invalidates the current page — back to page 1.
  useEffect(() => { setPage(1) }, [debouncedSearch, classFilter, levelFilter, statusFilter])

  const fetchStudents = useCallback(async () => {
    const params = new URLSearchParams()
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (classFilter) params.set('classroom_id', classFilter)
    if (levelFilter) params.set('level_id', levelFilter)
    if (statusFilter) params.set('status', statusFilter)
    params.set('page', page)
    params.set('limit', PAGE_SIZE)
    const res = await api.get(`/api/students?${params}`)
    setStudents(res.data.students || [])
    setTotal(res.data.total || 0)
    setTotalPages(res.data.total_pages || 1)
    setLoading(false)
  }, [debouncedSearch, classFilter, levelFilter, statusFilter, page])

  useEffect(() => {
    fetchStudents()
    api.get('/api/classrooms').then(r => setClassrooms(r.data.classrooms || [])).catch(() => {})
    api.get('/api/onboarding/levels').then(r => setLevels((r.data.levels || []).filter(l => l.is_active === 1))).catch(() => {})
  }, [fetchStudents])

  async function downloadSummaryPdf() {
    setGeneratingSummary(true)
    try {
      const [{ jsPDF }, { default: QRCode }, res] = await Promise.all([
        import('jspdf'),
        import('qrcode'),
        api.get('/api/students/summary'),
      ])
      const data = res.data
      const printedAt = new Date()

      const breakdown = Object.entries(data.by_status || {}).map(([status, count]) => ({
        label: STATUS_LABELS[status] || status, count,
      }))

      // Tamper check: scanning the QR reveals the original counts + print
      // timestamp, so a hand-altered number on the printed page won't match.
      const qrPayload = JSON.stringify({
        school: data.school_name,
        year: data.academic_year_label,
        printed_at: printedAt.toISOString(),
        total: data.total,
        by_status: data.by_status,
      })
      const qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 300 })

      // Logo, same slot as the report card header (fallback to a plain "S" box if none uploaded)
      let logoDataUrl = null
      try {
        const logoRes = await api.get('/api/settings/school-logo', { responseType: 'blob' })
        logoDataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result)
          reader.onerror = reject
          reader.readAsDataURL(logoRes.data)
        })
      } catch { /* no logo configured */ }

      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const W = 210
      const boxSize = 24
      const headerTop = 15

      // Left: school logo
      if (logoDataUrl) {
        doc.addImage(logoDataUrl, 'PNG', 20, headerTop, boxSize, boxSize)
      } else {
        doc.setDrawColor(180)
        doc.roundedRect(20, headerTop, boxSize, boxSize, 2, 2)
        doc.setFontSize(16)
        doc.setFont(undefined, 'bold')
        doc.setTextColor(180)
        doc.text('S', 20 + boxSize / 2, headerTop + boxSize / 2 + 3, { align: 'center' })
        doc.setTextColor(0)
      }

      // Right: QR code, same slot the report card uses for the flag
      doc.addImage(qrDataUrl, 'PNG', W - 20 - boxSize, headerTop, boxSize, boxSize)

      // Center: title block
      let y = headerTop + 6
      doc.setFontSize(14)
      doc.setFont(undefined, 'bold')
      doc.text(data.school_name || 'Établissement scolaire', W / 2, y, { align: 'center' })
      y += 8
      doc.setFontSize(12)
      doc.text('Résumé des effectifs', W / 2, y, { align: 'center' })
      y += 7
      doc.setFontSize(9)
      doc.setFont(undefined, 'normal')
      doc.text(`Année scolaire ${data.academic_year_label || '—'}`, W / 2, y, { align: 'center' })
      y += 5
      doc.text(`Imprimé le ${printedAt.toLocaleString('fr-FR')}`, W / 2, y, { align: 'center' })

      y = headerTop + boxSize + 12
      doc.setDrawColor(0)
      doc.line(20, y, W - 20, y)
      y += 10

      doc.setFont(undefined, 'bold')
      doc.setFontSize(11)
      doc.text('Statut', 20, y)
      doc.text('Nombre', 150, y, { align: 'right' })
      y += 2
      doc.line(20, y, W - 20, y)
      y += 7

      doc.setFont(undefined, 'normal')
      breakdown.forEach(row => {
        doc.text(row.label, 20, y)
        doc.text(String(row.count), 150, y, { align: 'right' })
        y += 7
      })

      y += 1
      doc.line(20, y, W - 20, y)
      y += 8
      doc.setFont(undefined, 'bold')
      doc.text('Total', 20, y)
      doc.text(String(data.total), 150, y, { align: 'right' })

      const yearSlug = (data.academic_year_label || 'annee').replace(/[^a-z0-9]/gi, '_')
      doc.save(`Resume_effectifs_${yearSlug}.pdf`)
    } catch (err) {
      console.error('Summary PDF error', err)
    }
    setGeneratingSummary(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-steel-900">Élèves</h1>
          <p className="text-sm text-steel-500 mt-0.5">{total} élève(s) enregistré(s)</p>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadSummaryPdf} disabled={generatingSummary}
            className="px-4 py-2 border border-steel-200 text-steel-600 hover:bg-steel-50 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {generatingSummary ? 'Génération...' : 'Résumé des effectifs (PDF)'}
          </button>
          <button onClick={() => setShowAdd(true)}
            className="px-4 py-2 bg-brand hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Ajouter un élève
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <input type="text" placeholder="Rechercher par nom ou matricule..." value={search}
          onChange={e => handleSearchChange(e.target.value)}
          className="px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand w-72" />
        <select value={classFilter} onChange={e => setClassFilter(e.target.value)}
          className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
          <option value="">Toutes les classes</option>
          {classrooms.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)}
          className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
          <option value="">Tous les niveaux</option>
          {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-steel-200 bg-steel-50">
              <th className="text-left px-4 py-3 text-steel-500 font-medium">Matricule</th>
              <th className="text-left px-4 py-3 text-steel-500 font-medium">Nom complet</th>
              <th className="text-left px-4 py-3 text-steel-500 font-medium">Sexe</th>
              <th className="text-left px-4 py-3 text-steel-500 font-medium">Classe</th>
              <th className="text-left px-4 py-3 text-steel-500 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-steel-400">Chargement...</td></tr>
            ) : students.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-steel-400">Aucun élève trouvé</td></tr>
            ) : students.map(s => (
              <tr key={s.id} onClick={() => navigate(`/students/${s.id}`)}
                className="border-b border-steel-100 hover:bg-steel-50 cursor-pointer transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-brand-600">{s.matricule || '—'}</td>
                <td className="px-4 py-3 text-steel-800 font-medium">{s.full_name}</td>
                <td className="px-4 py-3 text-steel-600">{s.gender || '—'}</td>
                <td className="px-4 py-3 text-steel-600">{s.classroom_label || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[s.status] || 'bg-steel-100 text-steel-500'}`}>
                    {STATUS_LABELS[s.status] || s.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      {/* Add Student Modal */}
      {showAdd && <AddStudentModal classrooms={classrooms} onClose={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); fetchStudents() }} />}
    </div>
  )
}

function AddStudentModal({ classrooms, onClose, onCreated }) {
  const [form, setForm] = useState({ full_name: '', gender: '', birth_date: '', birth_place: '', classroom_id: classrooms[0]?.id || '', matricule: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.full_name.trim() || !form.classroom_id) { setError('Nom et classe requis'); return }
    setSaving(true); setError('')
    try {
      await api.post('/api/students', form)
      onCreated()
    } catch (err) { setError(err.response?.data?.message || 'Erreur'); setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="p-6 border-b border-steel-200">
          <h2 className="text-lg font-medium text-steel-900">Ajouter un élève</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-steel-600 mb-1">Nom complet <span className="text-red-500">*</span></label>
            <input type="text" required value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-steel-600 mb-1">Classe <span className="text-red-500">*</span></label>
              <select value={form.classroom_id} onChange={e => setForm(p => ({ ...p, classroom_id: e.target.value }))}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand bg-white">
                {classrooms.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-steel-600 mb-1">Sexe</label>
              <select value={form.gender} onChange={e => setForm(p => ({ ...p, gender: e.target.value }))}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand bg-white">
                <option value="">—</option><option value="M">Masculin</option><option value="F">Féminin</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-steel-600 mb-1">Date de naissance</label>
              <input type="date" value={form.birth_date} onChange={e => setForm(p => ({ ...p, birth_date: e.target.value }))}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
            </div>
            <div>
              <label className="block text-sm text-steel-600 mb-1">Lieu de naissance</label>
              <input type="text" value={form.birth_place} onChange={e => setForm(p => ({ ...p, birth_place: e.target.value }))}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-steel-600 mb-1">Matricule (laisser vide pour auto)</label>
            <input type="text" value={form.matricule} onChange={e => setForm(p => ({ ...p, matricule: e.target.value }))}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand"
              placeholder="Auto-généré si vide" />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50 transition-colors">Annuler</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
              {saving ? 'Création...' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
