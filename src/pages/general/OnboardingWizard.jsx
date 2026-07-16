import { useState, useEffect } from 'react'
import api from '../../utils/api'

const STEP_LABELS = [
  'Confirmation', 'Comptes', 'Année scolaire', 'Niveaux', 'Séries',
  'Matières', 'Évaluations', 'Classes', 'Enseignants', 'Élèves',
  'Affectations', 'Frais', 'Finalisation',
]

function ProgressBar({ current, total }) {
  const pct = Math.round(((current - 1) / (total - 1)) * 100)
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-steel-700">Étape {current}/{total} — {STEP_LABELS[current - 1]}</span>
        <span className="text-xs text-steel-400">{pct}%</span>
      </div>
      <div className="w-full h-2 bg-steel-200 rounded-full overflow-hidden">
        <div className="h-full bg-brand rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ─── Step 1: Confirmation ────────────────────────────────────
function Step1Confirm({ school, license, features, size, semesters, onNext }) {
  const [loading, setLoading] = useState(false)
  async function handleConfirm() {
    setLoading(true)
    try { await api.post('/api/onboarding/step1'); onNext() } catch { setLoading(false) }
  }
  return (
    <div className="max-w-lg mx-auto">
      <h2 className="text-lg font-medium text-steel-900 mb-1">Confirmation des informations</h2>
      <p className="text-sm text-steel-500 mb-6">Vérifiez que les informations ci-dessous sont correctes.</p>
      <div className="bg-white rounded-xl border border-steel-200 p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><p className="text-steel-400 text-xs">École</p><p className="text-steel-800 font-medium">{school?.school_name || '—'}</p></div>
          <div><p className="text-steel-400 text-xs">Code</p><p className="text-steel-800 font-mono">{school?.school_code || '—'}</p></div>
          <div><p className="text-steel-400 text-xs">Directeur</p><p className="text-steel-800">{school?.director_name || '—'}</p></div>
          <div><p className="text-steel-400 text-xs">Ville</p><p className="text-steel-800">{school?.city || '—'}</p></div>
          <div><p className="text-steel-400 text-xs">Pays</p><p className="text-steel-800">{school?.country || '—'}</p></div>
          <div><p className="text-steel-400 text-xs">Licence</p><p className="text-steel-800">
            <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium mr-1 ${license?.tier === 'PRO' ? 'bg-brand-50 text-brand-600' : 'bg-steel-100 text-steel-600'}`}>{license?.tier || '—'}</span>
          </p></div>
          <div><p className="text-steel-400 text-xs">Expiration</p><p className="text-steel-800">{license?.expiry ? new Date(license.expiry).toLocaleDateString('fr-FR') : '—'}</p></div>
          <div><p className="text-steel-400 text-xs">Statut</p><p className={`font-medium ${license?.is_active ? 'text-brand' : 'text-red-500'}`}>{license?.is_active ? 'Active' : 'Inactive'}</p></div>
          {size && <div><p className="text-steel-400 text-xs">Taille</p><p className="text-steel-800">{size}</p></div>}
          {semesters && <div><p className="text-steel-400 text-xs">Trimestres</p><p className="text-steel-800">{semesters}/3</p></div>}
          {features?.length > 0 && (
            <div className="col-span-2"><p className="text-steel-400 text-xs mb-1">Fonctionnalités</p>
              <div className="flex flex-wrap gap-1">{features.map(f => <span key={f} className="px-2 py-0.5 bg-steel-100 text-steel-600 rounded text-xs">{f}</span>)}</div>
            </div>
          )}
        </div>
      </div>
      <div className="mt-6 flex justify-end">
        <button onClick={handleConfirm} disabled={loading} className="px-6 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
          {loading ? 'Validation...' : 'Confirmer et continuer'}
        </button>
      </div>
    </div>
  )
}

// ─── Account Fields (extracted to avoid re-render focus loss) ─
function AccountFields({ label, value, onChange, required, onRemove }) {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="bg-white rounded-xl border border-steel-200 p-5 space-y-3 relative">
      <h3 className="text-sm font-medium text-steel-700">{label} {required && <span className="text-red-500">*</span>}</h3>
      {onRemove && <button type="button" onClick={onRemove} className="absolute top-3 right-3 text-steel-400 hover:text-red-500 text-xs">Retirer</button>}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-steel-500 mb-1">Nom complet <span className="text-red-500">*</span></label>
          <input type="text" required={required} value={value.full_name} onChange={e => onChange({ ...value, full_name: e.target.value })}
            className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand" />
        </div>
        <div>
          <label className="block text-xs text-steel-500 mb-1">Nom d'utilisateur <span className="text-red-500">*</span></label>
          <input type="text" required={required} value={value.username} onChange={e => onChange({ ...value, username: e.target.value })}
            className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-steel-500 mb-1">Mot de passe <span className="text-red-500">*</span></label>
        <div className="relative">
          <input type={showPassword ? 'text' : 'password'} required={required} value={value.password} minLength={6}
            onChange={e => onChange({ ...value, password: e.target.value })}
            className="w-full px-3 py-2 pr-10 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand" placeholder="Minimum 6 caractères" />
          <button type="button" onClick={() => setShowPassword(p => !p)} tabIndex={-1}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-steel-400 hover:text-steel-600">
            {showPassword ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Step 2: Account Creation ────────────────────────────────
function Step2Accounts({ license, onNext }) {
  const [admin, setAdmin] = useState({ full_name: '', username: '', password: '' })
  const [secretary, setSecretary] = useState({ full_name: '', username: '', password: '' })
  const [accountant, setAccountant] = useState({ full_name: '', username: '', password: '' })
  const [addSecretary, setAddSecretary] = useState(false)
  const [addAccountant, setAddAccountant] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [existing, setExisting] = useState({})  // role_name → {full_name, username}
  const isPro = license?.tier === 'PRO'

  // Load already-created accounts (for back-nav). Passwords never returned.
  useEffect(() => {
    api.get('/api/onboarding/accounts').then(res => {
      const map = {}
      ;(res.data.accounts || []).forEach(a => { map[a.role_name] = a })
      setExisting(map)
    }).catch(() => {})
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const payload = {}
    if (!existing.admin) payload.admin = admin
    if (!existing.secretary && addSecretary && secretary.full_name) payload.secretary = secretary
    if (!existing.accountant && addAccountant && accountant.full_name && isPro) payload.accountant = accountant
    try { await api.post('/api/onboarding/step2', payload); onNext() }
    catch (err) { setError(err.response?.data?.message || 'Erreur lors de la création des comptes'); setLoading(false) }
  }

  function ExistingAccount({ label, acc }) {
    return (
      <div className="bg-white rounded-xl border border-steel-200 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-steel-700">{label}</h3>
            <p className="text-xs text-steel-500 mt-0.5">{acc.full_name} · @{acc.username}</p>
          </div>
          <span className="px-2 py-0.5 bg-brand-50 text-brand-600 rounded text-xs font-medium">Créé</span>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto">
      <h2 className="text-lg font-medium text-steel-900 mb-1">Création des comptes</h2>
      <p className="text-sm text-steel-500 mb-6">Créez les comptes utilisateurs pour cette école.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Admin */}
        {existing.admin ? (
          <ExistingAccount label="Administrateur" acc={existing.admin} />
        ) : (
          <AccountFields label="Administrateur" value={admin} onChange={setAdmin} required />
        )}

        {/* Secretary */}
        {existing.secretary ? (
          <ExistingAccount label="Secrétaire" acc={existing.secretary} />
        ) : !addSecretary ? (
          <button type="button" onClick={() => setAddSecretary(true)}
            className="w-full py-3 border border-dashed border-steel-300 rounded-xl text-sm text-steel-500 hover:border-brand hover:text-brand transition-colors">
            + Ajouter un(e) secrétaire
          </button>
        ) : (
          <AccountFields label="Secrétaire" value={secretary} onChange={setSecretary}
            onRemove={() => { setAddSecretary(false); setSecretary({ full_name: '', username: '', password: '' }) }} />
        )}

        {/* Accountant (PRO) */}
        {isPro && (existing.accountant ? (
          <ExistingAccount label="Comptable" acc={existing.accountant} />
        ) : !addAccountant ? (
          <button type="button" onClick={() => setAddAccountant(true)}
            className="w-full py-3 border border-dashed border-steel-300 rounded-xl text-sm text-steel-500 hover:border-brand hover:text-brand transition-colors">
            + Ajouter un(e) comptable (PRO)
          </button>
        ) : (
          <AccountFields label="Comptable" value={accountant} onChange={setAccountant}
            onRemove={() => { setAddAccountant(false); setAccountant({ full_name: '', username: '', password: '' }) }} />
        ))}

        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div className="flex justify-end pt-2">
          <button type="submit" disabled={loading || (!existing.admin && (!admin.full_name || !admin.username || !admin.password))}
            className="px-6 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
            {loading ? 'Enregistrement...' : 'Continuer'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Step 3: Academic Year Setup ─────────────────────────────
function Step3AcademicYear({ onNext }) {
  const now = new Date()
  const yearStart = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
  const yearEnd = yearStart + 1
  const [form, setForm] = useState({ label: `${yearStart}-${yearEnd}`, periode_type: 'trimestre' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Load existing academic year (for back-nav)
  useEffect(() => {
    api.get('/api/onboarding/academic-year').then(res => {
      if (res.data.year) {
        setForm({
          label: res.data.year.label,
          periode_type: res.data.periode_type || 'trimestre',
        })
      }
    }).catch(() => {})
  }, [])

  function update(field, value) { setForm(prev => ({ ...prev, [field]: value })) }

  // Fixed convention (non-negotiable): an academic year always runs
  // Aug 1 -> Jul 31, derived from the label -- display-only, matches
  // exactly what the server computes and enforces regardless of this UI.
  const labelMatch = /^(\d{4})-(\d{4})$/.exec(form.label.trim())
  const derivedStart = labelMatch ? `${labelMatch[1]}-08-01` : null
  const derivedEnd = labelMatch ? `${labelMatch[2]}-07-31` : null

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try { await api.post('/api/onboarding/step3', form); onNext() }
    catch (err) { setError(err.response?.data?.message || 'Erreur'); setLoading(false) }
  }

  const periodes = form.periode_type === 'trimestre'
    ? ['Trimestre 1 (T1)', 'Trimestre 2 (T2)', 'Trimestre 3 (T3)']
    : ['Semestre 1 (S1)', 'Semestre 2 (S2)']

  return (
    <div className="max-w-lg mx-auto">
      <h2 className="text-lg font-medium text-steel-900 mb-1">Année scolaire</h2>
      <p className="text-sm text-steel-500 mb-6">Configurez l'année scolaire en cours.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-white rounded-xl border border-steel-200 p-5 space-y-4">
          <div>
            <label className="block text-xs text-steel-500 mb-1">Libellé <span className="text-red-500">*</span></label>
            <input type="text" required value={form.label} onChange={e => update('label', e.target.value)}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand" placeholder="2025-2026" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-steel-500 mb-1">Date de début</label>
              <div className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm bg-steel-50 text-steel-600">
                {derivedStart || '—'}
              </div>
            </div>
            <div>
              <label className="block text-xs text-steel-500 mb-1">Date de fin</label>
              <div className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm bg-steel-50 text-steel-600">
                {derivedEnd || '—'}
              </div>
            </div>
          </div>
          <p className="text-xs text-steel-400 -mt-2">
            L'année scolaire va toujours du 1er août au 31 juillet, déduit automatiquement du libellé.
          </p>
          <div>
            <label className="block text-xs text-steel-500 mb-2">Type de période <span className="text-red-500">*</span></label>
            <div className="flex gap-3">
              {['trimestre', 'semestre'].map(type => (
                <button key={type} type="button" onClick={() => update('periode_type', type)}
                  className={`flex-1 py-3 rounded-lg border text-sm font-medium transition-colors ${form.periode_type === type ? 'border-brand bg-brand-50 text-brand-600' : 'border-steel-200 text-steel-500 hover:border-steel-300'}`}>
                  {type === 'trimestre' ? 'Trimestre (3 périodes)' : 'Semestre (2 périodes)'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="bg-steel-50 rounded-lg p-4">
          <p className="text-xs text-steel-400 mb-2">Périodes qui seront créées :</p>
          <div className="flex gap-2">
            {periodes.map(p => <span key={p} className="px-3 py-1.5 bg-white border border-steel-200 rounded-lg text-xs text-steel-600">{p}</span>)}
          </div>
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div className="flex justify-end pt-2">
          <button type="submit" disabled={loading || !form.label || !labelMatch}
            className="px-6 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
            {loading ? 'Enregistrement...' : 'Enregistrer et continuer'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Step 4: Levels Activation ───────────────────────────────
function Step4Levels({ onNext }) {
  const [levels, setLevels] = useState([])
  const [selected, setSelected] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api/onboarding/levels').then(res => {
      setLevels(res.data.levels || [])
      setSelected((res.data.levels || []).filter(l => l.is_active).map(l => l.id))
      setLoading(false)
    })
  }, [])

  function toggle(id) { setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (selected.length === 0) { setError('Sélectionnez au moins un niveau'); return }
    setError(''); setSaving(true)
    try { await api.post('/api/onboarding/step4', { level_ids: selected }); onNext() }
    catch (err) { setError(err.response?.data?.message || 'Erreur'); setSaving(false) }
  }

  if (loading) return <div className="text-center py-8"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto" /></div>

  const groups = [
    { title: 'Primaire', items: levels.filter(l => l.level_code <= 7) },
    { title: 'Collège (1er cycle)', items: levels.filter(l => l.level_code >= 8 && l.level_code <= 11) },
    { title: 'Lycée (2nd cycle)', items: levels.filter(l => l.level_code >= 12) },
  ]

  return (
    <div className="max-w-lg mx-auto">
      <h2 className="text-lg font-medium text-steel-900 mb-1">Niveaux enseignés</h2>
      <p className="text-sm text-steel-500 mb-6">Sélectionnez les niveaux que votre école propose.</p>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-xl border border-steel-200 p-6 space-y-5">
          {groups.filter(g => g.items.length > 0).map(g => (
            <div key={g.title}>
              <p className="text-xs font-medium text-steel-500 uppercase tracking-wide mb-2">{g.title}</p>
              <div className="grid grid-cols-4 gap-2">
                {g.items.map(l => (
                  <button key={l.id} type="button" onClick={() => toggle(l.id)}
                    className={`py-3 rounded-lg border text-sm font-medium transition-colors ${selected.includes(l.id) ? 'border-brand bg-brand-50 text-brand-600' : 'border-steel-200 text-steel-500 hover:border-steel-300'}`}>
                    {l.name}
                    {l.is_exam_cohort === 1 && l.exam_name && <span className="block text-xs text-steel-400">{l.exam_name}</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-steel-400">{selected.length} niveau(x) sélectionné(s)</p>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div className="flex justify-end">
          <button type="submit" disabled={saving || selected.length === 0}
            className="px-6 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
            {saving ? 'Enregistrement...' : 'Enregistrer et continuer'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Step 5: Series Configuration ────────────────────────────
const COMMON_SERIES = ['A', 'B', 'C', 'D', 'E', 'F1', 'F2', 'F3', 'G1', 'G2']

function SerieSelector({ level, selected, onToggle, onAdd }) {
  const [custom, setCustom] = useState('')

  function handleAdd() {
    const val = custom.trim().toUpperCase()
    if (!val) return
    onAdd(val)
    setCustom('')
  }

  const allOptions = [...new Set([...COMMON_SERIES, ...selected])]

  return (
    <div className="bg-white rounded-xl border border-steel-200 p-5">
      <p className="text-sm font-medium text-steel-700 mb-3">{level.name}</p>
      <div className="flex flex-wrap gap-2 mb-3">
        {allOptions.map(s => (
          <button key={s} type="button" onClick={() => onToggle(s)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${selected.includes(s) ? 'border-brand bg-brand-50 text-brand-600' : 'border-steel-200 text-steel-400 hover:border-steel-300'}`}>{s}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <input type="text" value={custom} onChange={e => setCustom(e.target.value.toUpperCase())} placeholder="Ajouter (ex: A1, A2...)"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
          className="flex-1 px-3 py-1.5 border border-steel-200 rounded-lg text-xs focus:outline-none focus:border-brand uppercase" />
        <button type="button" onClick={handleAdd} disabled={!custom.trim()}
          className="px-3 py-1.5 border border-steel-200 text-steel-600 rounded-lg text-xs font-medium hover:bg-steel-50 disabled:opacity-30">+</button>
      </div>
    </div>
  )
}

