import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../utils/api'

export default function ReportCardsPage() {
  const [classrooms, setClassrooms] = useState([])
  const [periodeCount, setPeriodeCount] = useState(3)
  const [semester, setSemester] = useState(1)
  const [classroomId, setClassroomId] = useState('')
  const [snapshots, setSnapshots] = useState([])
  const [generating, setGenerating] = useState(false)
  const [generateStep, setGenerateStep] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/api/grades/selectors').then(res => {
      setClassrooms(res.data.classrooms || [])
      setPeriodeCount(res.data.periode_count || 3)
    })
  }, [])

  async function loadSnapshots() {
    if (!classroomId) return
    setLoading(true)
    const res = await api.get(`/api/report-cards/list/${classroomId}/${semester}`)
    setSnapshots(res.data.snapshots || [])
    setLoading(false)
  }

  useEffect(() => { if (classroomId) loadSnapshots() }, [classroomId, semester])

  async function handleGenerate() {
    if (!classroomId) return
    setGenerating(true)
    setGenerateStep('Calcul des moyennes...')
    await api.post(`/api/grades/compute/${classroomId}/${semester}`)
    setGenerateStep('Génération des bulletins...')
    await api.post('/api/report-cards/generate', { classroom_id: parseInt(classroomId), semester })
    setGenerating(false)
    setGenerateStep('')
    loadSnapshots()
  }

  function handlePrintAll() {
    if (snapshots.length === 0) return
    navigate(`/report-cards/batch?classroomId=${classroomId}&semester=${semester}`)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-steel-900">Bulletins de notes</h1>
          <p className="text-sm text-steel-500 mt-0.5">Générer et imprimer les bulletins par classe</p>
        </div>
      </div>

      {/* Selectors */}
      <div className="flex gap-3 mb-6 items-end">
        <div>
          <label className="block text-xs text-steel-500 mb-1">Trimestre</label>
          <select value={semester} onChange={e => setSemester(parseInt(e.target.value))}
            className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
            {Array.from({ length: periodeCount }, (_, i) => i + 1).map(n => (
              <option key={n} value={n}>Trimestre {n}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-steel-500 mb-1">Classe</label>
          <select value={classroomId} onChange={e => setClassroomId(e.target.value)}
            className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
            <option value="">— Sélectionner —</option>
            {classrooms.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <button onClick={handleGenerate} disabled={!classroomId || generating}
          className="px-4 py-2 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
          {generating ? generateStep : 'Générer les bulletins'}
        </button>
        {snapshots.length > 0 && (
          <button onClick={handlePrintAll}
            className="px-4 py-2 border border-steel-200 text-steel-700 hover:bg-steel-50 rounded-lg text-sm font-medium transition-colors">
            Imprimer tout ({snapshots.length})
          </button>
        )}
      </div>

      {/* Snapshots list */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
      ) : !classroomId ? (
        <div className="bg-white rounded-xl border border-steel-200 p-12 text-center">
          <p className="text-steel-400 text-sm">Sélectionnez une classe</p>
        </div>
      ) : snapshots.length === 0 ? (
        <div className="bg-white rounded-xl border border-steel-200 p-12 text-center">
          <p className="text-steel-400 text-sm">Aucun bulletin généré. Cliquez sur "Générer les bulletins".</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-steel-200 bg-steel-50">
                <th className="text-left px-4 py-3 text-steel-500 font-medium">Matricule</th>
                <th className="text-left px-4 py-3 text-steel-500 font-medium">Nom complet</th>
                <th className="text-left px-4 py-3 text-steel-500 font-medium">Généré le</th>
                <th className="text-left px-4 py-3 text-steel-500 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map(s => (
                <tr key={s.id} className="border-b border-steel-100 hover:bg-steel-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-brand-600">{s.matricule || '—'}</td>
                  <td className="px-4 py-3 text-steel-800 font-medium">{s.full_name}</td>
                  <td className="px-4 py-3 text-steel-500 text-xs">{s.generated_at ? new Date(s.generated_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => navigate(`/report-cards/${s.id}`)}
                      className="text-xs text-brand hover:text-brand-600 font-medium">Voir / Imprimer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
