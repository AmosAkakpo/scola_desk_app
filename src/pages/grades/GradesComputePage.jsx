import { useState, useEffect } from 'react'
import api from '../../utils/api'

export default function GradesComputePage() {
  const [classrooms, setClassrooms] = useState([])
  const [periodeCount, setPeriodeCount] = useState(3)
  const [semester, setSemester] = useState(1)
  const [classroomId, setClassroomId] = useState('')
  const [summaries, setSummaries] = useState([])
  const [computing, setComputing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('results')

  useEffect(() => {
    api.get('/api/grades/selectors').then(res => {
      setClassrooms(res.data.classrooms || [])
      setPeriodeCount(res.data.periode_count || 3)
    })
  }, [])

  async function loadSummaries() {
    if (!classroomId) return
    setLoading(true)
    try {
      const res = await api.get(`/api/grades/summary/${classroomId}/${semester}`)
      setSummaries(res.data.summaries || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (classroomId) loadSummaries() }, [classroomId, semester])

  async function handleCompute() {
    if (!classroomId) return
    setComputing(true)
    try {
      await api.post(`/api/grades/compute/${classroomId}/${semester}`)
      loadSummaries()
    } finally {
      setComputing(false)
    }
  }

  const classStats = summaries.length > 0 ? {
    highest: summaries[0]?.class_highest_average,
    lowest: summaries[0]?.class_lowest_average,
    overall: summaries[0]?.class_overall_average,
    size: summaries[0]?.class_size,
  } : null

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-steel-900">Calcul et conseil de classe</h1>
          <p className="text-sm text-steel-500 mt-0.5">Moyennes, classements et décisions du conseil</p>
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
        <button onClick={handleCompute} disabled={!classroomId || computing}
          className="px-4 py-2 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
          {computing ? 'Calcul en cours...' : 'Calculer les moyennes'}
        </button>
      </div>

      {/* Stats */}
      {classStats && (
        <div className="grid grid-cols-4 gap-4 mb-4">
          {[
            { label: 'Effectif', value: classStats.size },
            { label: 'Moyenne de classe', value: classStats.overall?.toFixed(2) ?? '—', color: 'text-brand' },
            { label: 'Plus haute', value: classStats.highest?.toFixed(2) ?? '—' },
            { label: 'Plus basse', value: classStats.lowest?.toFixed(2) ?? '—' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-steel-200 p-4">
              <p className="text-xs text-steel-500">{s.label}</p>
              <p className={`text-lg font-medium mt-1 ${s.color || 'text-steel-900'}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      {classroomId && (
        <div className="flex gap-1 border-b border-steel-200 mb-4">
          {[
            { key: 'results', label: 'Résultats' },
            { key: 'decisions', label: 'Conseil de classe' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-brand text-brand' : 'border-transparent text-steel-500 hover:text-steel-700'}`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Results Tab */}
      {tab === 'results' && (
        loading ? (
          <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
        ) : !classroomId ? (
          <div className="bg-white rounded-xl border border-steel-200 p-12 text-center">
            <p className="text-steel-400 text-sm">Sélectionnez une classe</p>
          </div>
        ) : summaries.length === 0 ? (
          <div className="bg-white rounded-xl border border-steel-200 p-12 text-center">
            <p className="text-steel-400 text-sm">Aucun résultat. Cliquez sur "Calculer les moyennes".</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-steel-200 bg-steel-50">
                  <th className="text-center px-3 py-3 text-steel-500 font-medium w-14">Rang</th>
                  <th className="text-left px-4 py-3 text-steel-500 font-medium">Matricule</th>
                  <th className="text-left px-4 py-3 text-steel-500 font-medium">Nom complet</th>
                  <th className="text-center px-4 py-3 text-steel-500 font-medium">Points</th>
                  <th className="text-center px-4 py-3 text-steel-500 font-medium">Coeff</th>
                  <th className="text-center px-4 py-3 text-steel-700 font-semibold">Moyenne</th>
                  <th className="text-left px-4 py-3 text-steel-500 font-medium">Mention</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((s, i) => (
                  <tr key={s.student_id} className={`border-b border-steel-50 ${i % 2 === 0 ? '' : 'bg-steel-50/30'}`}>
                    <td className="px-3 py-2.5 text-center font-semibold text-brand">{s.class_rank ?? '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-steel-500">{s.matricule || '—'}</td>
                    <td className="px-4 py-2.5 text-steel-800 font-medium">{s.full_name}</td>
                    <td className="px-4 py-2.5 text-center text-steel-600">{s.total_weighted_points?.toFixed(2) ?? '—'}</td>
                    <td className="px-4 py-2.5 text-center text-steel-600">{s.total_coefficients ?? '—'}</td>
                    <td className="px-4 py-2.5 text-center font-semibold text-steel-900">{s.semester_average?.toFixed(2) ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      {s.mention && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          s.semester_average >= 16 ? 'bg-brand-50 text-brand-600' :
                          s.semester_average >= 14 ? 'bg-blue-50 text-blue-600' :
                          s.semester_average >= 12 ? 'bg-green-50 text-green-600' :
                          s.semester_average >= 10 ? 'bg-yellow-50 text-yellow-700' :
                          'bg-red-50 text-red-600'
                        }`}>{s.mention}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Decisions Tab */}
      {tab === 'decisions' && classroomId && (
        <DecisionsPanel classroomId={classroomId} semester={semester} />
      )}
    </div>
  )
}

// ─── Decisions Panel ─────────────────────────────────────────
function DecisionsPanel({ classroomId, semester }) {
  const [students, setStudents] = useState([])
  const [decisions, setDecisions] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    setLoading(true)
    api.get(`/api/decisions/${classroomId}/${semester}`).then(res => {
      setStudents(res.data.students || [])
      const map = {}
      ;(res.data.students || []).forEach(s => {
        const d = s.decision || {}
        map[s.student_id] = {
          conduite_score: d.conduite_score ?? '',
          avertissement: d.avertissement === 1,
          blame: d.blame === 1,
          exclusion_temporaire: d.exclusion_temporaire === 1,
          felicitation: d.felicitation === 1,
          encouragement: d.encouragement === 1,
          tableau_honneur: d.tableau_honneur === 1,
          conseil_decision: d.conseil_decision || '',
        }
      })
      setDecisions(map)
      setLoading(false)
    })
  }, [classroomId, semester])

  function update(studentId, field, value) {
    setDecisions(prev => ({ ...prev, [studentId]: { ...prev[studentId], [field]: value } }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const payload = Object.entries(decisions).map(([sid, d]) => ({
        student_id: parseInt(sid),
        conduite_score: d.conduite_score === '' ? null : parseFloat(d.conduite_score),
        avertissement: d.avertissement,
        blame: d.blame,
        exclusion_temporaire: d.exclusion_temporaire,
        felicitation: d.felicitation,
        encouragement: d.encouragement,
        tableau_honneur: d.tableau_honneur,
        conseil_decision: d.conseil_decision,
      }))
      await api.post(`/api/decisions/${classroomId}/${semester}`, { decisions: payload })
      setMsg('Enregistré')
      setTimeout(() => setMsg(''), 2000)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center py-8"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-steel-500">{students.length} élève(s)</p>
        <div className="flex items-center gap-3">
          {msg && <span className="text-xs text-brand font-medium">{msg}</span>}
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
            {saving ? 'Enregistrement...' : 'Enregistrer les décisions'}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {students.map(s => {
          const d = decisions[s.student_id] || {}
          return (
            <div key={s.student_id} className="bg-white rounded-xl border border-steel-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-medium text-steel-800">{s.full_name}</p>
                  <p className="text-xs text-steel-500">
                    Moy: <strong>{s.semester_average?.toFixed(2) ?? '—'}</strong>
                    {s.class_rank && <span className="ml-2">Rang: <strong>{s.class_rank}</strong></span>}
                    {s.mention && <span className="ml-2">{s.mention}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-steel-500">Conduite /20:</label>
                  <input type="number" min="0" max="20" step="0.5" value={d.conduite_score ?? ''}
                    onChange={e => update(s.student_id, 'conduite_score', e.target.value)}
                    className="w-16 px-2 py-1 border border-steel-200 rounded text-xs text-center focus:outline-none focus:border-brand" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                <div>
                  <p className="text-xs text-steel-400 mb-1">Sanctions</p>
                  {['avertissement', 'blame', 'exclusion_temporaire'].map(key => (
                    <label key={key} className="flex items-center gap-2 text-xs text-steel-600 cursor-pointer py-0.5">
                      <input type="checkbox" checked={d[key] || false} onChange={e => update(s.student_id, key, e.target.checked)}
                        className="rounded border-steel-300 text-red-500 focus:ring-red-500" />
                      {key === 'avertissement' ? 'Avertissement' : key === 'blame' ? 'Blâme' : 'Exclusion temporaire'}
                    </label>
                  ))}
                </div>
                <div>
                  <p className="text-xs text-steel-400 mb-1">Félicitations</p>
                  {['felicitation', 'encouragement', 'tableau_honneur'].map(key => (
                    <label key={key} className="flex items-center gap-2 text-xs text-steel-600 cursor-pointer py-0.5">
                      <input type="checkbox" checked={d[key] || false} onChange={e => update(s.student_id, key, e.target.checked)}
                        className="rounded border-steel-300 text-brand focus:ring-brand" />
                      {key === 'felicitation' ? 'Félicitation' : key === 'encouragement' ? 'Encouragement' : 'Tableau d\'honneur'}
                    </label>
                  ))}
                </div>
              </div>

              <div className="mt-2">
                <input type="text" value={d.conseil_decision || ''} onChange={e => update(s.student_id, 'conseil_decision', e.target.value)}
                  placeholder="Décision du conseil (ex: Admis en classe supérieure, Doit redoubler ses efforts...)"
                  className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-xs focus:outline-none focus:border-brand" />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
