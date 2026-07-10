import { useState, useEffect } from 'react'
import api from '../../utils/api'
import { useSettingsMsg } from './settingsShared'

// Affectations enseignants: start-of-year staffing — who teaches what.
// Separate from Structure académique on purpose: it's an operational task
// touched at a different time, not a structural setting.
export default function AssignmentsSettingsPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [msg, showMsg] = useSettingsMsg()

  function loadData() {
    api.get('/api/settings/academic').then(res => {
      setData(res.data)
      setLoading(false)
    })
  }

  useEffect(() => { loadData() }, [])

  async function reassignTeacher(assignId, newTeacherId) {
    await api.put(`/api/settings/teacher-assignment/${assignId}`, { teacher_id: parseInt(newTeacherId) })
    showMsg('Affectation modifiée')
    loadData()
  }

  async function removeAssignment(assignId) {
    await api.delete(`/api/settings/teacher-assignment/${assignId}`)
    showMsg('Affectation retirée')
    loadData()
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-6">
      <div className="h-5 text-right">{msg && <span className="text-sm text-brand font-medium">{msg}</span>}</div>

      <section className="bg-white rounded-xl border border-steel-200 p-6">
        <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide mb-4">Affectations enseignants</h2>
        <p className="text-xs text-steel-500 mb-4">Réaffecter ou supprimer des enseignants par classe et matière. Pour créer une nouvelle affectation, utilisez l'onglet Matières de la page Classes.</p>
        {data.assignments?.length === 0 ? (
          <p className="text-sm text-steel-400 text-center py-4">Aucune affectation</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-steel-200">
                <th className="text-left py-2 text-steel-500 font-medium">Classe</th>
                <th className="text-left py-2 text-steel-500 font-medium">Matière</th>
                <th className="text-left py-2 text-steel-500 font-medium">Enseignant</th>
                <th className="text-center py-2 text-steel-500 font-medium w-16">Action</th>
              </tr>
            </thead>
            <tbody>
              {data.assignments?.map(a => (
                <tr key={a.id} className="border-b border-steel-50">
                  <td className="py-2 text-steel-700">{a.classroom_label}</td>
                  <td className="py-2 text-steel-600">{a.subject_name}</td>
                  <td className="py-2">
                    <select value={a.teacher_id} onChange={e => reassignTeacher(a.id, e.target.value)}
                      className="px-2 py-1 border border-steel-200 rounded text-xs focus:outline-none focus:border-brand bg-white">
                      {data.teachers?.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                    </select>
                  </td>
                  <td className="py-2 text-center">
                    <button onClick={() => removeAssignment(a.id)} className="text-red-400 hover:text-red-500 text-xs">Retirer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
