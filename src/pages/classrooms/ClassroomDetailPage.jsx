import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../../utils/api'
import ConfirmModal from '../../components/ConfirmModal'

export default function ClassroomDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [classroom, setClassroom] = useState(null)
  const [students, setStudents] = useState([])
  const [allClassrooms, setAllClassrooms] = useState([])
  const [subjects, setSubjects] = useState([])
  const [teacherList, setTeacherList] = useState([])
  const [savingSubject, setSavingSubject] = useState(null)
  const [pendingAssignment, setPendingAssignment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('students')
  const [selected, setSelected] = useState([])
  const [showBulkMove, setShowBulkMove] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [pendingMove, setPendingMove] = useState(null)
  const [movingStudent, setMovingStudent] = useState(false)

  async function fetchData() {
    const [detailRes, listRes, assignRes] = await Promise.all([
      api.get(`/api/classrooms/${id}`),
      api.get('/api/classrooms'),
      api.get(`/api/classrooms/${id}/assignments`),
    ])
    setClassroom(detailRes.data.classroom)
    setStudents(detailRes.data.students || [])
    setAllClassrooms((listRes.data.classrooms || []).filter(c => c.id !== parseInt(id)))
    setSubjects(assignRes.data.subjects || [])
    setTeacherList(assignRes.data.teachers || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [id])

  async function assignTeacher(subjectId, teacherId) {
    setSavingSubject(subjectId)
    // optimistic local update
    setSubjects(prev => prev.map(s => s.subject_id === subjectId ? { ...s, teacher_id: teacherId || null } : s))
    await api.post(`/api/classrooms/${id}/assignments`, { subject_id: subjectId, teacher_id: teacherId || null })
    await fetchData()
    setSavingSubject(null)
  }

  function toggleSelect(sid) {
    setSelected(prev => prev.includes(sid) ? prev.filter(x => x !== sid) : [...prev, sid])
  }

  function toggleAll() {
    setSelected(prev => prev.length === students.length ? [] : students.map(s => s.id))
  }

  async function moveStudent(studentId, targetId) {
    setMovingStudent(true)
    await api.post(`/api/students/${studentId}/transfer`, { classroom_id: targetId })
    setMovingStudent(false)
    setPendingMove(null)
    setSelected([])
    fetchData()
  }

  async function bulkMove(targetId) {
    await api.post(`/api/classrooms/${id}/bulk-transfer`, { student_ids: selected, target_classroom_id: targetId })
    setSelected([])
    setShowBulkMove(false)
    fetchData()
  }

  async function saveEdit() {
    await api.put(`/api/classrooms/${id}`, editForm)
    setEditing(false)
    fetchData()
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
  if (!classroom) return <p className="text-steel-500 py-20 text-center">Classe introuvable</p>

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <button onClick={() => navigate('/classrooms')} className="text-xs text-steel-400 hover:text-steel-600 mb-2 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Retour aux classes
        </button>
        <div className="flex items-start justify-between">
          <div>
            {!editing ? (
              <>
                <h1 className="text-xl font-medium text-steel-900">{classroom.label}</h1>
                <p className="text-sm text-steel-500 mt-0.5">{classroom.level_name} · {students.length}/{classroom.capacity} élèves</p>
              </>
            ) : (
              <div className="flex gap-3 items-end">
                <div>
                  <label className="block text-xs text-steel-500 mb-1">Nom</label>
                  <input type="text" value={editForm.label || ''} onChange={e => setEditForm(p => ({ ...p, label: e.target.value }))}
                    className="px-3 py-1.5 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
                </div>
                <div>
                  <label className="block text-xs text-steel-500 mb-1">Capacité</label>
                  <input type="number" value={editForm.capacity || ''} onChange={e => setEditForm(p => ({ ...p, capacity: parseInt(e.target.value) || 0 }))}
                    className="w-20 px-3 py-1.5 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
                </div>
                <button onClick={saveEdit} className="px-3 py-1.5 bg-brand text-white rounded-lg text-xs font-medium">Enregistrer</button>
                <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-steel-400 text-xs">Annuler</button>
              </div>
            )}
          </div>
          {!editing && (
            <button onClick={() => { setEditing(true); setEditForm({ label: classroom.label, capacity: classroom.capacity }) }}
              className="px-3 py-1.5 border border-steel-200 text-steel-600 rounded-lg text-xs font-medium hover:bg-steel-50">Modifier</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-steel-200">
        {[
          { key: 'students', label: `Élèves (${students.length})` },
          { key: 'subjects', label: `Matières (${subjects.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-brand text-brand' : 'border-transparent text-steel-500 hover:text-steel-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Students Tab */}
      {tab === 'students' && (
        <div>
          {selected.length > 0 && (
            <div className="bg-brand-50 border border-brand-100 rounded-lg p-3 mb-4 flex items-center justify-between">
              <p className="text-sm text-brand-600">{selected.length} élève(s) sélectionné(s)</p>
              <button onClick={() => setShowBulkMove(true)}
                className="px-3 py-1.5 bg-brand text-white rounded-lg text-xs font-medium">Déplacer vers...</button>
            </div>
          )}

          <div className="bg-white rounded-xl border border-steel-200 overflow-visible">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-steel-200 bg-steel-50">
                  <th className="w-10 px-4 py-3">
                    <input type="checkbox" checked={selected.length === students.length && students.length > 0}
                      onChange={toggleAll} className="rounded border-steel-300 text-brand focus:ring-brand" />
                  </th>
                  <th className="text-left px-4 py-3 text-steel-500 font-medium">Matricule</th>
                  <th className="text-left px-4 py-3 text-steel-500 font-medium">Nom complet</th>
                  <th className="text-left px-4 py-3 text-steel-500 font-medium">Sexe</th>
                  <th className="text-left px-4 py-3 text-steel-500 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-steel-400">Aucun élève dans cette classe</td></tr>
                ) : students.map(s => (
                  <tr key={s.id} className="border-b border-steel-100 hover:bg-steel-50 transition-colors">
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggleSelect(s.id)}
                        className="rounded border-steel-300 text-brand focus:ring-brand" />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-brand-600">{s.matricule || '—'}</td>
                    <td className="px-4 py-3 text-steel-800 font-medium cursor-pointer hover:text-brand" onClick={() => navigate(`/students/${s.id}`)}>
                      {s.full_name}
                    </td>
                    <td className="px-4 py-3 text-steel-600">{s.gender || '—'}</td>
                    <td className="px-4 py-3">
                      <MoveDropdown classrooms={allClassrooms} onMove={(targetId) => {
                        const target = allClassrooms.find(c => c.id === targetId)
                        setPendingMove({ studentId: s.id, studentName: s.full_name, targetId, targetLabel: target?.label || '—' })
                      }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subjects Tab — coefficient + assign teacher with confirmation */}
      {tab === 'subjects' && (
        <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
          {subjects.length === 0 ? (
            <p className="px-4 py-8 text-center text-steel-400 text-sm">Aucune matière configurée pour ce niveau</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-steel-200 bg-steel-50">
                  <th className="text-left px-4 py-3 text-steel-500 font-medium">Matière</th>
                  <th className="text-center px-4 py-3 text-steel-500 font-medium w-20">Coef.</th>
                  <th className="text-left px-4 py-3 text-steel-500 font-medium">Enseignant assigné</th>
                </tr>
              </thead>
              <tbody>
                {subjects.map(s => (
                  <tr key={s.subject_id} className="border-b border-steel-100">
                    <td className="px-4 py-3 text-steel-800 font-medium">{s.subject_name}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-0.5 bg-steel-100 text-steel-600 rounded text-xs font-medium">{s.coefficient ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <select
                          value={s.teacher_id || ''}
                          disabled={savingSubject === s.subject_id}
                          onChange={e => {
                            const newId = e.target.value ? parseInt(e.target.value) : null
                            const teacher = teacherList.find(t => t.id === newId)
                            setPendingAssignment({
                              subject_id: s.subject_id,
                              subject_name: s.subject_name,
                              teacher_id: newId,
                              teacher_name: teacher?.full_name || null,
                            })
                          }}
                          className="px-3 py-1.5 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand disabled:opacity-50 min-w-[220px]">
                          <option value="">— Non assigné —</option>
                          {teacherList.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                        </select>
                        {savingSubject === s.subject_id && <span className="text-xs text-brand animate-pulse">...</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {pendingAssignment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-base font-semibold text-steel-900 mb-1">Confirmer l'assignation</h2>
            <p className="text-sm text-steel-500 mb-4">Veuillez confirmer la modification avant d'enregistrer.</p>
            <div className="bg-steel-50 rounded-lg p-4 space-y-2 mb-5 text-sm">
              <div className="flex justify-between">
                <span className="text-steel-500">Matière</span>
                <span className="font-medium text-steel-800">{pendingAssignment.subject_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-steel-500">Classe</span>
                <span className="font-medium text-steel-800">{classroom.label}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-steel-500">Enseignant</span>
                <span className={`font-medium ${pendingAssignment.teacher_name ? 'text-brand' : 'text-steel-400 italic'}`}>
                  {pendingAssignment.teacher_name || 'Non assigné'}
                </span>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setPendingAssignment(null); fetchData() }}
                className="flex-1 py-2.5 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50">
                Annuler
              </button>
              <button onClick={async () => {
                const p = pendingAssignment
                setPendingAssignment(null)
                await assignTeacher(p.subject_id, p.teacher_id)
              }} className="flex-1 py-2.5 bg-brand hover:bg-brand-600 text-white rounded-lg text-sm font-medium">
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Move Modal */}
      {showBulkMove && (
        <BulkMoveModal
          count={selected.length}
          classrooms={allClassrooms}
          onClose={() => setShowBulkMove(false)}
          onMove={bulkMove}
        />
      )}

      {/* Single Move Confirmation Modal */}
      {pendingMove && (
        <ConfirmModal
          title="Déplacer l'élève"
          message="Confirmer le changement de classe."
          confirmLabel="Déplacer"
          saving={movingStudent}
          savingLabel="Déplacement..."
          onCancel={() => setPendingMove(null)}
          onConfirm={() => moveStudent(pendingMove.studentId, pendingMove.targetId)}
        >
          <div className="bg-steel-50 rounded-lg px-4 py-3 text-sm text-steel-700">
            <p className="font-medium mb-1">{pendingMove.studentName}</p>
            <p className="text-xs text-steel-500">
              {classroom.label}
              <span className="mx-2 text-steel-400">→</span>
              <span className="font-medium text-steel-700">{pendingMove.targetLabel}</span>
            </p>
          </div>
        </ConfirmModal>
      )}
    </div>
  )
}

function MoveDropdown({ classrooms, onMove }) {
  const [open, setOpen] = useState(false)
  const [openUp, setOpenUp] = useState(false)
  const btnRef = useRef(null)

  function handleOpen() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setOpenUp(window.innerHeight - rect.bottom < 200)
    }
    setOpen(!open)
  }

  if (classrooms.length === 0) return null

  return (
    <div className="relative">
      <button ref={btnRef} onClick={handleOpen} className="text-xs text-steel-400 hover:text-steel-600">Déplacer</button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className={`absolute right-0 bg-white border border-steel-200 rounded-lg shadow-lg z-20 py-1 w-48 max-h-48 overflow-y-auto ${openUp ? 'bottom-6' : 'top-6'}`}>
            {classrooms.map(c => (
              <button key={c.id} onClick={() => { onMove(c.id); setOpen(false) }}
                className="w-full text-left px-3 py-1.5 text-xs text-steel-700 hover:bg-steel-50">
                {c.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function BulkMoveModal({ count, classrooms, onClose, onMove }) {
  const [target, setTarget] = useState(classrooms[0]?.id || '')
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    if (!target) return
    setConfirming(true)
  }

  if (confirming) {
    const targetLabel = classrooms.find(c => String(c.id) === String(target))?.label || '—'
    return (
      <ConfirmModal
        title={`Déplacer ${count} élève(s)`}
        message={`Confirmer le déplacement vers ${targetLabel}.`}
        confirmLabel="Déplacer"
        saving={saving}
        savingLabel="Déplacement..."
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          setSaving(true)
          await onMove(parseInt(target))
        }}
      />
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-medium text-steel-900 mb-2">Déplacer {count} élève(s)</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-steel-500 mb-1">Classe cible</label>
            <select value={target} onChange={e => setTarget(e.target.value)}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand bg-white">
              {classrooms.map(c => <option key={c.id} value={c.id}>{c.label} ({c.student_count}/{c.capacity})</option>)}
            </select>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50">Annuler</button>
            <button type="submit" disabled={!target} className="flex-1 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
              Continuer
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
