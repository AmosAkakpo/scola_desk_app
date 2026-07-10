import { useState, useEffect } from 'react'
import api from '../../utils/api'
import { eq, useSettingsMsg, SaveConfirmModal } from './settingsShared'

// Notes & bulletins: every rule that shapes a bulletin — barème, conduite,
// seuil de passage, félicitations, décision du conseil.
export default function BulletinSettingsPage() {
  const [scale, setScale] = useState([])
  const [congCfg, setCongCfg] = useState({ avg_floor: 10, felicitation_percentile: 20, tableau_top_n: 5 })
  const [conseilRanges, setConseilRanges] = useState([])
  const [defaultConduite, setDefaultConduite] = useState(18)
  const [passageCutoff, setPassageCutoff] = useState(10)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})
  const [msg, showMsg] = useSettingsMsg()
  const [confirm, setConfirm] = useState({ show: false, label: '', onConfirm: null, onCancel: null })
  // Snapshots of last-saved values — used to detect changes and to revert on Annuler
  const [origScale, setOrigScale] = useState([])
  const [origConduite, setOrigConduite] = useState(18)
  const [origPassage, setOrigPassage] = useState(10)
  const [origCongCfg, setOrigCongCfg] = useState({ avg_floor: 10, felicitation_percentile: 20, tableau_top_n: 5 })
  const [origConseilRanges, setOrigConseilRanges] = useState([])

  useEffect(() => {
    api.get('/api/settings').then(res => {
      const scaleVal = res.data.appreciation_scale || []
      const conduiteVal = res.data.default_conduite_score ?? 18
      const passageVal = res.data.passage_cutoff ?? 10
      const congVal = res.data.congratulations_config || { avg_floor: 10, felicitation_percentile: 20, tableau_top_n: 5 }
      const conseilVal = res.data.conseil_decision_ranges || []
      setScale(scaleVal); setOrigScale(JSON.parse(JSON.stringify(scaleVal)))
      setCongCfg(congVal); setOrigCongCfg(JSON.parse(JSON.stringify(congVal)))
      setConseilRanges(conseilVal); setOrigConseilRanges(JSON.parse(JSON.stringify(conseilVal)))
      setDefaultConduite(conduiteVal); setOrigConduite(conduiteVal)
      setPassageCutoff(passageVal); setOrigPassage(passageVal)
      setLoading(false)
    })
  }, [])

  function askConfirm(label, hasChanged, fn, revertFn) {
    if (!hasChanged) { showMsg('Aucune modification à enregistrer'); return }
    setConfirm({ show: true, label, onConfirm: fn, onCancel: revertFn })
  }
  function closeConfirm() { setConfirm({ show: false, label: '', onConfirm: null, onCancel: null }) }

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
    <div className="space-y-6">
      <div className="h-5 text-right">{msg && <span className="text-sm text-brand font-medium">{msg}</span>}</div>

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

      <SaveConfirmModal confirm={confirm} onClose={closeConfirm} />
    </div>
  )
}