function Step5Series({ onNext }) {
  const [levels, setLevels] = useState([])
  const [seriesMap, setSeriesMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [autoSkip, setAutoSkip] = useState(false)

  useEffect(() => {
    api.get('/api/onboarding/series-levels').then(res => {
      const lvls = res.data.levels || []
      setLevels(lvls)
      const map = {}
      lvls.forEach(l => { map[l.id] = [] })
      ;(res.data.existing_series || []).forEach(s => { if (map[s.level_id]) map[s.level_id].push(s.name) })
      setSeriesMap(map)
      setLoading(false)
      if (lvls.length === 0) setAutoSkip(true)
    })
  }, [])

  useEffect(() => {
    if (autoSkip) {
      api.post('/api/onboarding/step5', { series: [] }).then(() => onNext())
    }
  }, [autoSkip, onNext])

  function toggleSerie(levelId, name) {
    setSeriesMap(prev => {
      const current = prev[levelId] || []
      return { ...prev, [levelId]: current.includes(name) ? current.filter(s => s !== name) : [...current, name] }
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const allSeries = []
    for (const [levelId, names] of Object.entries(seriesMap)) {
      for (const name of names) allSeries.push({ level_id: parseInt(levelId), name })
    }
    if (levels.some(l => (seriesMap[l.id] || []).length === 0)) { setError('Chaque niveau doit avoir au moins une série'); return }
    setSaving(true)
    try { await api.post('/api/onboarding/step5', { series: allSeries }); onNext() }
    catch (err) { setError(err.response?.data?.message || 'Erreur'); setSaving(false) }
  }

  if (loading || autoSkip) return <div className="text-center py-8"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto" /></div>

  return (
    <div className="max-w-lg mx-auto">
      <h2 className="text-lg font-medium text-steel-900 mb-1">Séries par niveau</h2>
      <p className="text-sm text-steel-500 mb-6">Sélectionnez les séries proposées pour chaque niveau.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        {levels.map(level => (
          <SerieSelector key={level.id} level={level} selected={seriesMap[level.id] || []}
            onToggle={(name) => toggleSerie(level.id, name)}
            onAdd={(name) => {
              const upper = name.trim().toUpperCase()
              if (!upper) return
              setSeriesMap(prev => {
                const current = prev[level.id] || []
                if (current.includes(upper)) return prev
                return { ...prev, [level.id]: [...current, upper] }
              })
            }}
          />
        ))}
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="px-6 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
            {saving ? 'Enregistrement...' : 'Enregistrer et continuer'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Step 6: Subjects & Coefficients ─────────────────────────
function AddSubjectInline({ subjects, onAdded }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    const trimmed = name.trim()
    if (!trimmed) return
    if (subjects.some(s => s.name.toLowerCase() === trimmed.toLowerCase())) {
      setError('Cette matière existe déjà')
      return
    }
    setError(''); setSaving(true)
    try {
      const res = await api.post('/api/onboarding/add-subject', { name: trimmed, short_code: code.trim().toUpperCase() || null })
      onAdded({ id: res.data.subject_id, name: trimmed, short_code: code.trim().toUpperCase() || null })
      setName(''); setCode('')
    } catch (err) { setError(err.response?.data?.message || 'Erreur') }
    setSaving(false)
  }

  return (
    <div className="mb-3 pb-3 border-b border-steel-100">
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ajouter une matière..."
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(e) } }}
            className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-xs focus:outline-none focus:border-brand" />
        </div>
        <div className="w-20">
          <input type="text" value={code} onChange={e => setCode(e.target.value)} placeholder="Code"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(e) } }}
            className="w-full px-2 py-1.5 border border-steel-200 rounded-lg text-xs focus:outline-none focus:border-brand uppercase" />
        </div>
        <button type="button" disabled={saving || !name.trim()} onClick={handleAdd}
          className="px-3 py-1.5 border border-brand text-brand rounded-lg text-xs font-medium hover:bg-brand-50 disabled:opacity-30">
          {saving ? '...' : '+'}
        </button>
      </div>
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  )
}

