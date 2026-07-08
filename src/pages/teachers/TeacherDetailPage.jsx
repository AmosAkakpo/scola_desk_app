import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../../utils/api'
import ConfirmModal from '../../components/ConfirmModal'

export default function TeacherDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [teacher, setTeacher] = useState(null)
  const [assignments, setAssignments] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)
  const [savingInfo, setSavingInfo] = useState(false)
  const [showToggleConfirm, setShowToggleConfirm] = useState(false)
  const [togglingActive, setTogglingActive] = useState(false)

  async function fetchData() {
    const res = await api.get(`/api/teachers/${id}`)
    setTeacher(res.data.teacher)
    setAssignments(res.data.assignments || [])
    setHistory(res.data.history || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [id])

  function requestSave(e) {
    e?.preventDefault()
    setShowSaveConfirm(true)
  }

  async function saveEdit() {
    setSavingInfo(true)
    await api.put(`/api/teachers/${id}`, editForm)
    setSavingInfo(false)
    setShowSaveConfirm(false)
    setEditing(false)
    fetchData()
  }

  async function toggleActive() {
    setTogglingActive(true)
    await api.patch(`/api/teachers/${id}/toggle-active`)
    setTogglingActive(false)
    setShowToggleConfirm(false)
    fetchData()
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
  if (!teacher) return <p className="text-steel-500 py-20 text-center">Enseignant introuvable</p>

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <button onClick={() => navigate('/teachers')} className="text-xs text-steel-400 hover:text-steel-600 mb-2 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Retour aux enseignants
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-medium text-steel-900">{teacher.full_name}</h1>
            <div className="flex items-center gap-3 mt-1">
              {teacher.matricule && <span className="text-sm font-mono text-brand-600">{teacher.matricule}</span>}
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${teacher.is_active === 1 ? 'bg-brand-50 text-brand-600' : 'bg-steel-100 text-steel-500'}`}>
                {teacher.is_active === 1 ? 'Actif' : 'Inactif'}
              </span>
            </div>
          </div>
          <button onClick={() => setShowToggleConfirm(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${teacher.is_active === 1 ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-brand-200 text-brand-600 hover:bg-brand-50'}`}>
            {teacher.is_active === 1 ? 'Désactiver' : 'Réactiver'}
          </button>
        </div>
      </div>

      {/* Personal Info */}
      <section className="bg-white rounded-xl border border-steel-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide">Informations</h2>
          {!editing ? (
            <button onClick={() => { setEditing(true); setEditForm({ full_name: teacher.full_name, phone: teacher.phone || '', email: teacher.email || '', qualification: teacher.qualification || '', hourly_rate: teacher.hourly_rate || '' }) }}
              className="text-xs text-brand hover:text-brand-600 font-medium">Modifier</button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="text-xs text-steel-400">Annuler</button>
              <button onClick={requestSave} className="text-xs text-brand font-medium">Enregistrer</button>
            </div>
          )}
        </div>
        {!editing ? (
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div><p className="text-steel-400 text-xs">Nom complet</p><p className="text-steel-800 font-medium">{teacher.full_name}</p></div>
            <div><p className="text-steel-400 text-xs">Téléphone</p><p className="text-steel-800">{teacher.phone || '—'}</p></div>
            <div><p className="text-steel-400 text-xs">Email</p><p className="text-steel-800">{teacher.email || '—'}</p></div>
            <div><p className="text-steel-400 text-xs">Sexe</p><p className="text-steel-800">{teacher.gender === 'M' ? 'Masculin' : teacher.gender === 'F' ? 'Féminin' : '—'}</p></div>
            <div><p className="text-steel-400 text-xs">Qualification</p><p className="text-steel-800">{teacher.qualification || '—'}</p></div>
            <div><p className="text-steel-400 text-xs">Matière de spécialité</p><p className="text-steel-800">{teacher.specialty_name || '—'}</p></div>
            <div><p className="text-steel-400 text-xs">Taux horaire</p><p className="text-steel-800">{teacher.hourly_rate ? new Intl.NumberFormat('fr-FR').format(teacher.hourly_rate) + ' F/h' : '—'}</p></div>
          </div>
        ) : (
          <form onSubmit={requestSave} className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-steel-500 mb-1">Nom complet</label>
              <input type="text" value={editForm.full_name || ''} onChange={e => setEditForm(p => ({ ...p, full_name: e.target.value }))}
                className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
            </div>
            <div>
              <label className="block text-xs text-steel-500 mb-1">Téléphone</label>
              <input type="tel" value={editForm.phone || ''} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))}
                className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
            </div>
            <div>
              <label className="block text-xs text-steel-500 mb-1">Email</label>
              <input type="email" value={editForm.email || ''} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))}
                className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-steel-500 mb-1">Qualification</label>
              <input type="text" value={editForm.qualification || ''} onChange={e => setEditForm(p => ({ ...p, qualification: e.target.value }))}
                placeholder="Ex: CAPES, Licence en Mathématiques..."
                className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
            </div>
            <div>
              <label className="block text-xs text-steel-500 mb-1">Taux horaire (XOF)</label>
              <input type="number" min="0" value={editForm.hourly_rate || ''} onChange={e => setEditForm(p => ({ ...p, hourly_rate: e.target.value }))}
                placeholder="Ex: 3000"
                className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
            </div>
          </form>
        )}
      </section>

      {/* Current Assignments */}
      <section className="bg-white rounded-xl border border-steel-200 p-6">
        <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide mb-4">Affectations (année en cours)</h2>
        {assignments.length === 0 ? (
          <p className="text-sm text-steel-400 text-center py-4">Aucune affectation</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-steel-200">
                <th className="text-left py-2 text-steel-500 font-medium text-xs">Classe</th>
                <th className="text-left py-2 text-steel-500 font-medium text-xs">Niveau</th>
                <th className="text-left py-2 text-steel-500 font-medium text-xs">Matière</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a, i) => (
                <tr key={i} className="border-b border-steel-50">
                  <td className="py-2 text-steel-800">{a.classroom_label}</td>
                  <td className="py-2 text-steel-600">{a.level_name}</td>
                  <td className="py-2 text-steel-600">{a.subject_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* History */}
      {history.length > 0 && (
        <section className="bg-white rounded-xl border border-steel-200 p-6">
          <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide mb-4">Historique</h2>
          <div className="space-y-4">
            {history.map((h, i) => (
              <div key={i}>
                <p className="text-sm font-medium text-steel-700 mb-1">{h.year}</p>
                <div className="flex flex-wrap gap-2">
                  {h.items.map((item, j) => (
                    <span key={j} className="px-2 py-1 bg-steel-50 border border-steel-200 rounded text-xs text-steel-600">
                      {item.classroom} — {item.subject}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Save Confirmation Modal */}
      {showSaveConfirm && (
        <ConfirmModal
          title="Modifier les informations"
          message="Confirmer la modification des informations de cet enseignant."
          saving={savingInfo}
          onCancel={() => setShowSaveConfirm(false)}
          onConfirm={saveEdit}
        >
          <div className="bg-steel-50 rounded-lg px-4 py-3 space-y-1">
            <p className="font-medium text-steel-800">{editForm.full_name}</p>
            <p className="text-xs text-steel-500">{editForm.phone || '—'} · {editForm.email || '—'}</p>
          </div>
        </ConfirmModal>
      )}

      {/* Toggle Active Confirmation Modal */}
      {showToggleConfirm && (
        <ConfirmModal
          title={teacher.is_active === 1 ? 'Désactiver cet enseignant' : 'Réactiver cet enseignant'}
          message={teacher.is_active === 1
            ? 'Ses affectations resteront visibles mais il ne pourra plus être sélectionné pour de nouvelles classes.'
            : 'Cet enseignant redeviendra sélectionnable pour les affectations et le suivi de salaire.'}
          danger={teacher.is_active === 1}
          confirmLabel={teacher.is_active === 1 ? 'Désactiver' : 'Réactiver'}
          saving={togglingActive}
          onCancel={() => setShowToggleConfirm(false)}
          onConfirm={toggleActive}
        >
          <div className="bg-steel-50 rounded-lg px-4 py-3">
            <p className="font-medium text-steel-800">{teacher.full_name}</p>
          </div>
        </ConfirmModal>
      )}
    </div>
  )
}
