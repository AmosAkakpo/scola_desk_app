import { useState, useEffect } from 'react'
import api from '../../utils/api'
import ConfirmModal from '../../components/ConfirmModal'
import { eq, useSettingsMsg, SaveConfirmModal } from './settingsShared'

// Structure académique: niveaux, classes, matières + configuration
// par niveau (évaluations, coefficients).
// Every mutation goes through an explicit Enregistrer + the app's confirm
// popup, reverting to the last-saved values on Annuler — no instant saves.
export default function StructureSettingsPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [assessConfigs, setAssessConfigs] = useState({})
  const [origAssessConfigs, setOrigAssessConfigs] = useState({})
  const [savingAssess, setSavingAssess] = useState(false)
  const [tab, setTab] = useState('levels')
  const [msg, showMsg] = useSettingsMsg()
  const [confirm, setConfirm] = useState({ show: false, label: '', onConfirm: null, onCancel: null })

  // Coefficients tab: pending (unsaved) edits keyed by level_subject id.
  // Selection key is "levelId:serieId" — on has-séries levels each série has
  // its own subject list (SVT série C ≠ SVT série D), so they are separate
  // dropdown entries instead of being mixed under one level.
  const [coefKey, setCoefKey] = useState('')
  const [coefEdits, setCoefEdits] = useState({})
  const [savingCoefs, setSavingCoefs] = useState(false)

  function loadData() {
    api.get('/api/settings/academic').then(res => {
      setData(res.data)
      const cfgs = res.data.assess_configs || {}
      setAssessConfigs(cfgs)
      setOrigAssessConfigs(JSON.parse(JSON.stringify(cfgs)))
      setCoefEdits({})
      setLoading(false)
    })
  }

  useEffect(() => { loadData() }, [])

  function askConfirm(label, hasChanged, fn, revertFn) {
    if (!hasChanged) { showMsg('Aucune modification à enregistrer'); return }
    setConfirm({ show: true, label, onConfirm: fn, onCancel: revertFn })
  }
  function closeConfirm() { setConfirm({ show: false, label: '', onConfirm: null, onCancel: null }) }

  // ─── Évaluations ───────────────────────────────────────────
  function updateAssessConfig(levelId, field, value) {
    setAssessConfigs(prev => ({ ...prev, [levelId]: { ...prev[levelId], [field]: parseInt(value) || 0 } }))
  }

  async function saveAssessConfigs() {
    setSavingAssess(true)
    const configs = Object.entries(assessConfigs).map(([levelId, cfg]) => ({ level_id: parseInt(levelId), ...cfg }))
    await api.put('/api/settings/assessment-config', { configs })
    setOrigAssessConfigs(JSON.parse(JSON.stringify(assessConfigs)))
    setSavingAssess(false)
    showMsg('Configuration des évaluations enregistrée')
  }

  // ─── Coefficients (batched) ────────────────────────────────
  // One dropdown entry per distinct (level, série) pair that has subjects:
  // "6ème", "1ère — Série C", "1ère — Série D", "1ère — Tronc commun"...
  const coefOptions = []
  for (const l of (data?.levels || [])) {
    const pairs = new Set((data?.level_subjects || []).filter(ls => ls.level_id === l.id).map(ls => ls.serie_id ?? 'null'))
    for (const sid of pairs) {
      const serie = sid === 'null' ? null : (data?.series || []).find(s => s.id === sid)
      coefOptions.push({
        key: `${l.id}:${sid}`,
        label: sid === 'null' ? (l.has_serie === 1 ? `${l.name} — Tronc commun` : l.name) : `${l.name} — Série ${serie?.name || '?'}`,
      })
    }
  }
  const activeCoefKey = coefKey || coefOptions[0]?.key || ''
  const [activeLevelId, activeSerieId] = activeCoefKey.split(':')
  const coefSubjects = (data?.level_subjects || []).filter(ls =>
    ls.level_id === parseInt(activeLevelId) && String(ls.serie_id ?? 'null') === activeSerieId
  )
  const coefHasChanges = coefSubjects.some(ls => coefEdits[ls.id] !== undefined && coefEdits[ls.id] !== ls.coefficient)

  async function saveCoefficients() {
    setSavingCoefs(true)
    for (const ls of coefSubjects) {
      const edited = coefEdits[ls.id]
      if (edited !== undefined && edited !== ls.coefficient) {
        await api.put(`/api/settings/level-subject/${ls.id}`, { coefficient: edited })
      }
    }
    setSavingCoefs(false)
    showMsg('Coefficients enregistrés')
    loadData()
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-6">
      <div className="h-5 text-right">{msg && <span className="text-sm text-brand font-medium">{msg}</span>}</div>

      <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
        <div className="flex border-b border-steel-200">
          {[
            { key: 'levels', label: 'Niveaux' },
            { key: 'classrooms', label: 'Classes' },
            { key: 'subjects', label: 'Matières' },
            { key: 'assessments', label: 'Évaluations' },
            { key: 'coefficients', label: 'Coefficients' },
            { key: 'examens', label: 'Examens nationaux' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-brand text-brand' : 'border-transparent text-steel-500 hover:text-steel-700'}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* Assessment config tab */}
          {tab === 'assessments' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs text-steel-500">Nombre d'évaluations par trimestre et par niveau</p>
                <button
                  onClick={() => askConfirm('Évaluations', !eq(assessConfigs, origAssessConfigs), saveAssessConfigs, () => setAssessConfigs(JSON.parse(JSON.stringify(origAssessConfigs))))}
                  disabled={savingAssess}
                  className="px-3 py-1.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium">
                  {savingAssess ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-steel-200">
                    <th className="text-left py-2 text-steel-500 font-medium">Niveau</th>
                    <th className="text-center py-2 text-steel-500 font-medium">Interrogations</th>
                    <th className="text-center py-2 text-steel-500 font-medium">Devoirs</th>
                    <th className="text-center py-2 text-steel-500 font-medium">Compositions</th>
                    <th className="text-center py-2 text-steel-500 font-medium">Note /</th>
                  </tr>
                </thead>
                <tbody>
                  {data.levels?.map(l => {
                    const c = assessConfigs[l.id] || {}
                    return (
                      <tr key={l.id} className="border-b border-steel-50">
                        <td className="py-2 text-steel-700 font-medium">{l.name}</td>
                        {['interrogations', 'devoirs', 'compositions'].map(field => (
                          <td key={field} className="py-2 text-center">
                            <select value={c[field] || 0} onChange={e => updateAssessConfig(l.id, field, e.target.value)}
                              className="w-14 px-1 py-1 border border-steel-200 rounded text-xs text-center focus:outline-none focus:border-brand bg-white">
                              {(field === 'interrogations' ? [0,1,2,3,4,5,6] : field === 'devoirs' ? [0,1,2,3] : [0,1,2]).map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                          </td>
                        ))}
                        <td className="py-2 text-center">
                          <select value={c.max_score || 20} onChange={e => updateAssessConfig(l.id, 'max_score', e.target.value)}
                            className="w-14 px-1 py-1 border border-steel-200 rounded text-xs text-center focus:outline-none focus:border-brand bg-white">
                            {[10,20,100].map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Coefficients tab — level dropdown + batched save */}
          {tab === 'coefficients' && (
            <div>
              <div className="flex items-center justify-between mb-4 gap-3">
                <div className="flex items-center gap-3">
                  <label className="text-xs text-steel-500">Niveau :</label>
                  <select value={activeCoefKey}
                    onChange={e => { setCoefKey(e.target.value); setCoefEdits({}) }}
                    className="px-3 py-1.5 border border-steel-200 rounded-lg text-xs bg-white focus:outline-none focus:border-brand">
                    {coefOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                </div>
                <button
                  onClick={() => askConfirm('Coefficients', coefHasChanges, saveCoefficients, () => setCoefEdits({}))}
                  disabled={savingCoefs}
                  className="px-3 py-1.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium">
                  {savingCoefs ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
              <p className="text-xs text-steel-500 mb-3">Les changements ne sont appliqués qu'après confirmation.</p>
              {coefSubjects.length === 0 ? (
                <p className="text-sm text-steel-400 text-center py-4">Aucune matière pour ce niveau</p>
              ) : (
                <div className="space-y-1">
                  {coefSubjects.map(ls => {
                    const current = coefEdits[ls.id] ?? ls.coefficient
                    const changed = coefEdits[ls.id] !== undefined && coefEdits[ls.id] !== ls.coefficient
                    return (
                      <div key={ls.id} className="flex items-center gap-3">
                        <span className="text-xs text-steel-600 w-48">{ls.subject_name}</span>
                        <select value={current}
                          onChange={e => setCoefEdits(prev => ({ ...prev, [ls.id]: parseInt(e.target.value) || 1 }))}
                          className={`w-14 px-1 py-1 border rounded text-xs text-center focus:outline-none focus:border-brand bg-white ${changed ? 'border-brand text-brand font-medium' : 'border-steel-200'}`}>
                          {[1,2,3,4,5,6].map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        {changed && <span className="text-xs text-steel-400">était {ls.coefficient}</span>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Levels tab */}
          {tab === 'levels' && (
            <LevelsManager onUpdate={loadData} showMsg={showMsg} askConfirm={askConfirm} series={data?.series || []} />
          )}

          {/* Classrooms tab */}
          {tab === 'classrooms' && (
            <ClassroomsManager data={data} onUpdate={loadData} showMsg={showMsg} />
          )}

          {/* Subjects tab */}
          {tab === 'subjects' && (
            <SubjectsManager data={data} onUpdate={loadData} showMsg={showMsg} />
          )}

          {/* National exams tab */}
          {tab === 'examens' && (
            <ExamensManager data={data} onUpdate={loadData} showMsg={showMsg} />
          )}
        </div>
      </div>

      <SaveConfirmModal confirm={confirm} onClose={closeConfirm} />
    </div>
  )
}

// ─── Levels Manager ──────────────────────────────────────────
function LevelsManager({ onUpdate, showMsg, askConfirm, series }) {
  const [levels, setLevels] = useState([])
  const [selected, setSelected] = useState([])
  const [origSelected, setOrigSelected] = useState([])
  const [saving, setSaving] = useState(false)
  const [newSerie, setNewSerie] = useState({ level_id: '', name: '' })
  const [addingSerie, setAddingSerie] = useState(false)

  async function addSerie(e) {
    e.preventDefault()
    if (!newSerie.level_id || !newSerie.name.trim()) return
    setAddingSerie(true)
    await api.post('/api/settings/series', { level_id: parseInt(newSerie.level_id), name: newSerie.name.trim() })
    setNewSerie(p => ({ ...p, name: '' }))
    setAddingSerie(false)
    showMsg('Série ajoutée')
    onUpdate()
  }

  useEffect(() => {
    api.get('/api/settings/levels').then(res => {
      setLevels(res.data.levels || [])
      const active = (res.data.levels || []).filter(l => l.is_active === 1).map(l => l.id)
      setSelected(active)
      setOrigSelected([...active])
    })
  }, [])

  function toggle(id) { setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]) }

  async function save() {
    setSaving(true)
    await api.put('/api/settings/levels', { level_ids: selected })
    setOrigSelected([...selected])
    setSaving(false)
    showMsg('Niveaux mis à jour')
    onUpdate()
  }

  const hasChanged = JSON.stringify([...selected].sort()) !== JSON.stringify([...origSelected].sort())

  const groups = [
    { title: 'Primaire', items: levels.filter(l => l.level_code <= 7) },
    { title: 'Collège', items: levels.filter(l => l.level_code >= 8 && l.level_code <= 11) },
    { title: 'Lycée', items: levels.filter(l => l.level_code >= 12) },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-steel-500">Activez ou désactivez les niveaux enseignés par votre école.</p>
        <button onClick={() => askConfirm('Niveaux', hasChanged, save, () => setSelected([...origSelected]))} disabled={saving}
          className="px-3 py-1.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium">
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>
      {groups.filter(g => g.items.length > 0).map(g => (
        <div key={g.title} className="mb-4">
          <p className="text-xs font-medium text-steel-500 mb-2">{g.title}</p>
          <div className="flex flex-wrap gap-2">
            {g.items.map(l => (
              <button key={l.id} onClick={() => toggle(l.id)}
                className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${selected.includes(l.id) ? 'border-brand bg-brand-50 text-brand-600' : 'border-steel-200 text-steel-400'}`}>
                {l.name}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Séries per has_serie level */}
      <div className="mt-6 pt-4 border-t border-steel-100">
        <p className="text-xs font-medium text-steel-700 mb-2">Séries (2nde, 1ère, Terminale)</p>
        <div className="space-y-2 mb-3">
          {levels.filter(l => l.has_serie === 1 && selected.includes(l.id)).map(l => {
            const levelSeries = series.filter(s => s.level_id === l.id)
            return (
              <div key={l.id} className="flex items-center gap-3">
                <span className="text-xs text-steel-600 w-20">{l.name}</span>
                <div className="flex flex-wrap gap-1">
                  {levelSeries.length === 0
                    ? <span className="text-xs text-steel-400 italic">Aucune série</span>
                    : levelSeries.map(s => (
                      <span key={s.id} className="px-2 py-0.5 bg-steel-100 rounded text-xs text-steel-600">Série {s.name}</span>
                    ))}
                </div>
              </div>
            )
          })}
        </div>
        <form onSubmit={addSerie} className="flex gap-2 items-end">
          <select value={newSerie.level_id} onChange={e => setNewSerie(p => ({ ...p, level_id: e.target.value }))}
            className="px-2 py-1.5 border border-steel-200 rounded-lg text-xs bg-white focus:outline-none focus:border-brand">
            <option value="">Niveau</option>
            {levels.filter(l => l.has_serie === 1 && selected.includes(l.id)).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <input type="text" value={newSerie.name} onChange={e => setNewSerie(p => ({ ...p, name: e.target.value }))}
            placeholder="Ex: A1, B, C, D" maxLength={4}
            className="w-28 px-2 py-1.5 border border-steel-200 rounded-lg text-xs focus:outline-none focus:border-brand" />
          <button type="submit" disabled={addingSerie || !newSerie.level_id || !newSerie.name.trim()}
            className="px-3 py-1.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium">
            {addingSerie ? 'Ajout...' : 'Ajouter la série'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Classrooms Manager ──────────────────────────────────────
function ClassroomsManager({ data, onUpdate, showMsg }) {
  const [form, setForm] = useState({ label: '', level_id: '', serie_id: '', capacity: 50 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmAdd, setConfirmAdd] = useState(false)

  const activeLevels = data?.levels || []
  const levelSeries = (data?.series || []).filter(s => s.level_id === parseInt(form.level_id))

  function requestAdd(e) {
    e.preventDefault()
    if (!form.label.trim() || !form.level_id) { setError('Nom et niveau requis'); return }
    // A classroom on a has-séries level without a série would get ZERO
    // subjects/templates (subjects there are all série-specific).
    if (levelSeries.length > 0 && !form.serie_id) { setError('Sélectionnez une série pour ce niveau'); return }
    setError('')
    setConfirmAdd(true)
  }

  async function handleAdd() {
    setSaving(true)
    try {
      await api.post('/api/settings/classrooms', { label: form.label, level_id: parseInt(form.level_id), serie_id: form.serie_id ? parseInt(form.serie_id) : null, capacity: form.capacity })
      setForm({ label: '', level_id: '', serie_id: '', capacity: 50 })
      showMsg('Classe ajoutée')
      onUpdate()
    } catch (err) { setError(err.response?.data?.message || 'Erreur') }
    setSaving(false)
    setConfirmAdd(false)
  }

  return (
    <div>
      <p className="text-xs text-steel-500 mb-4">Ajouter une nouvelle classe pour l'année en cours. Les modèles d'évaluation seront générés automatiquement.</p>
      <form onSubmit={requestAdd} className="grid grid-cols-5 gap-3 items-end">
        <div>
          <label className="block text-xs text-steel-500 mb-1">Nom *</label>
          <input type="text" value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} placeholder="Ex: 6ème C"
            className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-xs focus:outline-none focus:border-brand" />
        </div>
        <div>
          <label className="block text-xs text-steel-500 mb-1">Niveau *</label>
          <select value={form.level_id} onChange={e => setForm(p => ({ ...p, level_id: e.target.value, serie_id: '' }))}
            className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-xs focus:outline-none focus:border-brand bg-white">
            <option value="">—</option>
            {activeLevels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-steel-500 mb-1">Série {levelSeries.length > 0 && '*'}</label>
          <select value={form.serie_id} onChange={e => setForm(p => ({ ...p, serie_id: e.target.value }))}
            disabled={levelSeries.length === 0}
            className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-xs focus:outline-none focus:border-brand bg-white disabled:bg-steel-50 disabled:text-steel-400">
            <option value="">{levelSeries.length === 0 ? '—' : '— Sélectionner —'}</option>
            {levelSeries.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-steel-500 mb-1">Capacité</label>
          <input type="number" value={form.capacity} onChange={e => setForm(p => ({ ...p, capacity: parseInt(e.target.value) || 50 }))}
            className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-xs focus:outline-none focus:border-brand" />
        </div>
        <button type="submit" disabled={saving} className="px-3 py-1.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium">
          {saving ? 'Ajout...' : 'Ajouter'}
        </button>
      </form>
      {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
      <p className="text-xs text-steel-400 mt-3">{data?.classrooms?.length || 0} classe(s) existante(s). Gérez les classes existantes depuis la page Classes.</p>

      {confirmAdd && (
        <ConfirmModal
          title="Ajouter la classe"
          message="Les modèles d'évaluation seront générés automatiquement pour cette classe."
          confirmLabel="Ajouter"
          saving={saving}
          savingLabel="Ajout..."
          onCancel={() => setConfirmAdd(false)}
          onConfirm={handleAdd}
        >
          <div className="bg-steel-50 rounded-lg px-4 py-3 text-sm">
            <p className="font-medium text-steel-800">{form.label}</p>
            <p className="text-xs text-steel-500 mt-0.5">
              {activeLevels.find(l => l.id === parseInt(form.level_id))?.name || '—'}
              {form.serie_id && ` · Série ${levelSeries.find(s => s.id === parseInt(form.serie_id))?.name || ''}`}
              {' '}· capacité {form.capacity}
            </p>
          </div>
        </ConfirmModal>
      )}
    </div>
  )
}

// ─── Subjects Manager ────────────────────────────────────────
function SubjectsManager({ data, onUpdate, showMsg }) {
  const [newSubject, setNewSubject] = useState({ name: '', short_code: '' })
  const [addToLevel, setAddToLevel] = useState({ level_id: '', serie_id: '', subject_id: '', coefficient: 1 })
  const [saving, setSaving] = useState(false)
  const [removeTarget, setRemoveTarget] = useState(null) // { id, subject_name, level_name }
  const [removing, setRemoving] = useState(false)

  const assignSeries = (data?.series || []).filter(s => s.level_id === addToLevel.level_id)

  async function handleAddSubject(e) {
    e.preventDefault()
    if (!newSubject.name.trim()) return
    setSaving(true)
    try {
      await api.post('/api/settings/subjects', newSubject)
      setNewSubject({ name: '', short_code: '' })
      showMsg('Matière ajoutée')
      onUpdate()
    } catch (err) { alert(err.response?.data?.message || 'Erreur') }
    setSaving(false)
  }

  async function handleAssignToLevel(e) {
    e.preventDefault()
    if (!addToLevel.level_id || !addToLevel.subject_id) return
    await api.post('/api/settings/level-subject', addToLevel)
    setAddToLevel(p => ({ ...p, subject_id: '', coefficient: 1 }))
    showMsg('Matière assignée')
    onUpdate()
  }

  async function confirmRemoveFromLevel() {
    setRemoving(true)
    await api.delete(`/api/settings/level-subject/${removeTarget.id}`)
    setRemoving(false)
    setRemoveTarget(null)
    showMsg('Matière retirée')
    onUpdate()
  }

  return (
    <div className="space-y-6">
      {/* Add new subject */}
      <div>
        <p className="text-xs font-medium text-steel-700 mb-2">Ajouter une nouvelle matière</p>
        <form onSubmit={handleAddSubject} className="flex gap-3 items-end">
          <div className="flex-1">
            <input type="text" value={newSubject.name} onChange={e => setNewSubject(p => ({ ...p, name: e.target.value }))} placeholder="Nom de la matière"
              className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-xs focus:outline-none focus:border-brand" />
          </div>
          <div className="w-24">
            <input type="text" value={newSubject.short_code} onChange={e => setNewSubject(p => ({ ...p, short_code: e.target.value }))} placeholder="Code"
              className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-xs focus:outline-none focus:border-brand" />
          </div>
          <button type="submit" disabled={saving} className="px-3 py-1.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium">Ajouter</button>
        </form>
      </div>

      {/* Assign subject to level */}
      <div>
        <p className="text-xs font-medium text-steel-700 mb-2">Assigner une matière à un niveau</p>
        <form onSubmit={handleAssignToLevel} className="flex gap-2 items-end flex-wrap">
          <select value={addToLevel.level_id} onChange={e => setAddToLevel(p => ({ ...p, level_id: parseInt(e.target.value) || '', serie_id: '' }))}
            className="px-2 py-1.5 border border-steel-200 rounded-lg text-xs bg-white focus:outline-none focus:border-brand">
            <option value="">Niveau</option>
            {data?.levels?.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          {assignSeries.length > 0 && (
            <select value={addToLevel.serie_id} onChange={e => setAddToLevel(p => ({ ...p, serie_id: parseInt(e.target.value) || '' }))}
              className="px-2 py-1.5 border border-steel-200 rounded-lg text-xs bg-white focus:outline-none focus:border-brand">
              <option value="">Toutes les séries (commun)</option>
              {assignSeries.map(s => <option key={s.id} value={s.id}>Série {s.name}</option>)}
            </select>
          )}
          <select value={addToLevel.subject_id} onChange={e => setAddToLevel(p => ({ ...p, subject_id: parseInt(e.target.value) || '' }))}
            className="px-2 py-1.5 border border-steel-200 rounded-lg text-xs bg-white focus:outline-none focus:border-brand">
            <option value="">Matière</option>
            {data?.subjects?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={addToLevel.coefficient} onChange={e => setAddToLevel(p => ({ ...p, coefficient: parseInt(e.target.value) || 1 }))}
            className="w-16 px-2 py-1.5 border border-steel-200 rounded-lg text-xs bg-white focus:outline-none focus:border-brand">
            {[1,2,3,4,5,6,7,8].map(c => <option key={c} value={c}>Coef {c}</option>)}
          </select>
          <button type="submit" className="px-3 py-1.5 bg-brand hover:bg-brand-600 text-white rounded-lg text-xs font-medium">Assigner</button>
        </form>
      </div>

      {/* Current assignments by level */}
      <div>
        <p className="text-xs font-medium text-steel-700 mb-2">Matières actuelles par niveau</p>
        {data?.levels?.map(l => {
          const subs = data.level_subjects?.filter(ls => ls.level_id === l.id) || []
          if (subs.length === 0) return null
          return (
            <div key={l.id} className="mb-3">
              <p className="text-xs text-steel-600 mb-1">{l.name}</p>
              <div className="flex flex-wrap gap-1">
                {subs.map(ls => (
                  <span key={ls.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-steel-100 rounded text-xs text-steel-600">
                    {ls.subject_name}
                    {ls.serie_name && <span className="text-brand-600 font-medium">{ls.serie_name}</span>}
                    <span className="text-steel-400">(c{ls.coefficient})</span>
                    <button onClick={() => setRemoveTarget({ id: ls.id, subject_name: ls.subject_name, level_name: l.name + (ls.serie_name ? ` — Série ${ls.serie_name}` : '') })}
                      className="text-red-400 hover:text-red-500 ml-0.5">×</button>
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {removeTarget && (
        <ConfirmModal
          title="Retirer la matière du niveau"
          message="La matière ne sera plus enseignée à ce niveau. Les notes déjà saisies ne seront plus visibles sur les bulletins de ce niveau."
          danger
          confirmLabel="Retirer"
          saving={removing}
          savingLabel="Retrait..."
          onCancel={() => setRemoveTarget(null)}
          onConfirm={confirmRemoveFromLevel}
        >
          <div className="bg-steel-50 rounded-lg px-4 py-3 text-sm">
            <p className="font-medium text-steel-800">{removeTarget.subject_name}</p>
            <p className="text-xs text-steel-500 mt-0.5">{removeTarget.level_name}</p>
          </div>
        </ConfirmModal>
      )}
    </div>
  )
}

// ─── Examens Nationaux Manager ───────────────────────────────
// Which levels are exam cohorts (CEP/BEPC/BAC style) + the passing
// criteria used by the Fin d'année promotion flow. Independent from the
// `data` prop (which comes from /api/settings/academic) since this reads
// its own dedicated endpoints.
function ExamensManager({ onUpdate, showMsg }) {
  const [levels, setLevels] = useState([])
  const [rules, setRules] = useState([])
  const [editing, setEditing] = useState(null) // level being toggled on: { id, name }
  const [examName, setExamName] = useState('')
  const [saving, setSaving] = useState(false)

  function load() {
    Promise.all([
      api.get('/api/promotion/exam-cohort-levels'),
      api.get('/api/promotion/exam-rules'),
    ]).then(([lvl, r]) => {
      setLevels(lvl.data.levels || [])
      setRules(r.data.rules || [])
    })
  }

  useEffect(() => { load() }, [])

  async function toggleCohort(level) {
    if (level.is_exam_cohort) {
      await api.put(`/api/promotion/exam-cohort-levels/${level.id}`, { is_exam_cohort: false, exam_name: null })
      showMsg('Examen retiré')
      load()
      onUpdate?.()
    } else {
      setEditing(level)
      setExamName('')
    }
  }

  async function confirmEnableCohort() {
    if (!examName.trim()) return
    setSaving(true)
    await api.put(`/api/promotion/exam-cohort-levels/${editing.id}`, { is_exam_cohort: true, exam_name: examName.trim() })
    setSaving(false)
    setEditing(null)
    showMsg('Examen configuré')
    load()
    onUpdate?.()
  }

  async function updateRule(examType, field, value) {
    const rule = rules.find(r => r.exam_type === examType) || { mode: 'moyenne_only', min_moyenne: 10 }
    const updated = { ...rule, [field]: value }
    setRules(prev => prev.map(r => r.exam_type === examType ? updated : r))
    await api.put(`/api/promotion/exam-rules/${examType}`, { mode: updated.mode, min_moyenne: parseFloat(updated.min_moyenne) })
  }

  const cohortLevels = levels.filter(l => l.is_exam_cohort)

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-steel-500 mb-3">
          Désignez quels niveaux se terminent par un examen national (CEP, BEPC, BAC...). Utilisé par la promotion de fin d'année.
        </p>
        <div className="flex flex-wrap gap-2">
          {levels.map(l => (
            <button key={l.id} onClick={() => toggleCohort(l)}
              className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${l.is_exam_cohort ? 'border-brand bg-brand-50 text-brand-600' : 'border-steel-200 text-steel-400'}`}>
              {l.name}{l.is_exam_cohort && ` — ${l.exam_name}`}
            </button>
          ))}
        </div>
      </div>

      {cohortLevels.length > 0 && (
        <div>
          <p className="text-xs font-medium text-steel-700 mb-2">Critères de passage</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-steel-200">
                <th className="text-left py-2 text-steel-500 font-medium">Examen</th>
                <th className="text-left py-2 text-steel-500 font-medium">Mode</th>
                <th className="text-center py-2 text-steel-500 font-medium">Moyenne minimale</th>
              </tr>
            </thead>
            <tbody>
              {cohortLevels.map(l => {
                const rule = rules.find(r => r.exam_type === l.exam_name) || { mode: 'moyenne_only', min_moyenne: 10 }
                return (
                  <tr key={l.id} className="border-b border-steel-50">
                    <td className="py-2 text-steel-700 font-medium">{l.exam_name} ({l.name})</td>
                    <td className="py-2">
                      <select value={rule.mode} onChange={e => updateRule(l.exam_name, 'mode', e.target.value)}
                        className="px-2 py-1 border border-steel-200 rounded text-xs bg-white focus:outline-none focus:border-brand">
                        <option value="moyenne_only">Moyenne de l'année seulement</option>
                        <option value="exam_only">Examen national seulement</option>
                        <option value="both">Moyenne ET examen national</option>
                      </select>
                    </td>
                    <td className="py-2 text-center">
                      <input type="number" step="0.5" min="0" max="20" value={rule.min_moyenne}
                        onChange={e => updateRule(l.exam_name, 'min_moyenne', e.target.value)}
                        className="w-16 px-1 py-1 border border-steel-200 rounded text-xs text-center focus:outline-none focus:border-brand" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="text-xs text-steel-400 mt-2">Les changements sont enregistrés immédiatement.</p>
        </div>
      )}

      {editing && (
        <ConfirmModal
          title="Configurer l'examen"
          message={`Nom de l'examen pour ${editing.name} (ex: CEP, BEPC, BAC).`}
          confirmLabel="Confirmer"
          saving={saving}
          savingLabel="Enregistrement..."
          onCancel={() => setEditing(null)}
          onConfirm={confirmEnableCohort}
        >
          <input type="text" value={examName} onChange={e => setExamName(e.target.value)} autoFocus
            placeholder="Ex: BEPC" maxLength={20}
            className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
        </ConfirmModal>
      )}
    </div>
  )
}
