import { useState, useEffect } from 'react'
import api from '../../utils/api'
import { eq, useSettingsMsg, SaveConfirmModal } from './settingsShared'

// École: identity — logo, sections officielles, année académique.
export default function SchoolSettingsPage() {
  const [logo, setLogo] = useState(null)
  const [sections, setSections] = useState([])
  const [origSections, setOrigSections] = useState([])
  const [year, setYear] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})
  const [msg, showMsg] = useSettingsMsg()
  const [confirm, setConfirm] = useState({ show: false, label: '', onConfirm: null, onCancel: null })

  useEffect(() => {
    Promise.all([api.get('/api/settings'), api.get('/api/settings/academic')]).then(([res, acadRes]) => {
      const sectionsVal = res.data.school_sections || []
      setSections(sectionsVal); setOrigSections(JSON.parse(JSON.stringify(sectionsVal)))
      setLogo(res.data.school_logo_path)
      setYear({ academic_year: acadRes.data.academic_year, periode_type: acadRes.data.periode_type })
      setLoading(false)
    })
  }, [])

  function askConfirm(label, hasChanged, fn, revertFn) {
    if (!hasChanged) { showMsg('Aucune modification à enregistrer'); return }
    setConfirm({ show: true, label, onConfirm: fn, onCancel: revertFn })
  }
  function closeConfirm() { setConfirm({ show: false, label: '', onConfirm: null, onCancel: null }) }

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

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-6">
      <div className="h-5 text-right">{msg && <span className="text-sm text-brand font-medium">{msg}</span>}</div>

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

      {/* Academic year info */}
      <section className="bg-white rounded-xl border border-steel-200 p-6">
        <h2 className="text-xs font-semibold text-steel-400 uppercase tracking-wide mb-4">Année académique</h2>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div><p className="text-steel-400 text-xs">Année</p><p className="text-steel-800 font-medium">{year?.academic_year?.label || '—'}</p></div>
          <div><p className="text-steel-400 text-xs">Période</p><p className="text-steel-800">{year?.periode_type === 'trimestre' ? 'Trimestre (3)' : 'Semestre (2)'}</p></div>
          <div><p className="text-steel-400 text-xs">Dates</p><p className="text-steel-800">{year?.academic_year?.start_date || '—'} → {year?.academic_year?.end_date || '—'}</p></div>
        </div>
      </section>

      <SaveConfirmModal confirm={confirm} onClose={closeConfirm} />
    </div>
  )
}
