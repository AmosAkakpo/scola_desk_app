import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../../utils/api'
import ConfirmModal from '../../components/ConfirmModal'

const STATUS_LABELS = { active: 'Actif', graduated: 'Diplômé', transferred: 'Transféré', excluded: 'Exclu' }

// Maps student.status to a verdict badge for the current year row, used only
// as a fallback until Phase 5 (Promotion Engine) starts populating real
// promotion_details.verdict rows.
const STATUS_TO_VERDICT = { excluded: 'exclu', transferred: 'transfere', graduated: 'admis' }

const VERDICT_CONFIG = {
  admis: { label: 'Admis', bg: 'bg-brand-50 text-brand-600' },
  doublant: { label: 'Redoublant', bg: 'bg-yellow-100 text-yellow-700' },
  exclu: { label: 'Exclu', bg: 'bg-red-100 text-red-600' },
  transfere: { label: 'Transféré', bg: 'bg-blue-100 text-blue-600' },
  abandon: { label: 'Abandon', bg: 'bg-steel-100 text-steel-600' },
  en_cours: { label: 'En cours', bg: 'bg-brand-50 text-brand-500' },
}

function VerdictBadge({ verdict }) {
  if (!verdict) return <span className="text-steel-400">—</span>
  const cfg = VERDICT_CONFIG[verdict] || { label: verdict, bg: 'bg-steel-100 text-steel-600' }
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${cfg.bg}`}>{cfg.label}</span>
}

export default function StudentDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [student, setStudent] = useState(null)
  const [guardians, setGuardians] = useState([])
  const [history, setHistory] = useState([])
  const [enrollment, setEnrollment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [showTransfer, setShowTransfer] = useState(false)
  const [showAddGuardian, setShowAddGuardian] = useState(false)
  const [sanctionSem, setSanctionSem] = useState(1)
  const [sanctions, setSanctions] = useState(null)
  const [sanctionSaving, setSanctionSaving] = useState(false)
  const [showExpelConfirm, setShowExpelConfirm] = useState(false)
  const [expelMatriculeInput, setExpelMatriculeInput] = useState('')
  const [expelling, setExpelling] = useState(false)
  const [showTransferOutConfirm, setShowTransferOutConfirm] = useState(false)
  const [transferringOut, setTransferringOut] = useState(false)
  const [defaultConduite, setDefaultConduite] = useState(18)
  const [conduiteScore, setConduiteScore] = useState(18)
  const [conduiteNote, setConduiteNote] = useState('')
  const [showConduiteConfirm, setShowConduiteConfirm] = useState(false)
  const [conduiteSaving, setConduiteSaving] = useState(false)
  const [showSaveInfoConfirm, setShowSaveInfoConfirm] = useState(false)
  const [savingInfo, setSavingInfo] = useState(false)
  const [saveConflict, setSaveConflict] = useState(false)
  const [guardianToDelete, setGuardianToDelete] = useState(null)
  const [deletingGuardian, setDeletingGuardian] = useState(false)

  async function fetchData() {
    const res = await api.get(`/api/students/${id}`)
    setStudent(res.data.student)
    setGuardians(res.data.guardians || [])
    setHistory(res.data.history || [])
    setEnrollment(res.data.current_enrollment)
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [id])

  function requestSaveInfo(e) {
    e?.preventDefault()
    setShowSaveInfoConfirm(true)
  }

  async function saveEdit() {
    setSavingInfo(true)
    setSaveConflict(false)
    try {
      await api.put(`/api/students/${id}`, { ...editForm, expected_updated_at: student.updated_at })
      setShowSaveInfoConfirm(false)
      setEditing(false)
      fetchData()
    } catch (err) {
      if (err.response?.status === 409) {
        setSaveConflict(true)
        setShowSaveInfoConfirm(false)
      } else {
        throw err
      }
    } finally {
      setSavingInfo(false)
    }
  }

  async function deleteGuardian(gid) {
    setDeletingGuardian(true)
    try {
      await api.delete(`/api/students/${id}/guardians/${gid}`)
      setGuardianToDelete(null)
      fetchData()
    } finally {
      setDeletingGuardian(false)
    }
  }

  async function loadSanctions(sem) {
    const res = await api.get(`/api/students/${id}/sanctions/${sem}`)
    setSanctions(res.data.sanctions)
    const defC = res.data.default_conduite ?? 18
    setDefaultConduite(defC)
    setConduiteScore(res.data.sanctions?.conduite_score ?? defC)
    setConduiteNote(res.data.sanctions?.conduite_note ?? '')
  }

  useEffect(() => { if (!loading) loadSanctions(sanctionSem) }, [loading, sanctionSem, id])

  async function saveSanctions() {
    setSanctionSaving(true)
    try {
      await api.put(`/api/students/${id}/sanctions/${sanctionSem}`, { avertissement: sanctions?.avertissement, blame: sanctions?.blame })
      loadSanctions(sanctionSem)
    } finally {
      setSanctionSaving(false)
    }
  }

  async function saveConduite() {
    setConduiteSaving(true)
    try {
      await api.put(`/api/students/${id}/sanctions/${sanctionSem}`, {
        avertissement: sanctions?.avertissement,
        blame: sanctions?.blame,
        conduite_score: conduiteScore,
        conduite_note: conduiteNote || null,
      })
      setShowConduiteConfirm(false)
      loadSanctions(sanctionSem)
    } finally {
      setConduiteSaving(false)
    }
  }

  async function confirmExpel() {
    setExpelling(true)
    try {
      await api.post(`/api/students/${id}/expel`)
      setShowExpelConfirm(false)
      setExpelMatriculeInput('')
      fetchData()
    } finally {
      setExpelling(false)
    }
  }

  async function confirmTransferOut() {
    setTransferringOut(true)
    try {
      await api.post(`/api/students/${id}/mark-transferred`)
      setShowTransferOutConfirm(false)
      fetchData()
    } finally {
      setTransferringOut(false)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
  if (!student) return <p className="text-steel-500 py-20 text-center">Élève introuvable</p>

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button onClick={() => navigate('/students')} className="text-xs text-steel-400 hover:text-steel-600 mb-2 flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Retour aux élèves
          </button>
          <h1 className="text-xl font-medium text-steel-900">{student.full_name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm font-mono text-brand-600">{student.matricule || '—'}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${student.status === 'active' ? 'bg-brand-50 text-brand-600' : 'bg-steel-100 text-steel-600'}`}>
              {STATUS_LABELS[student.status] || student.status}
            </span>
          </div>
          {enrollment && <p className="text-xs text-steel-400 mt-1">Classe: {enrollment.classroom_label}</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowTransfer(true)} className="px-3 py-1.5 border border-steel-200 text-steel-600 rounded-lg text-xs font-medium hover:bg-steel-50 transition-colors">
            Changer de classe
          </button>
        </div>
      </div>

      {/* Personal Info */}
      <section className="bg-white rounded-xl border border-steel-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide">Informations personnelles</h2>
          {!editing ? (
            <button onClick={() => { setEditing(true); setEditForm({ full_name: student.full_name, birth_date: student.birth_date || '', birth_place: student.birth_place || '', gender: student.gender || '', national_student_number: student.national_student_number || '' }) }}
              className="text-xs text-brand hover:text-brand-600 font-medium">Modifier</button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="text-xs text-steel-400">Annuler</button>
              <button onClick={requestSaveInfo} className="text-xs text-brand font-medium">Enregistrer</button>
            </div>
          )}
        </div>
        {saveConflict && (
          <div className="mb-4 px-4 py-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-700 flex items-center justify-between gap-3">
            <span>Cet élève a été modifié par un autre utilisateur entre-temps. Rechargez avant de réessayer.</span>
            <button onClick={() => { setSaveConflict(false); setEditing(false); fetchData() }}
              className="text-xs font-medium text-orange-700 underline shrink-0">Recharger</button>
          </div>
        )}
        {!editing ? (
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div><p className="text-steel-400 text-xs">Nom complet</p><p className="text-steel-800 font-medium">{student.full_name}</p></div>
            <div><p className="text-steel-400 text-xs">Date de naissance</p><p className="text-steel-800">{student.birth_date || '—'}</p></div>
            <div><p className="text-steel-400 text-xs">Lieu de naissance</p><p className="text-steel-800">{student.birth_place || '—'}</p></div>
            <div><p className="text-steel-400 text-xs">Sexe</p><p className="text-steel-800">{student.gender === 'M' ? 'Masculin' : student.gender === 'F' ? 'Féminin' : '—'}</p></div>
            <div><p className="text-steel-400 text-xs">N° national</p><p className="text-steel-800">{student.national_student_number || '—'}</p></div>
            <div><p className="text-steel-400 text-xs">Inscrit le</p><p className="text-steel-800">{student.created_at ? new Date(student.created_at).toLocaleDateString('fr-FR') : '—'}</p></div>
          </div>
        ) : (
          <form onSubmit={requestSaveInfo} className="grid grid-cols-2 gap-3">
            {[
              { field: 'full_name', label: 'Nom complet', type: 'text' },
              { field: 'birth_date', label: 'Date de naissance', type: 'date' },
              { field: 'birth_place', label: 'Lieu de naissance', type: 'text' },
              { field: 'national_student_number', label: 'N° national', type: 'text' },
            ].map(f => (
              <div key={f.field}>
                <label className="block text-xs text-steel-500 mb-1">{f.label}</label>
                <input type={f.type} value={editForm[f.field] || ''} onChange={e => setEditForm(p => ({ ...p, [f.field]: e.target.value }))}
                  className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
              </div>
            ))}
            <div>
              <label className="block text-xs text-steel-500 mb-1">Sexe</label>
              <select value={editForm.gender || ''} onChange={e => setEditForm(p => ({ ...p, gender: e.target.value }))}
                className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand bg-white">
                <option value="">—</option><option value="M">Masculin</option><option value="F">Féminin</option>
              </select>
            </div>
          </form>
        )}
      </section>

      {/* Guardians */}
      <section className="bg-white rounded-xl border border-steel-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide">Tuteurs</h2>
          <button onClick={() => setShowAddGuardian(true)} className="text-xs text-brand hover:text-brand-600 font-medium">+ Ajouter</button>
        </div>
        {guardians.length === 0 ? (
          <p className="text-sm text-steel-400 text-center py-4">Aucun tuteur enregistré</p>
        ) : (
          <div className="space-y-2">
            {guardians.map(g => (
              <div key={g.id} className="flex items-center justify-between py-2 border-b border-steel-50 last:border-0">
                <div>
                  <p className="text-sm text-steel-800 font-medium">{g.full_name} {g.is_primary === 1 && <span className="text-xs text-brand ml-1">Principal</span>}</p>
                  <p className="text-xs text-steel-500">{g.phone || '—'} {g.relationship && `· ${g.relationship}`}</p>
                </div>
                <button onClick={() => setGuardianToDelete(g)} className="text-xs text-red-400 hover:text-red-500">Retirer</button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Academic History */}
      <section className="bg-white rounded-xl border border-steel-200 p-6">
        <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide mb-4">Parcours scolaire</h2>
        {history.length === 0 ? (
          <p className="text-sm text-steel-400 text-center py-4">Aucun historique</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-steel-200 bg-steel-50">
                  <th className="text-left px-4 py-2.5 text-steel-500 font-medium text-xs">Année</th>
                  <th className="text-left px-4 py-2.5 text-steel-500 font-medium text-xs">Classe</th>
                  <th className="text-left px-4 py-2.5 text-steel-500 font-medium text-xs">Niveau</th>
                  <th className="text-left px-4 py-2.5 text-steel-500 font-medium text-xs">Moyenne</th>
                  <th className="text-left px-4 py-2.5 text-steel-500 font-medium text-xs">Rang</th>
                  <th className="text-left px-4 py-2.5 text-steel-500 font-medium text-xs">Statut</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => {
                  const lastSemester = h.semesters?.length > 0 ? h.semesters[h.semesters.length - 1] : null
                  const avg = h.final_average ?? lastSemester?.average ?? null
                  const rank = lastSemester?.rank ?? null
                  const classSize = lastSemester?.class_size ?? null
                  const verdict = h.verdict || (i === 0 && !h.final_average ? (STATUS_TO_VERDICT[student.status] || 'en_cours') : null)
                  return (
                    <tr key={i} className="border-b border-steel-100 hover:bg-steel-50 transition-colors">
                      <td className="px-4 py-3 text-steel-800 font-medium">{h.year_label}</td>
                      <td className="px-4 py-3 text-steel-700">{h.classroom}</td>
                      <td className="px-4 py-3 text-steel-600">{h.level}</td>
                      <td className="px-4 py-3 text-steel-800">{avg != null ? avg.toFixed(2) : '—'}</td>
                      <td className="px-4 py-3 text-steel-700">{rank ? `${rank}${rank === 1 ? 'er' : 'ème'}/${classSize}` : '—'}</td>
                      <td className="px-4 py-3">
                        <VerdictBadge verdict={verdict} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Bulletins — printable history across ALL years, not just current */}
      <BulletinHistorySection studentId={id} />

      {/* Sanctions & Décisions */}
      <section className="bg-white rounded-xl border border-steel-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide">Sanctions & Décisions</h2>
          {enrollment && student.status === 'active' && (
            <div className="flex gap-2">
              <button onClick={() => setShowTransferOutConfirm(true)}
                className="px-3 py-1.5 border border-blue-200 text-blue-500 rounded-lg text-xs font-medium hover:bg-blue-50 transition-colors">
                Marquer comme transféré
              </button>
              <button onClick={() => setShowExpelConfirm(true)}
                className="px-3 py-1.5 border border-red-200 text-red-500 rounded-lg text-xs font-medium hover:bg-red-50 transition-colors">
                Expulser l'élève
              </button>
            </div>
          )}
        </div>

        {!enrollment ? (
          <p className="text-sm text-steel-400">Élève non inscrit cette année scolaire.</p>
        ) : student.status === 'excluded' ? (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-50 rounded-lg">
            <span className="text-red-500 text-sm font-medium">Élève expulsé</span>
            <span className="text-xs text-red-400">— Ne compte plus dans les effectifs ni les classements</span>
          </div>
        ) : student.status === 'transferred' ? (
          <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 rounded-lg">
            <span className="text-blue-500 text-sm font-medium">Élève transféré</span>
            <span className="text-xs text-blue-400">— Ne compte plus dans les effectifs ni les classements</span>
          </div>
        ) : (
          <>
            {/* Semester tabs */}
            <div className="flex gap-1 mb-5">
              {[1, 2, 3].map(s => (
                <button key={s} onClick={() => setSanctionSem(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${sanctionSem === s ? 'bg-brand text-white' : 'border border-steel-200 text-steel-500 hover:bg-steel-50'}`}>
                  Trimestre {s}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-6">
              {/* Sanctions (manual) */}
              <div>
                <p className="text-xs font-medium text-steel-600 mb-3">Sanctions <span className="text-steel-400 font-normal">(saisie manuelle)</span></p>
                <div className="space-y-3">
                  {[['avertissement', 'Avertissement'], ['blame', 'Blâme']].map(([key, label]) => (
                    <label key={key} className="flex items-center justify-between cursor-pointer">
                      <span className="text-sm text-steel-700">{label}</span>
                      <button onClick={() => setSanctions(p => ({ ...p, [key]: p?.[key] ? 0 : 1 }))}
                        className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${sanctions?.[key] ? 'bg-red-500' : 'bg-steel-200'}`}>
                        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${sanctions?.[key] ? 'left-5' : 'left-1'}`} />
                      </button>
                    </label>
                  ))}
                </div>
                <button onClick={saveSanctions} disabled={sanctionSaving}
                  className="mt-4 px-4 py-1.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors">
                  {sanctionSaving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>

              {/* Auto-computed (read-only) */}
              <div>
                <p className="text-xs font-medium text-steel-600 mb-3">Félicitations <span className="text-steel-400 font-normal">(calculées automatiquement)</span></p>
                <div className="space-y-2">
                  {[['encouragement', 'Encouragement'], ['felicitation', 'Félicitation'], ['tableau_honneur', "Tableau d'honneur"]].map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-sm text-steel-700">{label}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${sanctions?.[key] ? 'bg-brand-50 text-brand-600' : 'bg-steel-100 text-steel-400'}`}>
                        {sanctions?.[key] ? 'Oui' : 'Non'}
                      </span>
                    </div>
                  ))}
                </div>
                {sanctions?.conseil_decision && (
                  <div className="mt-4 p-3 bg-steel-50 rounded-lg">
                    <p className="text-xs text-steel-500 mb-1">Décision du conseil</p>
                    <p className={`text-sm font-medium ${sanctions.conseil_decision_pass ? 'text-brand-600' : 'text-red-500'}`}>
                      {sanctions.conseil_decision}
                    </p>
                  </div>
                )}
                <p className="text-xs text-steel-400 mt-3">Régénérez les bulletins pour mettre à jour ces valeurs.</p>
              </div>
            </div>

            {/* Conduite */}
            <div className="mt-6 pt-6 border-t border-steel-100">
              <p className="text-xs font-medium text-steel-600 mb-3">
                Conduite <span className="text-steel-400 font-normal">(par défaut: {defaultConduite}/20)</span>
              </p>
              <div className="flex items-start gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <input type="number" min="0" max="20" step="0.5" value={conduiteScore}
                    onChange={e => setConduiteScore(parseFloat(e.target.value) || 0)}
                    className="w-20 px-3 py-1.5 border border-steel-200 rounded-lg text-sm text-center focus:outline-none focus:border-brand" />
                  <span className="text-sm text-steel-500">/ 20</span>
                </div>
                <div className="flex-1 min-w-48">
                  <textarea value={conduiteNote} onChange={e => setConduiteNote(e.target.value)} rows={2}
                    placeholder="Note (optionnel) — raison de la modification..."
                    className="w-full px-3 py-2 border border-steel-200 rounded-lg text-xs resize-none focus:outline-none focus:border-brand" />
                </div>
                <button onClick={() => setShowConduiteConfirm(true)} disabled={conduiteSaving}
                  className="px-4 py-1.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors">
                  {conduiteSaving ? 'Enregistrement...' : 'Enregistrer la conduite'}
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Conduite Confirmation Modal */}
      {showConduiteConfirm && (
        <ConfirmModal
          title="Modifier la conduite"
          message={`Confirmer la modification de la note de conduite pour le Trimestre ${sanctionSem}.`}
          requireMatch={student.matricule}
          saving={conduiteSaving}
          onCancel={() => setShowConduiteConfirm(false)}
          onConfirm={saveConduite}
        >
          <div className="bg-steel-50 rounded-lg px-4 py-3 space-y-1">
            <p className="font-medium text-steel-800">{student.full_name}</p>
            <p className="text-xs text-steel-500">Conduite: <strong>{conduiteScore}/20</strong></p>
            {conduiteNote && <p className="text-xs text-steel-500 italic">Note: {conduiteNote}</p>}
          </div>
        </ConfirmModal>
      )}

      {/* Save Personal Info Confirmation Modal */}
      {showSaveInfoConfirm && (
        <ConfirmModal
          title="Modifier les informations"
          message="Confirmer la modification des informations personnelles de l'élève."
          requireMatch={student.matricule}
          saving={savingInfo}
          onCancel={() => setShowSaveInfoConfirm(false)}
          onConfirm={saveEdit}
        >
          <div className="bg-steel-50 rounded-lg px-4 py-3 space-y-1">
            <p className="font-medium text-steel-800">{editForm.full_name}</p>
            <p className="text-xs text-steel-500">{editForm.birth_date || '—'} · {editForm.birth_place || '—'}</p>
          </div>
        </ConfirmModal>
      )}

      {/* Delete Guardian Confirmation Modal */}
      {guardianToDelete && (
        <ConfirmModal
          title="Retirer le tuteur"
          message="Cette action retirera définitivement ce tuteur de la fiche de l'élève."
          requireMatch={student.matricule}
          danger
          confirmLabel="Retirer"
          saving={deletingGuardian}
          savingLabel="Suppression..."
          onCancel={() => setGuardianToDelete(null)}
          onConfirm={() => deleteGuardian(guardianToDelete.id)}
        >
          <div className="bg-steel-50 rounded-lg px-4 py-3 space-y-1">
            <p className="font-medium text-steel-800">{guardianToDelete.full_name}</p>
            <p className="text-xs text-steel-500">{guardianToDelete.phone || '—'} {guardianToDelete.relationship && `· ${guardianToDelete.relationship}`}</p>
          </div>
        </ConfirmModal>
      )}

      {/* Expel Confirmation Modal */}
      {showExpelConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-base font-medium text-steel-900 mb-1">Expulser l'élève</h2>
            <p className="text-sm text-steel-500 mb-4">Cette action est définitive pour cette année scolaire. Pour confirmer, saisissez le matricule de l'élève.</p>
            <div className="bg-red-50 rounded-lg px-4 py-3 mb-4">
              <p className="font-medium text-steel-800">{student.full_name}</p>
              <p className="text-xs text-steel-500 mt-0.5">{enrollment?.classroom_label}</p>
              <p className="text-xs font-mono text-steel-600 mt-1">Matricule: <strong>{student.matricule || '—'}</strong></p>
              <p className="text-xs text-red-500 mt-2">Ne comptera plus dans les effectifs ni les classements.</p>
            </div>
            <input type="text" value={expelMatriculeInput} onChange={e => setExpelMatriculeInput(e.target.value)}
              placeholder={`Saisir le matricule pour confirmer`}
              className="w-full px-3 py-2 border border-steel-300 rounded-lg text-sm font-mono focus:outline-none focus:border-red-400 mb-4" />
            <div className="flex gap-3">
              <button onClick={() => { setShowExpelConfirm(false); setExpelMatriculeInput('') }}
                className="flex-1 py-2.5 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50">Annuler</button>
              <button onClick={confirmExpel}
                disabled={expelling || expelMatriculeInput.trim() !== (student.matricule || '').trim()}
                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors">
                {expelling ? 'Expulsion...' : "Confirmer l'expulsion"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Out (left for another school) Confirmation Modal */}
      {showTransferOutConfirm && (
        <ConfirmModal
          title="Marquer comme transféré"
          message="L'élève a quitté l'établissement pour une autre école. Pour confirmer, saisissez le matricule de l'élève."
          requireMatch={student.matricule}
          confirmLabel="Confirmer le transfert"
          savingLabel="Enregistrement..."
          saving={transferringOut}
          onCancel={() => setShowTransferOutConfirm(false)}
          onConfirm={confirmTransferOut}
        >
          <div className="bg-blue-50 rounded-lg px-4 py-3">
            <p className="font-medium text-steel-800">{student.full_name}</p>
            <p className="text-xs text-steel-500 mt-0.5">{enrollment?.classroom_label}</p>
            <p className="text-xs font-mono text-steel-600 mt-1">Matricule: <strong>{student.matricule || '—'}</strong></p>
            <p className="text-xs text-blue-500 mt-2">
              Ne comptera plus dans les effectifs ni les classements. Pensez à enregistrer un éventuel remboursement dans Dépenses.
            </p>
          </div>
        </ConfirmModal>
      )}

      {/* Transfer Modal */}
      {showTransfer && <TransferModal studentId={id} student={student} enrollment={enrollment} onClose={() => setShowTransfer(false)} onDone={() => { setShowTransfer(false); fetchData() }} />}

      {/* Add Guardian Modal */}
      {showAddGuardian && <AddGuardianModal studentId={id} onClose={() => setShowAddGuardian(false)} onDone={() => { setShowAddGuardian(false); fetchData() }} />}
    </div>
  )
}

function TransferModal({ studentId, student, enrollment, onClose, onDone }) {
  const [classrooms, setClassrooms] = useState([])
  const [target, setTarget] = useState('')
  const [step, setStep] = useState(1)
  const [matriculeInput, setMatriculeInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api/classrooms').then(r => {
      const list = (r.data.classrooms || []).filter(c => c.id !== enrollment?.classroom_id)
      setClassrooms(list)
      if (list.length > 0) setTarget(String(list[0].id))
    })
  }, [enrollment?.classroom_id])

  const targetLabel = classrooms.find(c => String(c.id) === String(target))?.label || '—'
  const matriculeMatch = matriculeInput.trim().toLowerCase() === (student?.matricule || '').toLowerCase()

  async function confirm() {
    setSaving(true); setError('')
    try {
      await api.post(`/api/students/${studentId}/transfer`, { classroom_id: parseInt(target) })
      onDone()
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors du transfert')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        {step === 1 ? (
          <>
            <h2 className="text-base font-medium text-steel-900 mb-1">Changer de classe</h2>
            <p className="text-xs text-steel-500 mb-4">{student?.full_name}</p>
            <div className="mb-4">
              <label className="block text-xs text-steel-500 mb-1">Nouvelle classe</label>
              <select value={target} onChange={e => setTarget(e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand bg-white">
                {classrooms.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-2.5 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50">Annuler</button>
              <button onClick={() => setStep(2)} disabled={!target}
                className="flex-1 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-40 text-white rounded-lg text-sm font-medium">
                Continuer
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-base font-medium text-steel-900 mb-1">Confirmer le transfert</h2>
            <div className="bg-steel-50 rounded-lg px-4 py-3 my-4 text-sm text-steel-700">
              <p className="font-medium mb-1">{student?.full_name}</p>
              <p className="text-xs text-steel-500">
                {enrollment?.classroom_label || '—'}
                <span className="mx-2 text-steel-400">→</span>
                <span className="font-medium text-steel-700">{targetLabel}</span>
              </p>
            </div>
            <div className="mb-4">
              <label className="block text-xs text-steel-500 mb-1">
                Entrez le matricule pour confirmer — <span className="font-bold text-steel-800 select-all">{student?.matricule || '—'}</span>
              </label>
              <input
                type="text"
                value={matriculeInput}
                onChange={e => setMatriculeInput(e.target.value)}
                placeholder={student?.matricule || 'Matricule'}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none transition-colors ${
                  matriculeInput && !matriculeMatch ? 'border-red-300 focus:border-red-400' :
                  matriculeMatch ? 'border-brand focus:border-brand' : 'border-steel-200 focus:border-brand'
                }`}
              />
              {matriculeInput && !matriculeMatch && (
                <p className="text-xs text-red-500 mt-1">Matricule incorrect</p>
              )}
            </div>
            {error && <p className="text-red-500 text-xs mb-3">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => { setStep(1); setMatriculeInput('') }}
                className="flex-1 py-2.5 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50">
                Retour
              </button>
              <button onClick={confirm} disabled={saving || !matriculeMatch}
                className="flex-1 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-40 text-white rounded-lg text-sm font-medium">
                {saving ? 'Transfert...' : 'Confirmer'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function AddGuardianModal({ studentId, onClose, onDone }) {
  const [form, setForm] = useState({ full_name: '', phone: '', relationship: '', is_primary: false })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.full_name.trim()) return
    setSaving(true)
    try {
      await api.post(`/api/students/${studentId}/guardians`, form)
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-medium text-steel-900 mb-4">Ajouter un tuteur</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-steel-500 mb-1">Nom complet <span className="text-red-500">*</span></label>
            <input type="text" required value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
          </div>
          <div>
            <label className="block text-xs text-steel-500 mb-1">Téléphone</label>
            <input type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
          </div>
          <div>
            <label className="block text-xs text-steel-500 mb-1">Lien de parenté</label>
            <input type="text" value={form.relationship} onChange={e => setForm(p => ({ ...p, relationship: e.target.value }))}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" placeholder="Père, Mère, Oncle..." />
          </div>
          <label className="flex items-center gap-2 text-sm text-steel-600 cursor-pointer">
            <input type="checkbox" checked={form.is_primary} onChange={e => setForm(p => ({ ...p, is_primary: e.target.checked }))}
              className="rounded border-steel-300 text-brand focus:ring-brand" />
            Tuteur principal
          </label>
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

// ─── Bulletin history — every semester of every year, generated or not ──
// Lazy: only fetched once the section is opened, since it's a secondary
// view most visits to a student page won't need.
function BulletinHistorySection({ studentId }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [years, setYears] = useState(null)
  const navigate = useNavigate()

  function toggle() {
    if (!open && years === null) {
      setLoading(true)
      api.get(`/api/students/${studentId}/bulletin-history`).then(res => {
        setYears(res.data.years || [])
        setLoading(false)
      })
    }
    setOpen(o => !o)
  }

  return (
    <section className="bg-white rounded-xl border border-steel-200 p-6">
      <button onClick={toggle} className="flex items-center justify-between w-full">
        <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide">Bulletins</h2>
        <span className="text-xs text-steel-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        loading ? (
          <p className="text-sm text-steel-400 text-center py-4">Chargement...</p>
        ) : years.length === 0 ? (
          <p className="text-sm text-steel-400 text-center py-4">Aucune inscription trouvée.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {years.map(y => (
              <div key={y.academic_year_id}>
                <p className="text-sm font-medium text-steel-800 mb-2">{y.year_label} — {y.classroom_label}</p>
                <div className="flex flex-wrap gap-2">
                  {y.semesters.map(s => (
                    <button key={s.semester}
                      disabled={!s.snapshot_id}
                      onClick={() => navigate(`/report-cards/${s.snapshot_id}`)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        s.snapshot_id
                          ? 'border-brand text-brand hover:bg-brand-50 cursor-pointer'
                          : 'border-steel-200 text-steel-300 cursor-not-allowed'
                      }`}>
                      {s.semester === 1 ? '1er' : s.semester === 2 ? '2ème' : '3ème'} trimestre
                      {!s.snapshot_id && <span className="block text-[10px] font-normal">Non généré</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </section>
  )
}
