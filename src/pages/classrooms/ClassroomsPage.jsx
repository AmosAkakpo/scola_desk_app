import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../utils/api'
import ConfirmModal from '../../components/ConfirmModal'

export default function ClassroomsPage() {
  const [classrooms, setClassrooms] = useState([])
  const [totalRooms, setTotalRooms] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [classroomToDelete, setClassroomToDelete] = useState(null)
  const [deletingClassroom, setDeletingClassroom] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const navigate = useNavigate()

  async function fetchClassrooms() {
    const res = await api.get('/api/classrooms')
    setClassrooms(res.data.classrooms || [])
    setLoading(false)
    api.get('/api/settings/levels').then(r => setTotalRooms(r.data.total_rooms || null)).catch(() => {})
  }

  useEffect(() => { fetchClassrooms() }, [])

  function requestDelete(id, label) {
    setDeleteError(null)
    setClassroomToDelete({ id, label })
  }

  async function confirmDelete() {
    setDeletingClassroom(true)
    setDeleteError(null)
    try {
      await api.delete(`/api/classrooms/${classroomToDelete.id}`)
      setClassroomToDelete(null)
      fetchClassrooms()
    } catch (err) {
      setDeleteError(err.response?.data?.message || 'Erreur lors de la suppression')
    } finally {
      setDeletingClassroom(false)
    }
  }

  const totalStudents = classrooms.reduce((s, c) => s + (c.student_count || 0), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-steel-900">Classes</h1>
          <p className="text-sm text-steel-500 mt-0.5">
            {classrooms.length} classe(s) · {totalStudents} élève(s)
            {totalRooms && <span className="ml-2">· {classrooms.length}/{totalRooms} salles</span>}
          </p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-brand hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors">
          + Ajouter une classe
        </button>
      </div>

      {totalRooms && classrooms.length > parseInt(totalRooms) && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 flex items-start gap-2">
          <svg className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p className="text-xs text-yellow-700"><strong>{classrooms.length} classes</strong> pour <strong>{totalRooms} salles</strong> disponibles.</p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
      ) : classrooms.length === 0 ? (
        <div className="bg-white rounded-xl border border-steel-200 p-12 text-center">
          <p className="text-steel-400">Aucune classe pour cette année</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {classrooms.map(c => (
            <div key={c.id} onClick={() => navigate(`/classrooms/${c.id}`)}
              className="bg-white rounded-xl border border-steel-200 p-5 hover:border-steel-300 cursor-pointer transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-medium text-steel-900">{c.label}</h3>
                  <p className="text-xs text-steel-500">{c.level_name}</p>
                </div>
                <button onClick={e => { e.stopPropagation(); requestDelete(c.id, c.label) }}
                  className="text-xs text-steel-300 hover:text-red-500 transition-colors p-1" title="Supprimer">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 text-steel-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  <span className="text-sm text-steel-700">{c.student_count}</span>
                  <span className="text-xs text-steel-400">/ {c.capacity}</span>
                </div>
                {c.student_count > c.capacity && (
                  <span className="px-1.5 py-0.5 bg-red-50 text-red-500 rounded text-xs font-medium">Plein</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && <AddClassroomModal onClose={() => setShowAdd(false)} onDone={() => { setShowAdd(false); fetchClassrooms() }} />}

      {/* Delete Confirmation Modal */}
      {classroomToDelete && (
        <ConfirmModal
          title="Supprimer la classe"
          message="Cette action est irréversible. Pour confirmer, tapez le nom de la classe."
          requireMatch={classroomToDelete.label}
          matchLabel="nom de la classe"
          danger
          confirmLabel="Supprimer"
          savingLabel="Suppression..."
          saving={deletingClassroom}
          onCancel={() => { setClassroomToDelete(null); setDeleteError(null) }}
          onConfirm={confirmDelete}
        >
          <>
            <div className="bg-steel-50 rounded-lg px-4 py-3">
              <p className="font-medium text-steel-800">{classroomToDelete.label}</p>
            </div>
            {deleteError && (
              <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <p className="text-xs text-amber-700">{deleteError}</p>
              </div>
            )}
          </>
        </ConfirmModal>
      )}
    </div>
  )
}

function AddClassroomModal({ onClose, onDone }) {
  const [levels, setLevels] = useState([])
  const [series, setSeries] = useState([])
  const [form, setForm] = useState({ label: '', level_id: '', serie_id: '', capacity: 50 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // /api/onboarding/* is sealed once the school is configured — this data
    // now comes from the settings route.
    api.get('/api/settings/levels').then(res => {
      const active = (res.data.levels || []).filter(l => l.is_active === 1)
      setLevels(active)
      setSeries(res.data.series || [])
      if (active.length > 0) setForm(p => ({ ...p, level_id: active[0].id }))
    })
  }, [])

  const levelSeries = series.filter(s => s.level_id === parseInt(form.level_id))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.label.trim() || !form.level_id) return
    // A classroom on a has-séries level without a série would get ZERO
    // subjects/templates (subjects there are all série-specific).
    if (levelSeries.length > 0 && !form.serie_id) { setError('Sélectionnez une série pour ce niveau'); return }
    setError(''); setSaving(true)
    try {
      await api.post('/api/classrooms', {
        label: form.label.trim(),
        level_id: parseInt(form.level_id),
        serie_id: form.serie_id ? parseInt(form.serie_id) : null,
        capacity: parseInt(form.capacity) || 50,
      })
      onDone()
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-medium text-steel-900 mb-4">Ajouter une classe</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-steel-500 mb-1">Nom de la classe <span className="text-red-500">*</span></label>
            <input type="text" required value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
              placeholder="Ex: 6ème A" autoFocus
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
          </div>
          <div>
            <label className="block text-xs text-steel-500 mb-1">Niveau <span className="text-red-500">*</span></label>
            <select value={form.level_id} onChange={e => setForm(p => ({ ...p, level_id: e.target.value, serie_id: '' }))}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand bg-white">
              {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          {levelSeries.length > 0 && (
            <div>
              <label className="block text-xs text-steel-500 mb-1">Série <span className="text-red-500">*</span></label>
              <select required value={form.serie_id} onChange={e => setForm(p => ({ ...p, serie_id: e.target.value }))}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand bg-white">
                <option value="">— Sélectionner —</option>
                {levelSeries.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs text-steel-500 mb-1">Capacité</label>
            <input type="number" min={1} value={form.capacity} onChange={e => setForm(p => ({ ...p, capacity: e.target.value }))}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50">Annuler</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
              {saving ? 'Création...' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
