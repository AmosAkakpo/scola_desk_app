import { useState, useEffect, useCallback } from 'react'
import api from '../../utils/api'
import ConfirmModal from '../../components/ConfirmModal'

// Fin d'année wizard: Étape 1 (checklist) -> Étape 2 (résultats examens) ->
// Étape 3 (aperçu) -> Étape 4 (exécution) -> Étape 5 (historique/rollback).

// Best-effort guess for the new year's label -- always shown as an editable,
// pre-filled field the admin confirms or changes, never applied silently.
function suggestNextLabel(label) {
  const m = /^(\d{4})-(\d{4})$/.exec(label || '')
  if (!m) return ''
  return `${parseInt(m[1]) + 1}-${parseInt(m[2]) + 1}`
}
const STATUS_STYLES = {
  ok: 'border-green-200 bg-green-50 text-green-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  blocked: 'border-red-200 bg-red-50 text-red-700',
}
const STATUS_ICON = { ok: '✓', warning: '!', blocked: '✕' }

export default function FinAnneePage() {
  const [step, setStep] = useState(1)
  const [yearId, setYearId] = useState(null)
  const [yearLabel, setYearLabel] = useState('')
  const [loading, setLoading] = useState(true)
  const [previewRows, setPreviewRows] = useState([])
  const [overrides, setOverrides] = useState([])

  useEffect(() => {
    api.get('/api/settings/academic').then(res => {
      setYearId(res.data.academic_year?.id || null)
      setYearLabel(res.data.academic_year?.label || '')
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
  if (!yearId) return <p className="text-sm text-steel-500">Aucune année académique active.</p>

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-steel-900">Fin d'année — {yearLabel}</h1>
        <p className="text-sm text-steel-500 mt-1">Vérifications, résultats d'examens, promotion des élèves.</p>
      </div>

      <div className="flex items-center gap-2 text-xs text-steel-500">
        {['Vérifications', 'Résultats examens', 'Aperçu', 'Exécution', 'Historique'].map((label, i) => (
          <div key={label} className={`px-3 py-1.5 rounded-full ${step === i + 1 ? 'bg-brand text-white font-medium' : 'bg-steel-100'}`}>
            {i + 1}. {label}
          </div>
        ))}
      </div>

      {step === 1 && <Etape1Checklist yearId={yearId} onNext={() => setStep(2)} />}
      {step === 2 && <Etape2ExamResults yearId={yearId} onBack={() => setStep(1)} onNext={() => setStep(3)} />}
      {step === 3 && (
        <Etape3Preview yearId={yearId}
          onBack={() => setStep(2)}
          onNext={(rows, overrides) => { setPreviewRows(rows); setOverrides(overrides); setStep(4) }}
        />
      )}
      {step === 4 && (
        <Etape4Execute yearId={yearId} yearLabel={yearLabel} overrides={overrides} previewRows={previewRows}
          onBack={() => setStep(3)}
          onDone={() => setStep(5)}
        />
      )}
      {step === 5 && <Etape5History />}
    </div>
  )
}

// ─── Étape 1 — Checklist ──────────────────────────────────────
function Etape1Checklist({ yearId, onNext }) {
  const [gates, setGates] = useState([])
  const [canProceed, setCanProceed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toggles, setToggles] = useState({ notes: false, bulletins: false, salaires: false })
  const [showConfirm, setShowConfirm] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.get(`/api/promotion/checklist/${yearId}`).then(res => {
      setGates(res.data.gates || [])
      setCanProceed(res.data.can_proceed)
      setLoading(false)
    })
  }, [yearId])

  // Manual toggles are self-declared and reset every time this step opens —
  // a stale "salaires payés" checked last year must not silently carry over.
  useEffect(() => { load(); setToggles({ notes: false, bulletins: false, salaires: false }) }, [load])

  const allToggled = toggles.notes && toggles.bulletins && toggles.salaires
  const ready = canProceed && allToggled

  return (
    <div className="bg-white rounded-xl border border-steel-200 p-6 space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-steel-800 mb-3">Vérifications automatiques</h2>
        {loading ? (
          <p className="text-sm text-steel-400">Chargement...</p>
        ) : (
          <div className="space-y-2">
            {gates.map(g => (
              <div key={g.key} className={`flex items-center justify-between px-4 py-2.5 rounded-lg border text-sm ${STATUS_STYLES[g.status]}`}>
                <span className="flex items-center gap-2">
                  <span className="font-bold">{STATUS_ICON[g.status]}</span>
                  {g.label}
                </span>
                <span className="text-xs">{g.detail}</span>
              </div>
            ))}
            {gates.some(g => g.key.startsWith('exam_results_') && g.status === 'blocked') && (
              <p className="text-xs text-steel-400">
                Saisissez les résultats manquants à l'étape suivante.
              </p>
            )}
          </div>
        )}
        <button onClick={load} className="mt-2 text-xs text-brand hover:underline">Actualiser</button>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-steel-800 mb-3">Confirmations (non vérifiées automatiquement)</h2>
        <div className="space-y-2">
          {[
            { key: 'notes', label: 'Les notes ont été vérifiées par les élèves/parents' },
            { key: 'bulletins', label: 'Les bulletins ont été remis' },
            { key: 'salaires', label: 'Tous les salaires du personnel ont été payés' },
          ].map(t => (
            <label key={t.key} className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-steel-200 text-sm text-steel-700 cursor-pointer hover:bg-steel-50">
              <input type="checkbox" checked={toggles[t.key]}
                onChange={e => setToggles(prev => ({ ...prev, [t.key]: e.target.checked }))}
                className="w-4 h-4 accent-brand" />
              {t.label}
            </label>
          ))}
        </div>
      </div>

      <button onClick={() => setShowConfirm(true)} disabled={!ready}
        className="w-full py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium">
        Commencer la promotion
      </button>

      {showConfirm && (
        <ConfirmModal
          title="Terminer l'année scolaire ?"
          message="Cette action lance le processus de fin d'année. Vous pourrez encore annuler après l'exécution finale (fenêtre de 30 jours)."
          confirmLabel="Oui, continuer"
          onCancel={() => setShowConfirm(false)}
          onConfirm={() => { setShowConfirm(false); onNext() }}
        />
      )}
    </div>
  )
}

// ─── Étape 2 — Exam results entry ─────────────────────────────
function Etape2ExamResults({ yearId, onBack, onNext }) {
  const [examTypes, setExamTypes] = useState([]) // exam types needing entry (mode != moyenne_only)
  const [loading, setLoading] = useState(true)
  const [activeExam, setActiveExam] = useState('')

  useEffect(() => {
    api.get('/api/promotion/exam-cohort-levels').then(res => {
      // Entry is always required for every cohort level, regardless of its
      // passing mode -- the mode only decides whether the score counts
      // toward the verdict, never whether it needs to be recorded.
      const unique = [...new Set((res.data.levels || []).filter(l => l.is_exam_cohort).map(l => l.exam_name))]
      setExamTypes(unique)
      setActiveExam(unique[0] || '')
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="bg-white rounded-xl border border-steel-200 p-6"><p className="text-sm text-steel-400">Chargement...</p></div>

  if (examTypes.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-steel-200 p-6 space-y-4">
        <p className="text-sm text-steel-500">Aucun examen national configuré (Paramètres → Structure académique → Examens nationaux).</p>
        <div className="flex gap-3">
          <button onClick={onBack} className="px-4 py-2 border border-steel-200 rounded-lg text-sm text-steel-600 hover:bg-steel-50">Retour</button>
          <button onClick={onNext} className="px-4 py-2 bg-brand hover:bg-brand-600 text-white rounded-lg text-sm font-medium">Continuer</button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
      <div className="flex border-b border-steel-200">
        {examTypes.map(t => (
          <button key={t} onClick={() => setActiveExam(t)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeExam === t ? 'border-brand text-brand' : 'border-transparent text-steel-500 hover:text-steel-700'}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="p-6">
        {activeExam && <ExamGrid yearId={yearId} examType={activeExam} />}
      </div>
      <div className="flex gap-3 px-6 pb-6">
        <button onClick={onBack} className="px-4 py-2 border border-steel-200 rounded-lg text-sm text-steel-600 hover:bg-steel-50">Retour</button>
        <button onClick={onNext} className="px-4 py-2 bg-brand hover:bg-brand-600 text-white rounded-lg text-sm font-medium">Continuer</button>
      </div>
    </div>
  )
}

function ExamGrid({ yearId, examType }) {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    api.get(`/api/promotion/exam-results/${yearId}/${examType}`).then(res => {
      setStudents(res.data.students || [])
      setLoading(false)
    })
  }, [yearId, examType])

  useEffect(() => { load() }, [load])

  async function updateField(student, field, value) {
    setStudents(prev => prev.map(s => s.student_id === student.student_id ? { ...s, [field]: value } : s))
  }

  async function save(student) {
    setSavingId(student.student_id)
    await api.post('/api/promotion/exam-results', {
      student_id: student.student_id,
      academic_year_id: yearId,
      exam_type: examType,
      result: student.result || null,
      score: student.score ? parseFloat(student.score) : null,
      serie: student.serie || null,
      registration_number: student.registration_number || null,
    })
    setSavingId(null)
  }

  if (loading) return <p className="text-sm text-steel-400">Chargement...</p>
  if (students.length === 0) return <p className="text-sm text-steel-400">Aucun élève dans ce cohorte.</p>

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-steel-200">
          <th className="text-left py-2 text-steel-500 font-medium">Élève</th>
          <th className="text-left py-2 text-steel-500 font-medium">Classe</th>
          <th className="text-center py-2 text-steel-500 font-medium">Résultat</th>
          <th className="text-center py-2 text-steel-500 font-medium">Note</th>
          <th className="text-center py-2 text-steel-500 font-medium"></th>
        </tr>
      </thead>
      <tbody>
        {students.map(s => (
          <tr key={s.student_id} className="border-b border-steel-50">
            <td className="py-2 text-steel-700">{s.full_name}</td>
            <td className="py-2 text-steel-500">{s.classroom_label}</td>
            <td className="py-2 text-center">
              <select value={s.result || ''} onChange={e => updateField(s, 'result', e.target.value)}
                className="px-2 py-1 border border-steel-200 rounded text-xs bg-white focus:outline-none focus:border-brand">
                <option value="">—</option>
                <option value="admis">Admis</option>
                <option value="recalé">Recalé</option>
                <option value="absent">Absent</option>
              </select>
            </td>
            <td className="py-2 text-center">
              <input type="number" step="0.01" min="0" max="20" value={s.score ?? ''} onChange={e => updateField(s, 'score', e.target.value)}
                className="w-16 px-1 py-1 border border-steel-200 rounded text-xs text-center focus:outline-none focus:border-brand" />
            </td>
            <td className="py-2 text-center">
              <button onClick={() => save(s)} disabled={savingId === s.student_id}
                className="px-2 py-1 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded text-xs">
                {savingId === s.student_id ? '...' : 'Enregistrer'}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ─── Étape 3 — Aperçu (verdicts + overrides) ──────────────────
const VERDICT_LABEL = { admis: 'Admis', doublant: 'Doublant', exclu: 'Exclu' }
const VERDICT_STYLE = { admis: 'text-green-600', doublant: 'text-amber-600', exclu: 'text-red-600' }

function Etape3Preview({ yearId, onBack, onNext }) {
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [overrideDrafts, setOverrideDrafts] = useState({}) // student_id -> { verdict, reason }
  const [editingId, setEditingId] = useState(null)

  const load = useCallback((overrides = []) => {
    setLoading(true)
    api.post(`/api/promotion/preview/${yearId}`, { overrides }).then(res => {
      setRows(res.data.rows || [])
      setSummary(res.data.summary)
      setLoading(false)
    })
  }, [yearId])

  useEffect(() => { load() }, [load])

  function applyOverride(row) {
    const draft = overrideDrafts[row.student_id]
    if (!draft?.verdict || !draft?.reason?.trim()) return
    const overrides = Object.entries(overrideDrafts)
      .filter(([, d]) => d.verdict && d.reason?.trim())
      .map(([student_id, d]) => ({ student_id: parseInt(student_id), verdict: d.verdict, reason: d.reason.trim() }))
    setEditingId(null)
    load(overrides)
  }

  function getCurrentOverrides() {
    return Object.entries(overrideDrafts)
      .filter(([, d]) => d.verdict && d.reason?.trim())
      .map(([student_id, d]) => ({ student_id: parseInt(student_id), verdict: d.verdict, reason: d.reason.trim() }))
  }

  if (loading && rows.length === 0) return <div className="bg-white rounded-xl border border-steel-200 p-6"><p className="text-sm text-steel-400">Calcul en cours...</p></div>

  return (
    <div className="bg-white rounded-xl border border-steel-200 p-6 space-y-4">
      {summary && (
        <div className="flex gap-4 text-sm">
          <span className="text-green-600 font-medium">{summary.admis} admis</span>
          <span className="text-amber-600 font-medium">{summary.doublant} doublant(s)</span>
          <span className="text-steel-600 font-medium">{summary.graduated} diplômé(s)</span>
          {summary.exclu > 0 && <span className="text-red-600 font-medium">{summary.exclu} exclu(s) (override)</span>}
          {summary.excluded_from_calc > 0 && (
            <span className="text-steel-400">{summary.excluded_from_calc} élève(s) exclu(s) du calcul (renvoyés/transférés)</span>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-steel-200">
              <th className="text-left py-2 text-steel-500 font-medium">Élève</th>
              <th className="text-left py-2 text-steel-500 font-medium">Classe</th>
              <th className="text-center py-2 text-steel-500 font-medium">Moyenne</th>
              <th className="text-center py-2 text-steel-500 font-medium">Verdict</th>
              <th className="text-left py-2 text-steel-500 font-medium">Destination</th>
              <th className="text-center py-2 text-steel-500 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.student_id} className={`border-b border-steel-50 ${r.borderline ? 'bg-amber-50/50' : ''}`}>
                <td className="py-2 text-steel-700">{r.full_name}</td>
                <td className="py-2 text-steel-500">{r.source_classroom}</td>
                <td className="py-2 text-center">
                  {r.annual_average ?? '—'}
                  {r.borderline && <span className="ml-1 text-amber-500" title="Cas limite">⚠</span>}
                </td>
                <td className={`py-2 text-center font-medium ${VERDICT_STYLE[r.verdict] || ''}`}>
                  {VERDICT_LABEL[r.verdict] || r.verdict}
                  {r.override_reason && <span className="block text-steel-400 font-normal text-xs">(modifié)</span>}
                </td>
                <td className="py-2 text-steel-500">
                  {r.graduated ? 'Diplômé' : r.target_classroom ? `${r.target_classroom}${r.target_is_new_level ? ' (nouvelle)' : ''}` : '—'}
                </td>
                <td className="py-2 text-center">
                  <button onClick={() => setEditingId(editingId === r.student_id ? null : r.student_id)}
                    className="text-xs text-brand hover:underline">Modifier</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingId && (() => {
        const row = rows.find(r => r.student_id === editingId)
        const draft = overrideDrafts[editingId] || {}
        return (
          <ConfirmModal
            title={`Modifier le verdict — ${row?.full_name}`}
            message="La modification manuelle nécessite un motif."
            confirmLabel="Appliquer"
            onCancel={() => setEditingId(null)}
            onConfirm={() => applyOverride(row)}
          >
            <div className="space-y-2">
              <select value={draft.verdict || ''} onChange={e => setOverrideDrafts(prev => ({ ...prev, [editingId]: { ...prev[editingId], verdict: e.target.value } }))}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
                <option value="">— Choisir un verdict —</option>
                <option value="admis">Admis</option>
                <option value="doublant">Doublant</option>
                <option value="exclu">Exclu</option>
              </select>
              <textarea value={draft.reason || ''} onChange={e => setOverrideDrafts(prev => ({ ...prev, [editingId]: { ...prev[editingId], reason: e.target.value } }))}
                placeholder="Motif (obligatoire)" rows={2}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
            </div>
          </ConfirmModal>
        )
      })()}

      <div className="flex gap-3">
        <button onClick={onBack} className="px-4 py-2 border border-steel-200 rounded-lg text-sm text-steel-600 hover:bg-steel-50">Retour</button>
        <button onClick={() => onNext(rows, getCurrentOverrides())}
          className="px-4 py-2 bg-brand hover:bg-brand-600 text-white rounded-lg text-sm font-medium">
          Continuer vers l'exécution
        </button>
      </div>
    </div>
  )
}

// ─── Étape 4 — Exécution ──────────────────────────────────────
function Etape4Execute({ yearId, yearLabel, overrides, previewRows, onDone, onBack }) {
  const [newLabel, setNewLabel] = useState(suggestNextLabel(yearLabel))
  const [carryForward, setCarryForward] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState('')

  const summary = previewRows.reduce((acc, r) => {
    const key = r.graduated ? 'graduated' : r.verdict
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  async function handleExecute() {
    setExecuting(true)
    setError('')
    try {
      await api.post(`/api/promotion/execute/${yearId}`, {
        overrides,
        carry_forward_assignments: carryForward,
        new_year_label: newLabel.trim(),
        confirm_text: 'PROMOTION',
      })
      setShowConfirm(false)
      onDone()
    } catch (err) {
      setError(err.response?.data?.message || err.friendlyMessage || 'Erreur lors de la promotion')
      setExecuting(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-steel-200 p-6 space-y-5">
      <div>
        <label className="block text-xs text-steel-500 mb-1">Libellé de la nouvelle année académique</label>
        <input type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)}
          placeholder="Ex: 2026-2027"
          className="w-full max-w-xs px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
      </div>

      <label className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-steel-200 text-sm text-steel-700 cursor-pointer hover:bg-steel-50 w-fit">
        <input type="checkbox" checked={carryForward} onChange={e => setCarryForward(e.target.checked)} className="w-4 h-4 accent-brand" />
        Reporter les affectations d'enseignants et l'emploi du temps
      </label>

      <div className="text-sm text-steel-600 bg-steel-50 rounded-lg px-4 py-3">
        <p className="font-medium mb-1">Récapitulatif</p>
        <p className="text-xs">
          {summary.admis || 0} admis · {summary.doublant || 0} doublant(s) · {summary.graduated || 0} diplômé(s)
          {summary.exclu ? ` · ${summary.exclu} exclu(s)` : ''}
        </p>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-3">
        <button onClick={onBack} disabled={executing} className="px-4 py-2 border border-steel-200 rounded-lg text-sm text-steel-600 hover:bg-steel-50 disabled:opacity-50">Retour</button>
        <button onClick={() => setShowConfirm(true)} disabled={executing || !newLabel.trim()}
          className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white rounded-lg text-sm font-medium">
          Exécuter la promotion
        </button>
      </div>

      {showConfirm && (
        <ConfirmModal
          title="Confirmer la promotion"
          message="Cette action crée la nouvelle année académique et réinscrit les élèves. Une annulation reste possible pendant 30 jours."
          requireMatch="PROMOTION"
          matchLabel="mot"
          danger
          confirmLabel="Exécuter"
          saving={executing}
          savingLabel="Exécution..."
          onCancel={() => setShowConfirm(false)}
          onConfirm={handleExecute}
        />
      )}
    </div>
  )
}

// ─── Étape 5 — Historique / Rollback ──────────────────────────
function Etape5History() {
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [rollbackTarget, setRollbackTarget] = useState(null)
  const [rollingBack, setRollingBack] = useState(false)
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    api.get('/api/promotion/runs').then(res => { setRuns(res.data.runs || []); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  async function handleRollback() {
    setRollingBack(true)
    setError('')
    try {
      await api.post(`/api/promotion/rollback/${rollbackTarget}`)
      setRollbackTarget(null)
      load()
    } catch (err) {
      setError(err.response?.data?.message || err.friendlyMessage || 'Erreur')
      if (err.response?.data?.students) setError(prev => `${prev} : ${err.response.data.students.join(', ')}`)
    }
    setRollingBack(false)
  }

  const withinWindow = run => (Date.now() - new Date(run.executed_at).getTime()) < 30 * 24 * 60 * 60 * 1000

  if (loading) return <div className="bg-white rounded-xl border border-steel-200 p-6"><p className="text-sm text-steel-400">Chargement...</p></div>

  return (
    <div className="bg-white rounded-xl border border-steel-200 p-6 space-y-3">
      <p className="text-sm font-semibold text-steel-800">Historique des promotions</p>
      {runs.length === 0 && <p className="text-sm text-steel-400">Aucune promotion effectuée.</p>}
      {runs.map(run => (
        <div key={run.promotion_uid} className="flex items-center justify-between px-4 py-3 rounded-lg border border-steel-200 text-sm">
          <div>
            <p className="text-steel-700">{run.year_from_label} → {run.year_to_label}</p>
            <p className="text-xs text-steel-400">
              {run.student_count} élève(s) · {run.executed_by_name || '—'} · {new Date(run.executed_at).toLocaleDateString('fr-FR')}
              {run.is_rolled_back && <span className="text-red-500"> · Annulée</span>}
            </p>
          </div>
          {!run.is_rolled_back && withinWindow(run) && (
            <button onClick={() => setRollbackTarget(run.promotion_uid)} className="text-xs text-red-500 hover:underline">Annuler</button>
          )}
        </div>
      ))}

      {error && <p className="text-sm text-red-500">{error}</p>}

      {rollbackTarget && (
        <ConfirmModal
          title="Annuler cette promotion ?"
          message="Les inscriptions créées par cette promotion seront supprimées. L'année académique précédente redevient active."
          danger
          confirmLabel="Annuler la promotion"
          saving={rollingBack}
          savingLabel="Annulation..."
          onCancel={() => setRollbackTarget(null)}
          onConfirm={handleRollback}
        />
      )}
    </div>
  )
}