function Step6Subjects({ onNext }) {
  const [subjects, setSubjects] = useState([])
  const [levels, setLevels] = useState([])
  const [series, setSeries] = useState([])
  const [assignments, setAssignments] = useState([])
  const [selectedLevel, setSelectedLevel] = useState(null)
  const [selectedSerie, setSelectedSerie] = useState(null) // null = no serie (level without series)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api/onboarding/subjects-data').then(res => {
      setSubjects(res.data.subjects || [])
      setLevels(res.data.levels || [])
      setSeries(res.data.series || [])
      setAssignments(res.data.existing_assignments || [])
      if (res.data.levels?.length > 0) {
        const first = res.data.levels[0]
        setSelectedLevel(first.id)
        const firstSeries = (res.data.series || []).filter(s => s.level_id === first.id)
        setSelectedSerie(firstSeries.length > 0 ? firstSeries[0].id : null)
      }
      setLoading(false)
    })
  }, [])

  function selectLevel(levelId) {
    setSelectedLevel(levelId)
    const level = levels.find(l => l.id === levelId)
    const levelSeries = series.filter(s => s.level_id === levelId)
    setSelectedSerie(level?.has_serie === 1 && levelSeries.length > 0 ? levelSeries[0].id : null)
  }

  function getAssignment(levelId, subjectId, serieId) {
    return assignments.find(a => a.level_id === levelId && a.subject_id === subjectId && (a.serie_id || null) === (serieId || null))
  }

  function toggleSubject(levelId, subjectId, serieId) {
    const existing = getAssignment(levelId, subjectId, serieId)
    if (existing) {
      setAssignments(prev => prev.filter(a => !(a.level_id === levelId && a.subject_id === subjectId && (a.serie_id || null) === (serieId || null))))
    } else {
      setAssignments(prev => [...prev, { level_id: levelId, subject_id: subjectId, serie_id: serieId || null, coefficient: 1 }])
    }
  }

  function setCoefficient(levelId, subjectId, serieId, coeff) {
    setAssignments(prev => prev.map(a =>
      (a.level_id === levelId && a.subject_id === subjectId && (a.serie_id || null) === (serieId || null))
        ? { ...a, coefficient: parseInt(coeff) || 1 } : a
    ))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (assignments.length === 0) { setError('Assignez au moins une matière'); return }
    setError(''); setSaving(true)
    try { await api.post('/api/onboarding/step6', { assignments }); onNext() }
    catch (err) { setError(err.response?.data?.message || 'Erreur'); setSaving(false) }
  }

  if (loading) return <div className="text-center py-8"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto" /></div>

  const currentLevel = levels.find(l => l.id === selectedLevel)
  const levelSeries = series.filter(s => s.level_id === selectedLevel)
  const hasSeries = currentLevel?.has_serie === 1 && levelSeries.length > 0
  const activeSerieId = hasSeries ? selectedSerie : null

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-lg font-medium text-steel-900 mb-1">Matières et coefficients</h2>
      <p className="text-sm text-steel-500 mb-6">
        Assignez les matières à chaque niveau. {hasSeries ? 'Pour les niveaux avec séries, configurez chaque série séparément.' : ''}
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Level tabs */}
        <div className="flex gap-2 flex-wrap">
          {levels.map(l => {
            const count = assignments.filter(a => a.level_id === l.id).length
            return (
              <button key={l.id} type="button" onClick={() => selectLevel(l.id)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${selectedLevel === l.id ? 'bg-brand text-white' : 'bg-white border border-steel-200 text-steel-600 hover:bg-steel-50'}`}>
                {l.name} {count > 0 && <span className="ml-1 opacity-70">({count})</span>}
              </button>
            )
          })}
        </div>

        {/* Serie tabs (only for levels with series) */}
        {hasSeries && (
          <div className="flex gap-1 border-b border-steel-200">
            {levelSeries.map(s => {
              const count = assignments.filter(a => a.level_id === selectedLevel && a.serie_id === s.id).length
              return (
                <button key={s.id} type="button" onClick={() => setSelectedSerie(s.id)}
                  className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${selectedSerie === s.id ? 'border-brand text-brand' : 'border-transparent text-steel-500 hover:text-steel-700'}`}>
                  Série {s.name} {count > 0 && <span className="opacity-70">({count})</span>}
                </button>
              )
            })}
          </div>
        )}

        {/* Subject list */}
        {selectedLevel && (
          <div className="bg-white rounded-xl border border-steel-200 p-5">
            <p className="text-sm font-medium text-steel-700 mb-1">
              {currentLevel?.name}
              {hasSeries && selectedSerie && <span className="text-brand ml-1">— Série {levelSeries.find(s => s.id === selectedSerie)?.name}</span>}
            </p>
            {hasSeries && (
              <p className="text-xs text-steel-400 mb-3">Chaque série a ses propres matières et coefficients.</p>
            )}
            <AddSubjectInline subjects={subjects} onAdded={(newSub) => {
              setSubjects(prev => [...prev, newSub].sort((a, b) => a.name.localeCompare(b.name)))
            }} />
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {subjects.map(sub => {
                const assigned = getAssignment(selectedLevel, sub.id, activeSerieId)
                return (
                  <div key={sub.id} className="flex items-center gap-3 py-1.5 border-b border-steel-50">
                    <label className="flex items-center gap-2 flex-1 cursor-pointer">
                      <input type="checkbox" checked={!!assigned} onChange={() => toggleSubject(selectedLevel, sub.id, activeSerieId)}
                        className="rounded border-steel-300 text-brand focus:ring-brand" />
                      <span className="text-sm text-steel-700">{sub.name}</span>
                      <span className="text-xs text-steel-400">{sub.short_code}</span>
                    </label>
                    {assigned && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-steel-400">Coeff:</span>
                        <select value={assigned.coefficient} onChange={e => setCoefficient(selectedLevel, sub.id, activeSerieId, e.target.value)}
                          className="w-14 px-1 py-0.5 border border-steel-200 rounded text-xs text-center focus:outline-none focus:border-brand bg-white">
                          {[1,2,3,4,5,6,7,8].map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
        <p className="text-xs text-steel-400">{assignments.length} assignation(s) au total</p>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div className="flex justify-end">
          <button type="submit" disabled={saving || assignments.length === 0}
            className="px-6 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
            {saving ? 'Enregistrement...' : 'Enregistrer et continuer'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Step 7: Assessment Configuration ────────────────────────
function Step7Assessments({ onNext }) {
  const [levels, setLevels] = useState([])
  const [config, setConfig] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api/onboarding/assessment-data').then(res => {
      const lvls = res.data.levels || []
      setLevels(lvls)
      const saved = res.data.saved_config || {}
      const cfg = {}
      lvls.forEach(l => {
        const s = saved[l.id]
        cfg[l.id] = s
          ? { level_id: l.id, interrogations: s.interrogations, devoirs: s.devoirs, compositions: s.compositions, max_score: s.max_score }
          : { level_id: l.id, interrogations: 4, devoirs: 1, compositions: 1, max_score: 20 }
      })
      setConfig(cfg)
      setLoading(false)
    })
  }, [])

  function updateConfig(levelId, field, value) {
    setConfig(prev => ({ ...prev, [levelId]: { ...prev[levelId], [field]: parseInt(value) || 0 } }))
  }

  async function handleSubmit(e) {
    e.preventDefault(); setError(''); setSaving(true)
    try { await api.post('/api/onboarding/step7', { config: Object.values(config) }); onNext() }
    catch (err) { setError(err.response?.data?.message || 'Erreur'); setSaving(false) }
  }

  if (loading) return <div className="text-center py-8"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto" /></div>

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-lg font-medium text-steel-900 mb-1">Configuration des évaluations</h2>
      <p className="text-sm text-steel-500 mb-6">Définissez le nombre d'évaluations par trimestre pour chaque niveau.</p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-steel-200 bg-steel-50">
                <th className="text-left px-4 py-2.5 text-steel-500 font-medium text-xs">Niveau</th>
                <th className="text-center px-3 py-2.5 text-steel-500 font-medium text-xs">Interrogations</th>
                <th className="text-center px-3 py-2.5 text-steel-500 font-medium text-xs">Devoirs</th>
                <th className="text-center px-3 py-2.5 text-steel-500 font-medium text-xs">Compositions</th>
                <th className="text-center px-3 py-2.5 text-steel-500 font-medium text-xs">Note /</th>
              </tr>
            </thead>
            <tbody>
              {levels.map(l => {
                const c = config[l.id] || {}
                return (
                  <tr key={l.id} className="border-b border-steel-100">
                    <td className="px-4 py-2.5 text-steel-700 font-medium">{l.name}</td>
                    {['interrogations', 'devoirs', 'compositions'].map(field => (
                      <td key={field} className="px-3 py-2.5 text-center">
                        <select value={c[field] || 0} onChange={e => updateConfig(l.id, field, e.target.value)}
                          className="w-14 px-1 py-1 border border-steel-200 rounded text-xs text-center focus:outline-none focus:border-brand bg-white">
                          {(field === 'interrogations' ? [0,1,2,3,4,5,6] : field === 'devoirs' ? [0,1,2,3] : [0,1,2]).map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-center">
                      <select value={c.max_score || 20} onChange={e => updateConfig(l.id, 'max_score', e.target.value)}
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
        <p className="text-xs text-steel-400">Ces paramètres seront appliqués automatiquement lors de la création des classes.</p>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div className="flex justify-end pt-2">
          <button type="submit" disabled={saving} className="px-6 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
            {saving ? 'Enregistrement...' : 'Enregistrer et continuer'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Step 8: Classrooms ──────────────────────────────────────
function Step8Classrooms({ onNext }) {
  const [levels, setLevels] = useState([])
  const [series, setSeries] = useState([])
  const [classrooms, setClassrooms] = useState([])
  const [totalRooms, setTotalRooms] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api/onboarding/classroom-data').then(res => {
      setLevels(res.data.levels || [])
      setSeries(res.data.series || [])
      if (res.data.total_rooms) setTotalRooms(res.data.total_rooms)
      if (res.data.existing_classrooms?.length > 0) {
        setClassrooms(res.data.existing_classrooms.map(c => ({ id: c.id, label: c.label, level_id: c.level_id, serie_id: c.serie_id, capacity: c.capacity })))
      }
      setLoading(false)
    })
  }, [])

  function addClassroom() { setClassrooms(prev => [...prev, { label: '', level_id: levels[0]?.id || '', serie_id: null, capacity: 50 }]) }
  function updateClassroom(i, field, value) { setClassrooms(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c)) }
  function removeClassroom(i) { setClassrooms(prev => prev.filter((_, idx) => idx !== i)) }

  async function handleSubmit(e) {
    e.preventDefault()
    const valid = classrooms.filter(c => c.label.trim() && c.level_id)
    if (valid.length === 0) { setError('Ajoutez au moins une classe'); return }
    setError(''); setSaving(true)
    try { await api.post('/api/onboarding/step8', { classrooms: valid, total_rooms: parseInt(totalRooms) || 0 }); onNext() }
    catch (err) { setError(err.response?.data?.message || 'Erreur'); setSaving(false) }
  }

  if (loading) return <div className="text-center py-8"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto" /></div>

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-lg font-medium text-steel-900 mb-1">Classes</h2>
      <p className="text-sm text-steel-500 mb-6">Créez les classes pour cette année scolaire.</p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="bg-white rounded-xl border border-steel-200 p-4 flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-xs text-steel-500 mb-1">Nombre de salles disponibles</label>
            <input type="number" min="0" value={totalRooms} onChange={e => setTotalRooms(e.target.value)} placeholder="Ex: 10"
              className="w-32 px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand" />
          </div>
          <p className="text-xs text-steel-400 flex-1">Alerte si plus de classes que de salles.</p>
        </div>

        {totalRooms && parseInt(totalRooms) > 0 && classrooms.length > parseInt(totalRooms) && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2">
            <svg className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <p className="text-xs text-yellow-700"><strong>{classrooms.length} classes</strong> pour <strong>{totalRooms} salles</strong> disponibles.</p>
          </div>
        )}

        {classrooms.map((c, i) => {
          const levelSeries = series.filter(s => s.level_id === parseInt(c.level_id))
          const level = levels.find(l => l.id === parseInt(c.level_id))
          return (
            <div key={i} className="bg-white rounded-xl border border-steel-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-steel-400">Classe {i + 1}</span>
                <button type="button" onClick={() => removeClassroom(i)} className="text-xs text-red-400 hover:text-red-500">Supprimer</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-steel-500 mb-1">Nom <span className="text-red-500">*</span></label>
                  <input type="text" value={c.label} onChange={e => updateClassroom(i, 'label', e.target.value)} placeholder={level ? `${level.name} A` : ''}
                    className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand" />
                </div>
                <div>
                  <label className="block text-xs text-steel-500 mb-1">Niveau <span className="text-red-500">*</span></label>
                  <select value={c.level_id} onChange={e => updateClassroom(i, 'level_id', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand bg-white">
                    {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                {levelSeries.length > 0 && (
                  <div>
                    <label className="block text-xs text-steel-500 mb-1">Série</label>
                    <select value={c.serie_id || ''} onChange={e => updateClassroom(i, 'serie_id', e.target.value ? parseInt(e.target.value) : null)}
                      className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand bg-white">
                      <option value="">—</option>
                      {levelSeries.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs text-steel-500 mb-1">Capacité</label>
                  <input type="number" value={c.capacity} onChange={e => updateClassroom(i, 'capacity', parseInt(e.target.value) || 50)}
                    className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
                </div>
              </div>
            </div>
          )
        })}

        <button type="button" onClick={addClassroom}
          className="w-full py-3 border border-dashed border-steel-300 rounded-xl text-sm text-steel-500 hover:border-brand hover:text-brand transition-colors">
          + Ajouter une classe
        </button>
        <p className="text-xs text-steel-400">{classrooms.length} classe(s)</p>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div className="flex justify-end pt-2">
          <button type="submit" disabled={saving || classrooms.length === 0}
            className="px-6 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
            {saving ? 'Création...' : 'Créer les classes et continuer'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Step 9: Matricule Config + Teachers ─────────────────────
function TeacherRow({ t, i, subjects, showLabels, onUpdate, onRemove }) {
  return (
    <div className="grid grid-cols-12 gap-2 items-end border-b border-steel-100 pb-2">
      <div className="col-span-3">
        {showLabels && <label className="block text-xs text-steel-500 mb-1">Nom complet *</label>}
        <input type="text" value={t.full_name} onChange={e => onUpdate(i, 'full_name', e.target.value)} placeholder="Nom complet"
          className="w-full px-2 py-1.5 border border-steel-200 rounded-lg text-xs focus:outline-none focus:border-brand" />
      </div>
      <div className="col-span-1">
        {showLabels && <label className="block text-xs text-steel-500 mb-1">Sexe</label>}
        <select value={t.gender || ''} onChange={e => onUpdate(i, 'gender', e.target.value || null)}
          className="w-full px-1 py-1.5 border border-steel-200 rounded-lg text-xs focus:outline-none focus:border-brand">
          <option value="">—</option>
          <option value="M">M</option>
          <option value="F">F</option>
        </select>
      </div>
      <div className="col-span-2">
        {showLabels && <label className="block text-xs text-steel-500 mb-1">Téléphone</label>}
        <input type="tel" value={t.phone || ''} onChange={e => onUpdate(i, 'phone', e.target.value)} placeholder="Tél."
          className="w-full px-2 py-1.5 border border-steel-200 rounded-lg text-xs focus:outline-none focus:border-brand" />
      </div>
      <div className="col-span-2">
        {showLabels && <label className="block text-xs text-steel-500 mb-1">Email</label>}
        <input type="email" value={t.email || ''} onChange={e => onUpdate(i, 'email', e.target.value)} placeholder="Email"
          className="w-full px-2 py-1.5 border border-steel-200 rounded-lg text-xs focus:outline-none focus:border-brand" />
      </div>
      <div className="col-span-2">
        {showLabels && <label className="block text-xs text-steel-500 mb-1">Qualifications</label>}
        <input type="text" value={t.qualification || ''} onChange={e => onUpdate(i, 'qualification', e.target.value)} placeholder="CAPES, Licence..."
          className="w-full px-2 py-1.5 border border-steel-200 rounded-lg text-xs focus:outline-none focus:border-brand" />
      </div>
      <div className="col-span-2">
        {showLabels && <label className="block text-xs text-steel-500 mb-1">Matière</label>}
        <div className="flex gap-1">
          <select value={t.subject_specialty_id || ''} onChange={e => onUpdate(i, 'subject_specialty_id', e.target.value ? parseInt(e.target.value) : null)}
            className="w-full px-1 py-1.5 border border-steel-200 rounded-lg text-xs focus:outline-none focus:border-brand">
            <option value="">—</option>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button type="button" onClick={() => onRemove(i)} className="text-red-400 hover:text-red-500 text-xs px-1 shrink-0">✕</button>
        </div>
      </div>
    </div>
  )
}

function Step9Teachers({ onNext }) {
  const [mode, setMode] = useState('custom')
  const [teachers, setTeachers] = useState([])
  const [subjects, setSubjects] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState(null)

  useEffect(() => {
    api.get('/api/onboarding/teachers-data').then(res => {
      setMode(res.data.matricule_mode || 'custom')
      setSubjects(res.data.subjects || [])
      if (res.data.teachers?.length > 0) {
        setTeachers(res.data.teachers.map(t => ({
          full_name: t.full_name, phone: t.phone || '', email: t.email || '',
          gender: t.gender || null, qualification: t.qualification || '',
          subject_specialty_id: t.subject_specialty_id || null,
        })))
      }
    }).catch(() => {})
  }, [])

  function addTeacher() {
    setTeachers(prev => [...prev, { full_name: '', phone: '', email: '', gender: null, qualification: '', subject_specialty_id: null }])
  }
  function updateTeacher(i, field, value) {
    setTeachers(prev => prev.map((t, idx) => idx === i ? { ...t, [field]: value } : t))
  }
  function removeTeacher(i) { setTeachers(prev => prev.filter((_, idx) => idx !== i)) }

  async function downloadTemplate() {
    try {
      const res = await api.get('/api/onboarding/teacher-template', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a'); a.href = url; a.download = 'modele_enseignants.xlsx'; a.click()
      URL.revokeObjectURL(url)
    } catch { setError('Impossible de télécharger le modèle') }
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true); setError('')
    try {
      const buf = await file.arrayBuffer()
      const res = await api.post('/api/onboarding/parse-teachers', buf, {
        headers: { 'Content-Type': 'application/octet-stream' },
      })
      setPreview(res.data)
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur de lecture du fichier')
    }
    setUploading(false)
  }

  function confirmPreview() {
    if (!preview?.parsed) return
    const newTeachers = preview.parsed
      .filter(p => p.full_name && !p.errors)
      .map(p => ({
        full_name: p.full_name,
        gender: p.gender,
        phone: p.phone || '',
        email: p.email || '',
        qualification: p.qualification || '',
        subject_specialty_id: p.subject_match?.id || null,
      }))
    const existingNames = new Set(teachers.map(t => t.full_name.trim().toLowerCase()))
    const deduped = newTeachers.filter(t => !existingNames.has(t.full_name.trim().toLowerCase()))
    setTeachers(prev => [...prev, ...deduped])
    setPreview(null)
  }

  function updatePreviewSubject(rowIdx, subjectId) {
    setPreview(prev => {
      const updated = { ...prev, parsed: prev.parsed.map((p, i) => {
        if (i !== rowIdx) return p
        const sub = prev.subjects.find(s => s.id === parseInt(subjectId))
        return { ...p, subject_match: sub ? { id: sub.id, name: sub.name, exact: true } : null, subject_warning: null }
      })}
      return updated
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const valid = teachers.filter(t => t.full_name.trim())
    if (valid.length === 0) { setError('Ajoutez au moins un enseignant'); return }
    setError(''); setSaving(true)
    try { await api.post('/api/onboarding/step9', { matricule_mode: mode, teachers: valid }); onNext() }
    catch (err) { setError(err.response?.data?.message || 'Erreur'); setSaving(false) }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-lg font-medium text-steel-900 mb-1">Enseignants et matricules</h2>
      <p className="text-sm text-steel-500 mb-6">Configurez le système de matricule et ajoutez les enseignants.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Matricule mode */}
        <div className="bg-white rounded-xl border border-steel-200 p-5">
          <p className="text-sm font-medium text-steel-700 mb-3">Système de matricule élèves</p>
          <div className="space-y-2">
            {[
              { value: 'custom', label: 'Auto-généré', desc: 'SCH-20260001, SCH-20260002...' },
              { value: 'manual', label: 'Manuel (optionnel)', desc: 'L\'école fournit ses propres numéros' },
            ].map(opt => (
              <label key={opt.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${mode === opt.value ? 'border-brand bg-brand-50' : 'border-steel-200 hover:border-steel-300'}`}>
                <input type="radio" name="mode" value={opt.value} checked={mode === opt.value} onChange={() => setMode(opt.value)}
                  className="mt-0.5 text-brand focus:ring-brand" />
                <div>
                  <p className="text-sm font-medium text-steel-700">{opt.label}</p>
                  <p className="text-xs text-steel-400">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
          <p className="text-xs text-steel-400 mt-3">
            Le numéro Educmaster est optionnel et indépendant de ce choix — une colonne dédiée est toujours disponible dans le modèle Excel d'import des élèves, et modifiable plus tard sur la fiche de chaque élève.
          </p>
        </div>

        {/* Upload section */}
        <div className="bg-white rounded-xl border border-steel-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-steel-700">Import Excel</p>
            <button type="button" onClick={downloadTemplate}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-brand text-brand rounded-lg text-xs font-medium hover:bg-brand-50 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Télécharger le modèle
            </button>
          </div>
          <p className="text-xs text-steel-400 mb-3">Remplissez le fichier Excel puis importez-le. Colonnes: Nom complet, Sexe, Téléphone, Email, Qualifications, Matière principale.</p>
          <label className={`flex items-center justify-center w-full py-3 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${uploading ? 'border-brand bg-brand-50' : 'border-steel-300 hover:border-brand hover:bg-steel-50'}`}>
            <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden" />
            {uploading ? (
              <span className="flex items-center gap-2 text-xs text-brand"><span className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" /> Analyse en cours...</span>
            ) : (
              <span className="text-xs text-steel-500">Cliquez pour importer un fichier Excel</span>
            )}
          </label>
        </div>

        {/* Upload preview */}
        {preview && (
          <div className="bg-white rounded-xl border border-steel-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-steel-700">
                Aperçu — {preview.parsed.filter(p => !p.errors).length}/{preview.total} enseignants valides
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPreview(null)}
                  className="px-3 py-1.5 border border-steel-300 text-steel-600 rounded-lg text-xs hover:bg-steel-50">Annuler</button>
                <button type="button" onClick={confirmPreview}
                  className="px-3 py-1.5 bg-brand text-white rounded-lg text-xs font-medium hover:bg-brand-600">
                  Ajouter {preview.parsed.filter(p => !p.errors).length} enseignants
                </button>
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {preview.parsed.map((p, i) => (
                <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs ${p.errors ? 'bg-red-50 border border-red-200' : p.subject_warning ? 'bg-yellow-50 border border-yellow-200' : 'bg-steel-50'}`}>
                  <span className="font-medium text-steel-700 w-48 truncate">{p.full_name}</span>
                  <span className="text-steel-500 w-8">{p.gender || '—'}</span>
                  <span className="text-steel-500 w-24 truncate">{p.phone || '—'}</span>
                  <span className="text-steel-500 w-32 truncate">{p.qualification || '—'}</span>
                  {p.errors ? (
                    <span className="text-red-500 flex-1">{p.errors.join(', ')}</span>
                  ) : p.subject_warning ? (
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-yellow-600 truncate">{p.subject_warning}</span>
                      <select value={p.subject_match?.id || ''} onChange={e => updatePreviewSubject(i, e.target.value)}
                        className="px-1 py-0.5 border border-yellow-300 rounded text-xs bg-white">
                        <option value="">— Ignorer —</option>
                        {preview.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  ) : (
                    <span className="text-brand flex-1 truncate">{p.subject_match?.name || '—'}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Teachers list */}
        <div className="bg-white rounded-xl border border-steel-200 p-5 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-steel-700">Enseignants ({teachers.filter(t => t.full_name.trim()).length})</p>
          </div>
          {teachers.length > 0 && (
            <div className="max-h-96 overflow-y-auto space-y-2">
              {teachers.map((t, i) => (
                <TeacherRow key={i} t={t} i={i} subjects={subjects} showLabels={i === 0}
                  onUpdate={updateTeacher} onRemove={removeTeacher} />
              ))}
            </div>
          )}
          {teachers.length === 0 && (
            <p className="text-xs text-steel-400 text-center py-4">Aucun enseignant ajouté. Importez un fichier Excel ou ajoutez manuellement.</p>
          )}
          <button type="button" onClick={addTeacher}
            className="w-full py-2 border border-dashed border-steel-300 rounded-lg text-xs text-steel-500 hover:border-brand hover:text-brand transition-colors">
            + Ajouter manuellement
          </button>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div className="flex justify-end pt-2">
          <button type="submit" disabled={saving}
            className="px-6 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
            {saving ? 'Enregistrement...' : 'Enregistrer et continuer'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Step 10: Students Import ────────────────────────────────
function Step10Students({ onNext }) {
  const [classrooms, setClassrooms] = useState([])
  const [counts, setCounts] = useState({})
  const [mode, setMode] = useState('custom')
  const [selectedClass, setSelectedClass] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState([])
  const [loadingPreview, setLoadingPreview] = useState(false)

  function loadData() {
    return api.get('/api/onboarding/student-data').then(res => {
      setClassrooms(res.data.classrooms || [])
      setCounts(res.data.student_counts || {})
      setMode(res.data.matricule_mode || 'custom')
      if (!selectedClass && res.data.classrooms?.length > 0) setSelectedClass(res.data.classrooms[0].id)
      setLoading(false)
    })
  }

  function loadPreview(classroomId) {
    if (!classroomId) { setPreview([]); return }
    setLoadingPreview(true)
    api.get(`/api/onboarding/class-students/${classroomId}`).then(res => {
      setPreview(res.data.students || [])
      setLoadingPreview(false)
    }).catch(() => { setPreview([]); setLoadingPreview(false) })
  }

  useEffect(() => { loadData() }, [])
  useEffect(() => { if (selectedClass) { loadPreview(selectedClass); setUploadResult(null) } }, [selectedClass])

  async function downloadTemplate(classroomId) {
    const res = await api.get(`/api/onboarding/student-template/${classroomId}`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = `${classrooms.find(c => c.id === classroomId)?.label || 'eleves'}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleUpload(classroomId, file) {
    setUploading(true)
    setUploadResult(null)
    try {
      const buf = await file.arrayBuffer()
      const res = await api.post(`/api/onboarding/upload-students/${classroomId}`, buf, {
        headers: { 'Content-Type': 'application/octet-stream' },
      })
      setUploadResult(res.data)
      await loadData()
      loadPreview(classroomId)
    } catch (err) {
      setUploadResult({ success: false, message: err.response?.data?.message || "Erreur d'import" })
    }
    setUploading(false)
  }

  async function handleClearClass(classroomId) {
    if (!confirm(`Supprimer tous les élèves de cette classe ? Vous pourrez ensuite réimporter un fichier.`)) return
    setClearing(true)
    try {
      await api.delete(`/api/onboarding/class-students/${classroomId}`)
      setUploadResult(null)
      await loadData()
      loadPreview(classroomId)
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur de suppression')
    }
    setClearing(false)
  }

  async function handleContinue() {
    setError(''); setSaving(true)
    try { await api.post('/api/onboarding/step10'); onNext() }
    catch (err) { setError(err.response?.data?.message || 'Erreur'); setSaving(false) }
  }

  if (loading) return <div className="text-center py-8"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto" /></div>

  const totalStudents = Object.values(counts).reduce((s, c) => s + c, 0)
  const classCount = counts[selectedClass] || 0

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-lg font-medium text-steel-900 mb-1">Import des élèves</h2>
      <p className="text-sm text-steel-500 mb-2">Importez un fichier Excel par classe. Téléchargez le modèle, remplissez-le, puis importez-le.</p>
      <p className="text-xs text-steel-400 italic mb-6">NB : vous pouvez presser continuer pour passer cette étape.</p>

      {/* Class tabs */}
      <div className="flex gap-2 flex-wrap mb-4">
        {classrooms.map(c => {
          const cnt = counts[c.id] || 0
          return (
            <button key={c.id} type="button" onClick={() => setSelectedClass(c.id)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${selectedClass === c.id ? 'bg-brand text-white' : cnt > 0 ? 'bg-brand-50 border border-brand-200 text-brand-700' : 'bg-white border border-steel-200 text-steel-600 hover:bg-steel-50'}`}>
              {c.label} <span className="ml-1 opacity-70">({cnt})</span>
            </button>
          )
        })}
      </div>

      {selectedClass && (
        <div className="space-y-4">
          {/* Upload / actions card */}
          <div className="bg-white rounded-xl border border-steel-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-steel-700">
                {classrooms.find(c => c.id === selectedClass)?.label}
                <span className="text-steel-400 font-normal ml-2">— {classCount} élève(s)</span>
              </p>
              <div className="flex gap-2">
                {classCount > 0 && (
                  <button type="button" onClick={() => handleClearClass(selectedClass)} disabled={clearing}
                    className="px-3 py-1.5 text-xs font-medium text-red-500 hover:text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50">
                    {clearing ? '...' : 'Supprimer et réimporter'}
                  </button>
                )}
                <button type="button" onClick={() => downloadTemplate(selectedClass)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand hover:text-brand-600 border border-brand-100 rounded-lg hover:bg-brand-50 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Modèle Excel
                </button>
              </div>
            </div>

            {/* Upload zone — show when class is empty */}
            {classCount === 0 && (
              <label className={`flex flex-col items-center justify-center w-full py-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${uploading ? 'border-brand bg-brand-50' : 'border-steel-300 hover:border-brand hover:bg-steel-50'}`}>
                <input type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={e => { if (e.target.files[0]) handleUpload(selectedClass, e.target.files[0]); e.target.value = '' }} />
                {uploading ? (
                  <span className="flex items-center gap-2 text-xs text-brand"><span className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" /> Import en cours...</span>
                ) : (
                  <>
                    <svg className="w-8 h-8 text-steel-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-sm text-steel-500">Cliquer pour importer le fichier Excel</p>
                    <p className="text-xs text-steel-400 mt-1">.xlsx — un fichier par classe</p>
                  </>
                )}
              </label>
            )}

            {/* Upload result toast */}
            {uploadResult && (
              <div className={`rounded-lg p-3 text-sm ${uploadResult.success ? 'bg-brand-50 text-brand-600' : 'bg-red-50 text-red-600'}`}>
                <p className="font-medium">{uploadResult.message}</p>
                {uploadResult.errors?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {uploadResult.errors.map((err, i) => (
                      <p key={i} className="text-xs">Ligne {err.row}: {err.message}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Preview table */}
          {classCount > 0 && (
            <div className="bg-white rounded-xl border border-steel-200 p-5">
              <p className="text-sm font-medium text-steel-700 mb-3">Aperçu des élèves importés</p>
              {loadingPreview ? (
                <div className="text-center py-4"><div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto" /></div>
              ) : (
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-steel-50">
                      <tr className="text-left text-steel-500">
                        <th className="px-2 py-2 font-medium">#</th>
                        <th className="px-2 py-2 font-medium">Nom complet</th>
                        <th className="px-2 py-2 font-medium">Sexe</th>
                        <th className="px-2 py-2 font-medium">Naissance</th>
                        <th className="px-2 py-2 font-medium">Lieu</th>
                        <th className="px-2 py-2 font-medium">Tuteur</th>
                        <th className="px-2 py-2 font-medium">Relation</th>
                        <th className="px-2 py-2 font-medium">Tél. tuteur</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-steel-100">
                      {preview.map((s, i) => (
                        <tr key={s.id} className="hover:bg-steel-50">
                          <td className="px-2 py-1.5 text-steel-400">{i + 1}</td>
                          <td className="px-2 py-1.5 text-steel-800 font-medium">{s.full_name}</td>
                          <td className="px-2 py-1.5 text-steel-600">{s.gender || '—'}</td>
                          <td className="px-2 py-1.5 text-steel-600">{s.birth_date || '—'}</td>
                          <td className="px-2 py-1.5 text-steel-600">{s.birth_place || '—'}</td>
                          <td className="px-2 py-1.5 text-steel-600">{s.guardian_name || '—'}</td>
                          <td className="px-2 py-1.5 text-steel-600">{s.guardian_relationship || '—'}</td>
                          <td className="px-2 py-1.5 text-steel-600">{s.guardian_phone || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-steel-500">{totalStudents} élève(s) au total</p>
        <div>
          {error && <span className="text-red-500 text-sm mr-3">{error}</span>}
          <button onClick={handleContinue} disabled={saving || totalStudents === 0}
            className="px-6 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
            {saving ? 'Enregistrement...' : 'Continuer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Step 11: Teacher Assignments ────────────────────────────
function Step11Assignments({ onNext }) {
  const [classrooms, setClassrooms] = useState([])
  const [teachers, setTeachers] = useState([])
  const [levelSubjects, setLevelSubjects] = useState([])
  const [assignments, setAssignments] = useState([])
  const [selectedClass, setSelectedClass] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api/onboarding/assignment-data').then(res => {
      setClassrooms(res.data.classrooms || [])
      setTeachers(res.data.teachers || [])
      setLevelSubjects(res.data.level_subjects || [])
      setAssignments(res.data.existing_assignments || [])
      if (res.data.classrooms?.length > 0) setSelectedClass(res.data.classrooms[0].id)
      setLoading(false)
    })
  }, [])

  function getTeacherForSubject(classroomId, subjectId) {
    const a = assignments.find(x => x.classroom_id === classroomId && x.subject_id === subjectId)
    return a?.teacher_id || ''
  }

  function setTeacherForSubject(classroomId, subjectId, teacherId) {
    setAssignments(prev => {
      const filtered = prev.filter(x => !(x.classroom_id === classroomId && x.subject_id === subjectId))
      if (teacherId) filtered.push({ classroom_id: classroomId, subject_id: subjectId, teacher_id: parseInt(teacherId) })
      return filtered
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setSaving(true)
    try { await api.post('/api/onboarding/step11', { assignments }); onNext() }
    catch (err) { setError(err.response?.data?.message || 'Erreur'); setSaving(false) }
  }

  if (loading) return <div className="text-center py-8"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto" /></div>

  const currentClassroom = classrooms.find(c => c.id === selectedClass)
  const subjects = currentClassroom ? levelSubjects.filter(ls => ls.level_id === currentClassroom.level_id) : []

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-lg font-medium text-steel-900 mb-1">Affectation des enseignants</h2>
      <p className="text-sm text-steel-500 mb-2">Assignez un enseignant par matière et par classe.</p>
      <p className="text-xs text-steel-400 italic mb-6">NB : vous pouvez presser continuer pour passer cette étape.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-2 flex-wrap">
          {classrooms.map(c => {
            const count = assignments.filter(a => a.classroom_id === c.id).length
            return (
              <button key={c.id} type="button" onClick={() => setSelectedClass(c.id)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${selectedClass === c.id ? 'bg-brand text-white' : 'bg-white border border-steel-200 text-steel-600 hover:bg-steel-50'}`}>
                {c.label} {count > 0 && <span className="ml-1 opacity-70">({count})</span>}
              </button>
            )
          })}
        </div>

        {currentClassroom && subjects.length > 0 && (
          <div className="bg-white rounded-xl border border-steel-200 p-5">
            <p className="text-sm font-medium text-steel-700 mb-3">{currentClassroom.label} — {currentClassroom.level_name}</p>
            <div className="space-y-2">
              {subjects.map(sub => (
                <div key={sub.subject_id} className="flex items-center gap-3">
                  <span className="text-sm text-steel-700 w-48">{sub.subject_name}</span>
                  <select value={getTeacherForSubject(selectedClass, sub.subject_id)}
                    onChange={e => setTeacherForSubject(selectedClass, sub.subject_id, e.target.value)}
                    className="flex-1 px-3 py-1.5 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand bg-white">
                    <option value="">— Non assigné —</option>
                    {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-steel-400">{assignments.length} affectation(s) au total</p>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div className="flex justify-end pt-2">
          <button type="submit" disabled={saving}
            className="px-6 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
            {saving ? 'Enregistrement...' : 'Enregistrer et continuer'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Step 12: Fee Types (PRO only) ───────────────────────────
function Step12Fees({ onNext }) {
  const [isPro, setIsPro] = useState(false)
  const [levels, setLevels] = useState([])
  const [rate, setRate] = useState(0)
  const [fees, setFees] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [autoSkip, setAutoSkip] = useState(false)

  useEffect(() => {
    api.get('/api/onboarding/fee-data').then(res => {
      setIsPro(res.data.is_pro)
      setLevels(res.data.levels || [])
      setRate(res.data.rate_per_student || 0)
      const existing = (res.data.existing_fees || []).filter(f => !f.is_system)
      if (existing.length > 0) {
        setFees(existing.map(f => ({
          name: f.name, is_mandatory: f.is_mandatory,
          display_order: f.display_order,
          amounts: (f.amounts || []).reduce((m, a) => { m[a.level_id || 'default'] = a.amount; return m }, {}),
        })))
      }
      setLoading(false)
      if (!res.data.is_pro) setAutoSkip(true)
    })
  }, [])

  useEffect(() => {
    if (autoSkip) { api.post('/api/onboarding/step12', { fees: [] }).then(() => onNext()) }
  }, [autoSkip, onNext])

  function addFee() {
    setFees(prev => [...prev, { name: '', is_mandatory: true, display_order: (prev.length + 1) * 10, amounts: {} }])
  }
  function updateFee(i, field, value) { setFees(prev => prev.map((f, idx) => idx === i ? { ...f, [field]: value } : f)) }
  function updateAmount(i, levelKey, value) {
    setFees(prev => prev.map((f, idx) => idx === i ? { ...f, amounts: { ...f.amounts, [levelKey]: value } } : f))
  }
  function removeFee(i) { setFees(prev => prev.filter((_, idx) => idx !== i)) }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setSaving(true)
    const payload = fees.filter(f => f.name?.trim()).map(f => ({
      name: f.name.trim(), is_mandatory: f.is_mandatory, display_order: f.display_order || 0,
      amounts: Object.entries(f.amounts).filter(([, v]) => v > 0).map(([k, v]) => ({
        level_id: k === 'default' ? null : parseInt(k), amount: parseFloat(v),
      })),
    }))
    try { await api.post('/api/onboarding/step12', { fees: payload }); onNext() }
    catch (err) { setError(err.response?.data?.message || 'Erreur'); setSaving(false) }
  }

  if (loading || autoSkip) return <div className="text-center py-8"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto" /></div>

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-lg font-medium text-steel-900 mb-1">Frais de scolarité</h2>
      <p className="text-sm text-steel-500 mb-2">Définissez les frais par niveau. Les montants peuvent varier selon le niveau.</p>
      <p className="text-xs text-steel-400 italic mb-6">NB : vous pouvez passer cette étape et configurer les frais plus tard dans les paramètres financiers.</p>

      {rate > 0 && (
        <div className="bg-blue-50 rounded-lg border border-blue-200 p-3 mb-4">
          <p className="text-xs text-blue-700">
            Le frais de gestion scolaire ({new Intl.NumberFormat('fr-FR').format(rate)} F / élève) sera ajouté automatiquement.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {fees.map((f, i) => (
          <div key={i} className="bg-white rounded-xl border border-steel-200 p-5 space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex-1 grid grid-cols-12 gap-3">
                <div className="col-span-5">
                  <label className="block text-xs text-steel-500 mb-1">Nom du frais</label>
                  <input type="text" value={f.name || ''} onChange={e => updateFee(i, 'name', e.target.value)}
                    placeholder="Ex: Scolarité, Inscription..." className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
                </div>
                <div className="col-span-3">
                  <label className="block text-xs text-steel-500 mb-1">Type</label>
                  <select value={f.is_mandatory ? '1' : '0'} onChange={e => updateFee(i, 'is_mandatory', e.target.value === '1')}
                    className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
                    <option value="1">Obligatoire</option>
                    <option value="0">Optionnel</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-steel-500 mb-1">Ordre</label>
                  <input type="number" min="0" value={f.display_order || ''} onChange={e => updateFee(i, 'display_order', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
                </div>
                <div className="col-span-2 flex items-end">
                  <button type="button" onClick={() => removeFee(i)} className="text-red-400 hover:text-red-500 text-sm py-1.5 px-2">✕ Supprimer</button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs text-steel-500 mb-2">Montants par niveau</label>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-steel-500 w-24">Tous niveaux</span>
                  <input type="number" min="0" value={f.amounts?.default || ''} onChange={e => updateAmount(i, 'default', parseInt(e.target.value) || 0)}
                    placeholder="Montant par défaut" className="flex-1 px-2 py-1.5 border border-steel-200 rounded-lg text-xs focus:outline-none focus:border-brand" />
                </div>
                {levels.map(l => (
                  <div key={l.id} className="flex items-center gap-2">
                    <span className="text-xs text-steel-500 w-24 truncate">{l.name}</span>
                    <input type="number" min="0" value={f.amounts?.[l.id] || ''} onChange={e => updateAmount(i, l.id, parseInt(e.target.value) || 0)}
                      placeholder="—" className="flex-1 px-2 py-1.5 border border-steel-200 rounded-lg text-xs focus:outline-none focus:border-brand" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}

        <button type="button" onClick={addFee}
          className="w-full py-2.5 border border-dashed border-steel-300 rounded-lg text-sm text-steel-500 hover:border-brand hover:text-brand transition-colors">
          + Ajouter un type de frais
        </button>

        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div className="flex justify-end pt-2">
          <button type="submit" disabled={saving}
            className="px-6 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
            {saving ? 'Enregistrement...' : 'Enregistrer et continuer'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Step 13: Finalization ───────────────────────────────────
function Step13Finalize({ onComplete }) {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api/onboarding/summary').then(res => { setSummary(res.data); setLoading(false) })
  }, [])

  async function handleFinalize() {
    setError(''); setSaving(true)
    try { await api.post('/api/onboarding/step13'); onComplete() }
    catch (err) { setError(err.response?.data?.message || 'Erreur'); setSaving(false) }
  }

  if (loading) return <div className="text-center py-8"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto" /></div>

  return (
    <div className="max-w-lg mx-auto">
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-brand/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-medium text-steel-900">Finalisation</h2>
        <p className="text-sm text-steel-500 mt-1">{summary?.school_name} — {summary?.academic_year}</p>
      </div>

      <div className="bg-white rounded-xl border border-steel-200 p-5 space-y-2 mb-6">
        {summary?.checks?.map((check, i) => (
          <div key={i} className="flex items-center justify-between py-1.5 border-b border-steel-50 last:border-0">
            <div className="flex items-center gap-2">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${check.ok ? 'bg-brand-50 text-brand' : 'bg-red-50 text-red-500'}`}>
                {check.ok ? '✓' : '✕'}
              </span>
              <span className="text-sm text-steel-700">{check.label}</span>
            </div>
            <span className="text-sm text-steel-500">{check.value}</span>
          </div>
        ))}
      </div>

      {!summary?.all_ok && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
          <p className="text-xs text-yellow-700">Certains éléments sont manquants. Vous pouvez continuer, mais la configuration sera incomplète.</p>
        </div>
      )}

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      <button onClick={handleFinalize} disabled={saving}
        className="w-full py-3 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
        {saving ? 'Finalisation...' : 'Terminer la configuration'}
      </button>
    </div>
  )
}

// ─── Main Wizard ─────────────────────────────────────────────
export default function OnboardingWizard({ onComplete }) {
  const [currentStep, setCurrentStep] = useState(1)
  const [school, setSchool] = useState(null)
  const [license, setLicense] = useState(null)
  const [features, setFeatures] = useState([])
  const [size, setSize] = useState(null)
  const [semesters, setSemesters] = useState(3)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadStatus() {
      try {
        const res = await api.get('/api/onboarding/status')
        setCurrentStep(res.data.current_step)
        setSchool(res.data.school)
        setLicense(res.data.license)
        setFeatures(res.data.features || [])
        setSize(res.data.size || null)
        setSemesters(res.data.semesters_active || 3)
        if (res.data.is_configured) onComplete && onComplete()
      } catch { setTimeout(loadStatus, 1000); return }
      setLoading(false)
    }
    loadStatus()
  }, [onComplete])

  function advance() {
    const next = currentStep + 1
    setCurrentStep(next)
    if (next > 13) onComplete && onComplete()
  }

  async function goBack() {
    try {
      const res = await api.post('/api/onboarding/back')
      setCurrentStep(res.data.current_step)
    } catch { /* already at start */ }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-steel-50">
      <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
    </div>
  )

  function renderStep() {
    switch (currentStep) {
      case 1: return <Step1Confirm school={school} license={license} features={features} size={size} semesters={semesters} onNext={advance} />
      case 2: return <Step2Accounts license={license} onNext={advance} />
      case 3: return <Step3AcademicYear onNext={advance} />
      case 4: return <Step4Levels onNext={advance} />
      case 5: return <Step5Series onNext={advance} />
      case 6: return <Step6Subjects onNext={advance} />
      case 7: return <Step7Assessments onNext={advance} />
      case 8: return <Step8Classrooms onNext={advance} />
      case 9: return <Step9Teachers onNext={advance} />
      case 10: return <Step10Students onNext={advance} />
      case 11: return <Step11Assignments onNext={advance} />
      case 12: return <Step12Fees onNext={advance} />
      case 13: return <Step13Finalize onComplete={() => onComplete && onComplete()} />
      default: return null
    }
  }

  return (
    <div className="min-h-screen bg-steel-50">
      <div className="bg-white border-b border-steel-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 bg-steel-900 rounded-xl flex items-center justify-center">
            <span className="text-brand-200 text-sm font-semibold">S</span>
          </div>
          <div>
            <p className="text-sm font-medium text-steel-800">ScolaDesk — Configuration</p>
            <p className="text-xs text-steel-400">{school?.school_name || ''}</p>
          </div>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <ProgressBar current={currentStep} total={13} />
        {currentStep > 1 && (
          <button onClick={goBack}
            className="flex items-center gap-1.5 text-sm text-steel-500 hover:text-steel-700 mb-4 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Précédent
          </button>
        )}
        {renderStep()}
      </div>
    </div>
  )
}
