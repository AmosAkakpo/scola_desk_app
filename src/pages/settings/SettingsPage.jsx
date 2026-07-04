import { useState, useEffect } from 'react'
import api from '../../utils/api'

export default function SettingsPage() {
  const [logo, setLogo] = useState(null)
  const [scale, setScale] = useState([])
  const [sections, setSections] = useState([])
  const [congCfg, setCongCfg] = useState({ avg_floor: 10, felicitation_percentile: 20, tableau_top_n: 5 })
  const [conseilRanges, setConseilRanges] = useState([])
  const [defaultConduite, setDefaultConduite] = useState(18)
  const [passageCutoff, setPassageCutoff] = useState(10)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})
  const [msg, setMsg] = useState('')
  const [confirm, setConfirm] = useState({ show: false, label: '', onConfirm: null, onCancel: null })
  // Snapshots of last-saved values — used to detect changes and to revert on Annuler
  const [origScale, setOrigScale] = useState([])
  const [origSections, setOrigSections] = useState([])
  const [origConduite, setOrigConduite] = useState(18)
  const [origPassage, setOrigPassage] = useState(10)
  const [origCongCfg, setOrigCongCfg] = useState({ avg_floor: 10, felicitation_percentile: 20, tableau_top_n: 5 })
  const [origConseilRanges, setOrigConseilRanges] = useState([])

  useEffect(() => {
    api.get('/api/settings').then(res => {
      const scaleVal = res.data.appreciation_scale || []
      const sectionsVal = res.data.school_sections || []
      const conduiteVal = res.data.default_conduite_score ?? 18
      const passageVal = res.data.passage_cutoff ?? 10
      const congVal = res.data.congratulations_config || { avg_floor: 10, felicitation_percentile: 20, tableau_top_n: 5 }
      const conseilVal = res.data.conseil_decision_ranges || []
      setScale(scaleVal); setOrigScale(JSON.parse(JSON.stringify(scaleVal)))
      setSections(sectionsVal); setOrigSections(JSON.parse(JSON.stringify(sectionsVal)))
      setLogo(res.data.school_logo_path)
      setCongCfg(congVal); setOrigCongCfg(JSON.parse(JSON.stringify(congVal)))
      setConseilRanges(conseilVal); setOrigConseilRanges(JSON.parse(JSON.stringify(conseilVal)))
      setDefaultConduite(conduiteVal); setOrigConduite(conduiteVal)
      setPassageCutoff(passageVal); setOrigPassage(passageVal)
      setLoading(false)
    })
  }, [])

  function showMsg(text) { setMsg(text); setTimeout(() => setMsg(''), 2000) }

  function askConfirm(label, hasChanged, fn, revertFn) {
    if (!hasChanged) { showMsg('Aucune modification à enregistrer'); return }
    setConfirm({ show: true, label, onConfirm: fn, onCancel: revertFn })
  }
  function closeConfirm() { setConfirm({ show: false, label: '', onConfirm: null, onCancel: null }) }
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

  // ─── Logo ──────────────────────────────────────────────────
  async function uploadLogo(file) {
    setSaving(p => ({ ...p, logo: true }))
    const buf = await file.arrayBuffer()
    const res = await api.post('/api/settings/school-logo', buf, { headers: { 'Content-Type': 'application/octet-stream' } })
    setLogo(res.data.path)
    setSaving(p => ({ ...p, logo: false }))
    showMsg('Logo enregistré')
  }

  async function removeLogo() {
    await api.delete('/api/settings/school-logo')
    setLogo(null)
    showMsg('Logo supprimé')
  }

  // ─── Appreciation Scale ────────────────────────────────────
  function updateScale(i, field, value) {
    setScale(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: field === 'label' ? value : parseFloat(value) || 0 } : s))
  }

  function addScaleRow() {
    setScale(prev => [...prev, { min: 0, max: 0, label: '' }])
  }

  function removeScaleRow(i) {
    setScale(prev => prev.filter((_, idx) => idx !== i))
  }

  async function saveScale() {
    setSaving(p => ({ ...p, scale: true }))
    await api.put('/api/settings/appreciation-scale', { scale })
    setOrigScale(JSON.parse(JSON.stringify(scale)))
    setSaving(p => ({ ...p, scale: false }))
    showMsg('Barème enregistré')
  }

  // ─── School Sections ───────────────────────────────────────
  function addSection() {
    setSections(prev => [...prev, { level_from: '', level_to: '', name: '' }])
  }

  function updateSection(i, field, value) {
    setSections(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s))
  }

  function removeSection(i) {
    setSections(prev => prev.filter((_, idx) => idx !== i))
  }

  async function saveSections() {
    setSaving(p => ({ ...p, sections: true }))
    await api.put('/api/settings/school-sections', { sections })
    setOrigSections(JSON.parse(JSON.stringify(sections)))
    setSaving(p => ({ ...p, sections: false }))
    showMsg('Sections enregistrées')
  }

  // ─── Default Conduite ──────────────────────────────────────
  async function saveDefaultConduite() {
    setSaving(p => ({ ...p, conduite: true }))
    await api.put('/api/settings/default-conduite', { score: defaultConduite })
    setOrigConduite(defaultConduite)
    setSaving(p => ({ ...p, conduite: false }))
    showMsg('Conduite par défaut enregistrée')
  }

  // ─── Passage Cutoff ───────────────────────────────────────
  async function savePassageCutoff() {
    setSaving(p => ({ ...p, passage: true }))
    await api.put('/api/settings/passage-cutoff', { cutoff: passageCutoff })
    setOrigPassage(passageCutoff)
    setSaving(p => ({ ...p, passage: false }))
    showMsg('Seuil de passage enregistré')
  }

  // ─── Congratulations Config ────────────────────────────────
  async function saveCongCfg() {
    setSaving(p => ({ ...p, cong: true }))
    await api.put('/api/settings/congratulations-config', congCfg)
    setOrigCongCfg(JSON.parse(JSON.stringify(congCfg)))
    setSaving(p => ({ ...p, cong: false }))
    showMsg('Félicitations enregistrées')
  }

  // ─── Conseil Decision Ranges ───────────────────────────────
  function updateConseilRange(i, field, value) {
    setConseilRanges(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: field === 'text' ? value : field === 'pass' ? value : parseFloat(value) || 0 } : r))
  }
  function addConseilRange() {
    setConseilRanges(prev => [...prev, { min: 0, max: 0, text: '', pass: true }])
  }
  function removeConseilRange(i) {
    setConseilRanges(prev => prev.filter((_, idx) => idx !== i))
  }
  async function saveConseilRanges() {
    setSaving(p => ({ ...p, conseil: true }))
    await api.put('/api/settings/conseil-decision-ranges', { ranges: conseilRanges })
    setOrigConseilRanges(JSON.parse(JSON.stringify(conseilRanges)))
    setSaving(p => ({ ...p, conseil: false }))
    showMsg('Décisions enregistrées')
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-medium text-steel-900">Paramètres</h1>
        {msg && <span className="text-sm text-brand font-medium">{msg}</span>}
      </div>

      {/* Logo */}
      <section className="bg-white rounded-xl border border-steel-200 p-6">
        <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide mb-4">Logo de l'école</h2>
        <div className="flex items-center gap-6">
          <div className="w-24 h-24 bg-steel-100 rounded-xl flex items-center justify-center overflow-hidden border border-steel-200">
            {logo ? (
              <img src={`/api/settings/school-logo?t=${Date.now()}`} alt="Logo" className="w-full h-full object-contain" />
            ) : (
              <svg className="w-10 h-10 text-steel-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-sm text-steel-500">Utilisé sur les bulletins de notes. Format: PNG ou JPG, max 5 Mo.</p>
            <div className="flex gap-2">
              <label className="px-3 py-1.5 bg-brand hover:bg-brand-600 text-white rounded-lg text-xs font-medium cursor-pointer transition-colors">
                {saving.logo ? 'Envoi...' : 'Choisir un fichier'}
                <input type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files[0]) uploadLogo(e.target.files[0]); e.target.value = '' }} />
              </label>
              {logo && (
                <button onClick={removeLogo} className="px-3 py-1.5 border border-steel-200 text-steel-500 rounded-lg text-xs font-medium hover:bg-steel-50">
                  Supprimer
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Appreciation Scale */}
      <section className="bg-white rounded-xl border border-steel-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide">Barème d'appréciation</h2>
          <button onClick={() => askConfirm("Barème d'appréciation", !eq(scale, origScale), saveScale, () => setScale(JSON.parse(JSON.stringify(origScale))))} disabled={saving.scale}
            className="px-3 py-1.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors">
            {saving.scale ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
        <p className="text-xs text-steel-500 mb-3">Définit l'appréciation automatique en fonction de la moyenne.</p>
        <div className="space-y-2">
          {scale.map((s, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-2">
                <input type="number" step="0.01" value={s.min} onChange={e => updateScale(i, 'min', e.target.value)}
                  placeholder="Min" className="w-full px-2 py-1.5 border border-steel-200 rounded-lg text-xs text-center focus:outline-none focus:border-brand" />
              </div>
              <span className="text-xs text-steel-400 text-center">—</span>
              <div className="col-span-2">
                <input type="number" step="0.01" value={s.max} onChange={e => updateScale(i, 'max', e.target.value)}
                  placeholder="Max" className="w-full px-2 py-1.5 border border-steel-200 rounded-lg text-xs text-center focus:outline-none focus:border-brand" />
              </div>
              <div className="col-span-6">
                <input type="text" value={s.label} onChange={e => updateScale(i, 'label', e.target.value)}
                  placeholder="Appréciation" className="w-full px-2 py-1.5 border border-steel-200 rounded-lg text-xs focus:outline-none focus:border-brand" />
              </div>
              <button onClick={() => removeScaleRow(i)} className="text-red-400 hover:text-red-500 text-xs">✕</button>
            </div>
          ))}
        </div>
        <button onClick={addScaleRow}
          className="mt-2 w-full py-2 border border-dashed border-steel-300 rounded-lg text-xs text-steel-500 hover:border-brand hover:text-brand transition-colors">
          + Ajouter un palier
        </button>
      </section>

      {/* School Sections */}
      <section className="bg-white rounded-xl border border-steel-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide">Sections de l'école</h2>
          <button onClick={() => askConfirm("Sections de l'école", !eq(sections, origSections), saveSections, () => setSections(JSON.parse(JSON.stringify(origSections))))} disabled={saving.sections}
            className="px-3 py-1.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors">
            {saving.sections ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
        <p className="text-xs text-steel-500 mb-3">
          Nom officiel par tranche de niveaux. Utilisé sur l'en-tête des bulletins.
          Ex: "École Primaire Privée St Michel" pour CI–CM2, "Collège Privé St Michel" pour 6ème–3ème.
        </p>
        <div className="space-y-2">
          {sections.map((s, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-2">
                <input type="text" value={s.level_from} onChange={e => updateSection(i, 'level_from', e.target.value)}
                  placeholder="Du (ex: CI)" className="w-full px-2 py-1.5 border border-steel-200 rounded-lg text-xs focus:outline-none focus:border-brand" />
              </div>
              <span className="text-xs text-steel-400 text-center">→</span>
              <div className="col-span-2">
                <input type="text" value={s.level_to} onChange={e => updateSection(i, 'level_to', e.target.value)}
                  placeholder="Au (ex: CM2)" className="w-full px-2 py-1.5 border border-steel-200 rounded-lg text-xs focus:outline-none focus:border-brand" />
              </div>
              <div className="col-span-6">
                <input type="text" value={s.name} onChange={e => updateSection(i, 'name', e.target.value)}
                  placeholder="Nom officiel de la section" className="w-full px-2 py-1.5 border border-steel-200 rounded-lg text-xs focus:outline-none focus:border-brand" />
              </div>
              <button onClick={() => removeSection(i)} className="text-red-400 hover:text-red-500 text-xs">✕</button>
            </div>
          ))}
        </div>
        <button onClick={addSection}
          className="mt-2 w-full py-2 border border-dashed border-steel-300 rounded-lg text-xs text-steel-500 hover:border-brand hover:text-brand transition-colors">
          + Ajouter une section
        </button>
      </section>

      {/* Default Conduite */}
      <section className="bg-white rounded-xl border border-steel-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide">Conduite par défaut</h2>
            <p className="text-xs text-steel-500 mt-1">Note de conduite affichée sur les bulletins si non modifiée. Modifiable par élève dans la fiche élève.</p>
          </div>
          <button onClick={() => askConfirm('Conduite par défaut', defaultConduite !== origConduite, saveDefaultConduite, () => setDefaultConduite(origConduite))} disabled={saving.conduite}
            className="px-3 py-1.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors">
            {saving.conduite ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <input type="number" min="0" max="20" step="0.5" value={defaultConduite}
            onChange={e => setDefaultConduite(parseFloat(e.target.value) || 0)}
            className="w-24 px-3 py-1.5 border border-steel-200 rounded-lg text-sm text-center focus:outline-none focus:border-brand" />
          <span className="text-sm text-steel-500">/ 20</span>
        </div>
      </section>

      {/* Passage Cutoff */}
      <section className="bg-white rounded-xl border border-steel-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide">Seuil de passage en classe supérieure</h2>
            <p className="text-xs text-steel-500 mt-1">Moyenne annuelle minimale (bilan des 3 trimestres) pour être admis. Affiché uniquement sur le bulletin du 3ème trimestre.</p>
          </div>
          <button onClick={() => askConfirm('Seuil de passage en classe supérieure', passageCutoff !== origPassage, savePassageCutoff, () => setPassageCutoff(origPassage))} disabled={saving.passage}
            className="px-3 py-1.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors">
            {saving.passage ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <input type="number" min="0" max="20" step="0.5" value={passageCutoff}
            onChange={e => setPassageCutoff(parseFloat(e.target.value) || 0)}
            className="w-24 px-3 py-1.5 border border-steel-200 rounded-lg text-sm text-center focus:outline-none focus:border-brand" />
          <span className="text-sm text-steel-500">/ 20</span>
        </div>
      </section>

      {/* Congratulations Config */}
      <section className="bg-white rounded-xl border border-steel-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide">Félicitations — Seuils</h2>
            <p className="text-xs text-steel-500 mt-1">Calculées automatiquement à la génération des bulletins.</p>
          </div>
          <button onClick={() => askConfirm('Félicitations — Seuils', !eq(congCfg, origCongCfg), saveCongCfg, () => setCongCfg(JSON.parse(JSON.stringify(origCongCfg))))} disabled={saving.cong}
            className="px-3 py-1.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors">
            {saving.cong ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-steel-500 mb-1">Moyenne minimale (plancher)</label>
            <input type="number" step="0.5" value={congCfg.avg_floor} onChange={e => setCongCfg(p => ({ ...p, avg_floor: parseFloat(e.target.value) || 0 }))}
              className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-xs focus:outline-none focus:border-brand" />
            <p className="text-xs text-steel-400 mt-1">En dessous → aucune félicitation</p>
          </div>
          <div>
            <label className="block text-xs text-steel-500 mb-1">Félicitation — top X% de la classe</label>
            <input type="number" step="1" min="1" max="100" value={congCfg.felicitation_percentile} onChange={e => setCongCfg(p => ({ ...p, felicitation_percentile: parseInt(e.target.value) || 20 }))}
              className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-xs focus:outline-none focus:border-brand" />
            <p className="text-xs text-steel-400 mt-1">Ex: 20 = top 20% + moy ≥ plancher</p>
          </div>
          <div>
            <label className="block text-xs text-steel-500 mb-1">Tableau d'honneur — top N élèves</label>
            <input type="number" step="1" min="1" value={congCfg.tableau_top_n} onChange={e => setCongCfg(p => ({ ...p, tableau_top_n: parseInt(e.target.value) || 5 }))}
              className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-xs focus:outline-none focus:border-brand" />
            <p className="text-xs text-steel-400 mt-1">Ex: 5 = rang ≤ 5 + moy ≥ plancher</p>
          </div>
        </div>
      </section>

      {/* Conseil Decision Ranges */}
      <section className="bg-white rounded-xl border border-steel-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide">Décision du conseil des professeurs</h2>
            <p className="text-xs text-steel-500 mt-1">Texte affiché sur le bulletin selon la moyenne. Calculé automatiquement.</p>
          </div>
          <button onClick={() => askConfirm('Décision du conseil des professeurs', !eq(conseilRanges, origConseilRanges), saveConseilRanges, () => setConseilRanges(JSON.parse(JSON.stringify(origConseilRanges))))} disabled={saving.conseil}
            className="px-3 py-1.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors">
            {saving.conseil ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 mb-1">
            <span className="col-span-2 text-xs text-steel-400 text-center">Min</span>
            <span className="col-span-2 text-xs text-steel-400 text-center">Max</span>
            <span className="col-span-5 text-xs text-steel-400">Texte affiché</span>
            <span className="col-span-2 text-xs text-steel-400 text-center">Admis</span>
          </div>
          {conseilRanges.map((r, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-2">
                <input type="number" step="0.01" value={r.min} onChange={e => updateConseilRange(i, 'min', e.target.value)}
                  className="w-full px-2 py-1.5 border border-steel-200 rounded-lg text-xs text-center focus:outline-none focus:border-brand" />
              </div>
              <div className="col-span-2">
                <input type="number" step="0.01" value={r.max} onChange={e => updateConseilRange(i, 'max', e.target.value)}
                  className="w-full px-2 py-1.5 border border-steel-200 rounded-lg text-xs text-center focus:outline-none focus:border-brand" />
              </div>
              <div className="col-span-5">
                <input type="text" value={r.text} onChange={e => updateConseilRange(i, 'text', e.target.value)}
                  className="w-full px-2 py-1.5 border border-steel-200 rounded-lg text-xs focus:outline-none focus:border-brand" />
              </div>
              <div className="col-span-2 flex justify-center">
                <button onClick={() => updateConseilRange(i, 'pass', !r.pass)}
                  className={`w-8 h-5 rounded-full transition-colors relative ${r.pass ? 'bg-brand' : 'bg-steel-300'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${r.pass ? 'left-3.5' : 'left-0.5'}`} />
                </button>
              </div>
              <button onClick={() => removeConseilRange(i)} className="text-red-400 hover:text-red-500 text-xs">✕</button>
            </div>
          ))}
        </div>
        <button onClick={addConseilRange}
          className="mt-2 w-full py-2 border border-dashed border-steel-300 rounded-lg text-xs text-steel-500 hover:border-brand hover:text-brand transition-colors">
          + Ajouter un palier
        </button>
      </section>

      {/* Academic Settings */}
      <AcademicSettings showMsg={showMsg} />

      {/* Confirmation modal */}
      {confirm.show && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => { confirm.onCancel?.(); closeConfirm() }}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-steel-900 mb-1">Confirmer la modification</h3>
            <p className="text-sm text-steel-500 mb-5">
              Voulez-vous vraiment enregistrer les modifications apportées à <strong className="text-steel-800">{confirm.label}</strong> ?
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => { confirm.onCancel?.(); closeConfirm() }}
                className="px-4 py-2 border border-steel-200 text-steel-600 rounded-lg text-sm hover:bg-steel-50 transition-colors">
                Annuler
              </button>
              <button onClick={() => { confirm.onConfirm(); closeConfirm() }}
                className="px-4 py-2 bg-brand hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors">
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Academic Settings Component ─────────────────────────────
function AcademicSettings({ showMsg }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [assessConfigs, setAssessConfigs] = useState({})
  const [savingAssess, setSavingAssess] = useState(false)
  const [tab, setTab] = useState('assessments')

  function loadData() {
    api.get('/api/settings/academic').then(res => {
      setData(res.data)
      setAssessConfigs(res.data.assess_configs || {})
      setLoading(false)
    })
  }

  useEffect(() => { loadData() }, [])

  function updateAssessConfig(levelId, field, value) {
    setAssessConfigs(prev => ({ ...prev, [levelId]: { ...prev[levelId], [field]: parseInt(value) || 0 } }))
  }

  async function saveAssessConfigs() {
    setSavingAssess(true)
    const configs = Object.entries(assessConfigs).map(([levelId, cfg]) => ({ level_id: parseInt(levelId), ...cfg }))
    await api.put('/api/settings/assessment-config', { configs })
    setSavingAssess(false)
    showMsg('Configuration des évaluations enregistrée')
  }

  async function updateCoefficient(lsId, newCoef) {
    await api.put(`/api/settings/level-subject/${lsId}`, { coefficient: parseInt(newCoef) || 1 })
    loadData()
  }

  async function reassignTeacher(assignId, newTeacherId) {
    await api.put(`/api/settings/teacher-assignment/${assignId}`, { teacher_id: parseInt(newTeacherId) })
    loadData()
  }

  async function removeAssignment(assignId) {
    await api.delete(`/api/settings/teacher-assignment/${assignId}`)
    loadData()
  }

  if (loading) return null

  return (
    <>
      {/* Academic year info */}
      <section className="bg-white rounded-xl border border-steel-200 p-6">
        <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide mb-4">Année académique</h2>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div><p className="text-steel-400 text-xs">Année</p><p className="text-steel-800 font-medium">{data.academic_year?.label || '—'}</p></div>
          <div><p className="text-steel-400 text-xs">Période</p><p className="text-steel-800">{data.periode_type === 'trimestre' ? 'Trimestre (3)' : 'Semestre (2)'}</p></div>
          <div><p className="text-steel-400 text-xs">Dates</p><p className="text-steel-800">{data.academic_year?.start_date || '—'} → {data.academic_year?.end_date || '—'}</p></div>
        </div>
      </section>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
        <div className="flex border-b border-steel-200">
          {[
            { key: 'assessments', label: 'Évaluations' },
            { key: 'coefficients', label: 'Coefficients' },
            { key: 'assignments', label: 'Affectations enseignants' },
            { key: 'levels', label: 'Niveaux' },
            { key: 'classrooms', label: 'Classes' },
            { key: 'subjects', label: 'Matières' },
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
                <button onClick={saveAssessConfigs} disabled={savingAssess}
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

          {/* Coefficients tab */}
          {tab === 'coefficients' && (
            <div>
              <p className="text-xs text-steel-500 mb-4">Modifier les coefficients par matière et par niveau. Les changements sont immédiats.</p>
              {data.levels?.map(l => {
                const subs = data.level_subjects?.filter(ls => ls.level_id === l.id) || []
                if (subs.length === 0) return null
                return (
                  <div key={l.id} className="mb-4">
                    <p className="text-xs font-medium text-steel-700 mb-2">{l.name}</p>
                    <div className="space-y-1">
                      {subs.map(ls => (
                        <div key={ls.id} className="flex items-center gap-3">
                          <span className="text-xs text-steel-600 w-48">{ls.subject_name}</span>
                          <select value={ls.coefficient} onChange={e => updateCoefficient(ls.id, e.target.value)}
                            className="w-14 px-1 py-1 border border-steel-200 rounded text-xs text-center focus:outline-none focus:border-brand bg-white">
                            {[1,2,3,4,5,6].map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Teacher assignments tab */}
          {tab === 'assignments' && (
            <div>
              <p className="text-xs text-steel-500 mb-4">Réaffecter ou supprimer des enseignants par classe et matière.</p>
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
            </div>
          )}
          {/* Levels tab */}
          {tab === 'levels' && (
            <LevelsManager onUpdate={loadData} showMsg={showMsg} />
          )}

          {/* Classrooms tab */}
          {tab === 'classrooms' && (
            <ClassroomsManager data={data} onUpdate={loadData} showMsg={showMsg} />
          )}

          {/* Subjects tab */}
          {tab === 'subjects' && (
            <SubjectsManager data={data} onUpdate={loadData} showMsg={showMsg} />
          )}
        </div>
      </div>
    </>
  )
}

// ─── Levels Manager ──────────────────────────────────────────
function LevelsManager({ onUpdate, showMsg }) {
  const [levels, setLevels] = useState([])
  const [selected, setSelected] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/api/settings/levels').then(res => {
      setLevels(res.data.levels || [])
      setSelected((res.data.levels || []).filter(l => l.is_active === 1).map(l => l.id))
    })
  }, [])

  function toggle(id) { setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]) }

  async function save() {
    setSaving(true)
    await api.put('/api/settings/levels', { level_ids: selected })
    setSaving(false)
    showMsg('Niveaux mis à jour')
    onUpdate()
  }

  const groups = [
    { title: 'Primaire', items: levels.filter(l => l.level_code <= 7) },
    { title: 'Collège', items: levels.filter(l => l.level_code >= 8 && l.level_code <= 11) },
    { title: 'Lycée', items: levels.filter(l => l.level_code >= 12) },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-steel-500">Activez ou désactivez les niveaux enseignés par votre école.</p>
        <button onClick={save} disabled={saving} className="px-3 py-1.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium">
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
    </div>
  )
}

// ─── Classrooms Manager ──────────────────────────────────────
function ClassroomsManager({ data, onUpdate, showMsg }) {
  const [form, setForm] = useState({ label: '', level_id: '', serie_id: '', capacity: 50 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const activeLevels = data?.levels || []
  const selectedLevel = activeLevels.find(l => l.id === parseInt(form.level_id))
  const levelSeries = selectedLevel?.has_serie === 1
    ? (data?.level_subjects || []).filter(ls => ls.level_id === parseInt(form.level_id)).reduce((acc, ls) => { /* can't get series from level_subjects */ return acc }, [])
    : []

  async function handleAdd(e) {
    e.preventDefault()
    if (!form.label.trim() || !form.level_id) { setError('Nom et niveau requis'); return }
    setSaving(true); setError('')
    try {
      await api.post('/api/settings/classrooms', { label: form.label, level_id: parseInt(form.level_id), serie_id: form.serie_id ? parseInt(form.serie_id) : null, capacity: form.capacity })
      setForm({ label: '', level_id: '', serie_id: '', capacity: 50 })
      showMsg('Classe ajoutée')
      onUpdate()
    } catch (err) { setError(err.response?.data?.message || 'Erreur') }
    setSaving(false)
  }

  return (
    <div>
      <p className="text-xs text-steel-500 mb-4">Ajouter une nouvelle classe pour l'année en cours. Les modèles d'évaluation seront générés automatiquement.</p>
      <form onSubmit={handleAdd} className="grid grid-cols-4 gap-3 items-end">
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
    </div>
  )
}

// ─── Subjects Manager ────────────────────────────────────────
function SubjectsManager({ data, onUpdate, showMsg }) {
  const [newSubject, setNewSubject] = useState({ name: '', short_code: '' })
  const [addToLevel, setAddToLevel] = useState({ level_id: '', serie_id: '', subject_id: '', coefficient: 1 })
  const [saving, setSaving] = useState(false)

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

  async function handleRemoveFromLevel(lsId) {
    await api.delete(`/api/settings/level-subject/${lsId}`)
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
          <select value={addToLevel.level_id} onChange={e => setAddToLevel(p => ({ ...p, level_id: parseInt(e.target.value) || '' }))}
            className="px-2 py-1.5 border border-steel-200 rounded-lg text-xs bg-white focus:outline-none focus:border-brand">
            <option value="">Niveau</option>
            {data?.levels?.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
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
                    {ls.subject_name} <span className="text-steel-400">(c{ls.coefficient})</span>
                    <button onClick={() => handleRemoveFromLevel(ls.id)} className="text-red-400 hover:text-red-500 ml-0.5">×</button>
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
