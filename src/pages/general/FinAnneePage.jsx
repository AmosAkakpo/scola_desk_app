import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import api from '../../utils/api'
import ConfirmModal from '../../components/ConfirmModal'
import Pagination from '../../components/Pagination'

// Fin d'année wizard: Étape 1 (checklist) -> Étape 2 (aperçu) -> Étape 3
// (exécution) -> Étape 4 (historique/rollback).
//
// National-exam-cohort step (résultats examens) is hidden for now (owner
// request 2026-07-12) -- not deleted, just not wired into the step flow.
// Etape2ExamResults below still exists, unused, ready to be re-enabled once
// the exam-cohort feature is built out fully (manual classroom assignment
// per exam, multi-exam support). Keep EXAM_COHORT_ENABLED here in sync with
// the same flag in server/utils/promotionVerdicts.js and promotionChecklist.js.
const EXAM_COHORT_ENABLED = false

// Best-effort guess for the new year's label -- always shown as an editable,
// pre-filled field the admin confirms or changes, never applied silently.
function suggestNextLabel(label) {
  const m = /^(\d{4})-(\d{4})$/.exec(label || '')
  if (!m) return ''
  return `${parseInt(m[1]) + 1}-${parseInt(m[2]) + 1}`
}
// Persisted so leaving the page (settings, another module) and coming back
// doesn't reset progress -- but still enforces "no skipping ahead" (owner
// request 2026-07-12: strict step order, since free navigation was only
// ever needed to reach exam entry, which is now hidden).
const MAX_STEP_STORAGE_KEY = 'scola_fin_annee_max_step'

export default function FinAnneePage() {
  const [step, setStep] = useState(1)
  const [maxStepReached, setMaxStepReached] = useState(() => {
    const stored = parseInt(sessionStorage.getItem(MAX_STEP_STORAGE_KEY))
    return stored >= 1 ? stored : 1
  })
  const [yearId, setYearId] = useState(null)
  const [yearLabel, setYearLabel] = useState('')
  const [loading, setLoading] = useState(true)
  const [previewSummary, setPreviewSummary] = useState(null)
  const [overrides, setOverrides] = useState([])

  function advanceTo(n) {
    setStep(n)
    setMaxStepReached(prev => {
      const next = Math.max(prev, n)
      sessionStorage.setItem(MAX_STEP_STORAGE_KEY, String(next))
      return next
    })
  }

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
        <p className="text-sm text-steel-500 mt-1">Vérifications, promotion des élèves.</p>
      </div>

      {/* Strict order: a step is only clickable once actually reached via
          its "Continuer"/"Commencer" action, never skipped ahead to. */}
      <div className="flex items-center gap-2 text-xs text-steel-500">
        {(EXAM_COHORT_ENABLED
          ? ['Vérifications', 'Résultats examens', 'Aperçu', 'Exécution', 'Historique']
          : ['Vérifications', 'Aperçu', 'Exécution', 'Historique']
        ).map((label, i) => {
          const n = i + 1
          const reachable = n <= maxStepReached
          return (
            <button key={label} onClick={() => reachable && setStep(n)} disabled={!reachable}
              className={`px-3 py-1.5 rounded-full transition-colors ${
                step === n ? 'bg-brand text-white font-medium'
                  : reachable ? 'bg-steel-100 hover:bg-steel-200 text-steel-600'
                    : 'bg-steel-50 text-steel-300 cursor-not-allowed'
              }`}>
              {n}. {label}
            </button>
          )
        })}
      </div>

      {EXAM_COHORT_ENABLED ? (
        <>
          {step === 1 && <Etape1Checklist onNext={() => advanceTo(2)} />}
          {step === 2 && <Etape2ExamResults yearId={yearId} onBack={() => setStep(1)} onNext={() => advanceTo(3)} />}
          {step === 3 && (
            <Etape3Preview yearId={yearId}
              onBack={() => setStep(2)}
              onNext={(summary, overrides) => { setPreviewSummary(summary); setOverrides(overrides); advanceTo(4) }}
            />
          )}
          {step === 4 && (
            <Etape4Execute yearId={yearId} yearLabel={yearLabel} overrides={overrides} previewSummary={previewSummary}
              onBack={() => setStep(3)}
              onDone={() => advanceTo(5)}
            />
          )}
          {step === 5 && <Etape5History />}
        </>
      ) : (
        <>
          {step === 1 && <Etape1Checklist onNext={() => advanceTo(2)} />}
          {step === 2 && (
            <Etape3Preview yearId={yearId}
              onBack={() => setStep(1)}
              onNext={(summary, overrides) => { setPreviewSummary(summary); setOverrides(overrides); advanceTo(3) }}
            />
          )}
          {step === 3 && (
            <Etape4Execute yearId={yearId} yearLabel={yearLabel} overrides={overrides} previewSummary={previewSummary}
              onBack={() => setStep(2)}
              onDone={() => advanceTo(4)}
            />
          )}
          {step === 4 && <Etape5History />}
        </>
      )}
    </div>
  )
}

// ─── Étape 1 — Checklist (fully manual — nothing here is computed from the
// database; the admin personally checks each item, every time, no
// auto-detection or auto-blocking).
const CHECKLIST_ITEMS = [
  { key: 'grades', label: 'Les notes de la période finale sont saisies pour toutes les classes' },
  { key: 'bulletins', label: 'Les bulletins ont été générés' },
  ...(EXAM_COHORT_ENABLED ? [{ key: 'exams', label: "Les résultats des examens nationaux ont été saisis (s'il y en a)" }] : []),
  { key: 'effectifs', label: "Le résumé des effectifs a été téléchargé et envoyé à ScolaDesk" },
  { key: 'notes_verified', label: 'Les notes ont été vérifiées par les élèves/parents' },
  { key: 'bulletins_remis', label: 'Les bulletins ont été remis' },
  { key: 'salaires', label: 'Tous les salaires du personnel ont été payés' },
]

// Sync is the one automatic, hard-blocking check (owner request 2026-07-12)
// — everything else on this page is self-declared. Must have a successful
// full sync within the last 24h; reuses /api/sync/status (Phase 7) rather
// than a new endpoint.
const SYNC_FRESHNESS_MS = 24 * 60 * 60 * 1000

// Kept in sessionStorage, not component state -- the admin navigates to
// other pages (settings, exam grid, etc.) mid-checklist and comes back, so
// this must survive unmount/remount. It clears on its own once a promotion
// actually executes (see Etape4Execute) and the admin can also wipe it by
// hand with "Réinitialiser" -- it's never silently reset just from
// navigating around.
const CHECKLIST_STORAGE_KEY = 'scola_fin_annee_checklist'

function Etape1Checklist({ onNext }) {
  const [toggles, setToggles] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(CHECKLIST_STORAGE_KEY)) || {} }
    catch { return {} }
  })
  const [showConfirm, setShowConfirm] = useState(false)
  const [syncStatus, setSyncStatus] = useState(null) // { last_success_at } | null while loading
  const [checkingSync, setCheckingSync] = useState(true)

  useEffect(() => {
    sessionStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(toggles))
  }, [toggles])

  const checkSync = useCallback(() => {
    setCheckingSync(true)
    api.get('/api/sync/status').then(res => {
      setSyncStatus(res.data)
      setCheckingSync(false)
    }).catch(() => setCheckingSync(false))
  }, [])

  useEffect(() => { checkSync() }, [checkSync])

  const syncOk = !!syncStatus?.last_success_at &&
    (Date.now() - new Date(syncStatus.last_success_at).getTime()) < SYNC_FRESHNESS_MS

  const allChecked = CHECKLIST_ITEMS.every(item => toggles[item.key])
  const ready = allChecked && syncOk

  return (
    <div className="bg-white rounded-xl border border-steel-200 p-6 space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-steel-800 mb-1">Synchronisation</h2>
        <p className="text-xs text-steel-500 mb-3">Vérifié automatiquement — une synchronisation réussie de moins de 24h est obligatoire.</p>
        <div className={`flex items-center justify-between px-4 py-2.5 rounded-lg border text-sm ${
          checkingSync ? 'border-steel-200 bg-steel-50 text-steel-500'
            : syncOk ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          <span className="flex items-center gap-2">
            <span className="font-bold">{checkingSync ? '…' : syncOk ? '✓' : '✕'}</span>
            {checkingSync ? 'Vérification...' : syncOk
              ? `Synchronisé le ${new Date(syncStatus.last_success_at).toLocaleString('fr-FR')}`
              : syncStatus?.last_success_at
                ? `Dernière synchronisation trop ancienne (${new Date(syncStatus.last_success_at).toLocaleString('fr-FR')})`
                : 'Aucune synchronisation réussie'}
          </span>
          <span className="flex items-center gap-3 text-xs shrink-0">
            <button onClick={checkSync} className="text-brand hover:underline">Réessayer</button>
            <Link to="/sync" className="text-brand hover:underline">Aller à Synchronisation →</Link>
          </span>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-steel-800">Vérifications</h2>
          <button onClick={() => setToggles({})} className="text-xs text-steel-400 hover:text-steel-600">Réinitialiser</button>
        </div>
        <p className="text-xs text-steel-500 mb-3">Cochez vous-même chaque point après vérification — rien d'autre n'est vérifié automatiquement. Vos coches restent enregistrées même si vous quittez cette page.</p>
        <div className="space-y-2">
          {CHECKLIST_ITEMS.map(item => (
            <label key={item.key} className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-steel-200 text-sm text-steel-700 cursor-pointer hover:bg-steel-50">
              <input type="checkbox" checked={!!toggles[item.key]}
                onChange={e => setToggles(prev => ({ ...prev, [item.key]: e.target.checked }))}
                className="w-4 h-4 accent-brand" />
              {item.label}
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
      // toward the verdict, never whether it needs to be recorded. A level
      // configured as a cohort but with zero students enrolled this year
      // (e.g. CEP at a school with no primaire section) is left out — there
      // is nothing to grade.
      const unique = [...new Set(
        (res.data.levels || [])
          .filter(l => l.is_exam_cohort && l.cohort_student_count > 0)
          .map(l => l.exam_name)
      )]
      setExamTypes(unique)
      setActiveExam(unique[0] || '')
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="bg-white rounded-xl border border-steel-200 p-6"><p className="text-sm text-steel-400">Chargement...</p></div>

  if (examTypes.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-steel-200 p-6 space-y-4">
        <p className="text-sm text-steel-500">Aucun examen national à saisir cette année (aucun élève dans un niveau configuré comme examen national, ou aucun niveau configuré — Paramètres → Structure académique → Examens nationaux).</p>
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
const PREVIEW_PAGE_SIZE = 50

// Confirmed overrides (persisted -- survives navigating away and back).
// The in-progress edit inside the modal (draftVerdict/draftReason below)
// is deliberately NOT persisted here and NOT part of load()'s dependencies
// -- otherwise every keystroke in the reason textarea would refire the
// preview request.
const OVERRIDES_STORAGE_KEY = 'scola_fin_annee_overrides'

function Etape3Preview({ yearId, onBack, onNext }) {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [overrides, setOverrides] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(OVERRIDES_STORAGE_KEY)) || [] }
    catch { return [] }
  })
  const [editingId, setEditingId] = useState(null)
  const [draftVerdict, setDraftVerdict] = useState('')
  const [draftReason, setDraftReason] = useState('')
  const [verdictFilter, setVerdictFilter] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    sessionStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(overrides))
  }, [overrides])

  // 300ms debounce on the search box, same convention as other heavy list
  // pages (Élèves, Paiements) -- avoids firing a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const load = useCallback(() => {
    setLoading(true)
    api.post(`/api/promotion/preview/${yearId}`, {
      overrides,
      verdict_filter: verdictFilter || undefined,
      search: search || undefined,
      page,
      page_size: PREVIEW_PAGE_SIZE,
    }).then(res => {
      setRows(res.data.rows || [])
      setTotal(res.data.total || 0)
      setSummary(res.data.summary)
      setLoading(false)
    })
  }, [yearId, verdictFilter, search, page, overrides])

  useEffect(() => { load() }, [load])

  function openEdit(row) {
    setEditingId(row.student_id)
    setDraftVerdict(row.verdict)
    setDraftReason('')
  }

  function applyOverride() {
    if (!draftVerdict || !draftReason.trim()) return
    setOverrides(prev => [
      ...prev.filter(o => o.student_id !== editingId),
      { student_id: editingId, verdict: draftVerdict, reason: draftReason.trim() },
    ])
    setEditingId(null)
  }

  const totalPages = Math.ceil(total / PREVIEW_PAGE_SIZE)

  if (loading && rows.length === 0) return <div className="bg-white rounded-xl border border-steel-200 p-6"><p className="text-sm text-steel-400">Calcul en cours...</p></div>

  return (
    <div className="bg-white rounded-xl border border-steel-200 p-6 space-y-4">
      {summary && (
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="text-green-600 font-medium">{summary.admis} admis</span>
          <span className="text-amber-600 font-medium">{summary.doublant} doublant(s)</span>
          <span className="text-steel-600 font-medium">{summary.graduated} diplômé(s)</span>
          {summary.exclu > 0 && <span className="text-red-600 font-medium">{summary.exclu} exclu(s) (override)</span>}
          {summary.excluded_from_calc > 0 && (
            <span className="text-steel-400">{summary.excluded_from_calc} élève(s) exclu(s) du calcul (renvoyés/transférés)</span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input type="text" value={searchInput} onChange={e => setSearchInput(e.target.value)}
          placeholder="Rechercher un élève (nom ou matricule)"
          className="flex-1 min-w-[200px] px-3 py-1.5 border border-steel-200 rounded-lg text-xs focus:outline-none focus:border-brand" />
        <select value={verdictFilter} onChange={e => { setVerdictFilter(e.target.value); setPage(1) }}
          className="px-3 py-1.5 border border-steel-200 rounded-lg text-xs bg-white focus:outline-none focus:border-brand">
          <option value="">Tous les verdicts</option>
          <option value="admis">Admis</option>
          <option value="doublant">Doublant</option>
          <option value="exclu">Exclu</option>
        </select>
        {loading && <span className="text-xs text-steel-400">Chargement...</span>}
      </div>

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
                  <button onClick={() => openEdit(r)}
                    className="text-xs text-brand hover:underline">Modifier</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && !loading && <p className="text-sm text-steel-400 text-center py-6">Aucun élève trouvé.</p>}
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      {editingId !== null && (() => {
        const row = rows.find(r => r.student_id === editingId)
        return (
          <ConfirmModal
            title={`Modifier le verdict — ${row?.full_name || ''}`}
            message="La modification manuelle nécessite un motif."
            confirmLabel="Appliquer"
            onCancel={() => setEditingId(null)}
            onConfirm={applyOverride}
          >
            <div className="space-y-2">
              <select value={draftVerdict} onChange={e => setDraftVerdict(e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
                <option value="">— Choisir un verdict —</option>
                <option value="admis">Admis</option>
                <option value="doublant">Doublant</option>
                <option value="exclu">Exclu</option>
              </select>
              <textarea value={draftReason} onChange={e => setDraftReason(e.target.value)}
                placeholder="Motif (obligatoire)" rows={2}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
            </div>
          </ConfirmModal>
        )
      })()}

      <div className="flex gap-3">
        <button onClick={onBack} className="px-4 py-2 border border-steel-200 rounded-lg text-sm text-steel-600 hover:bg-steel-50">Retour</button>
        <button onClick={() => onNext(summary, overrides)}
          className="px-4 py-2 bg-brand hover:bg-brand-600 text-white rounded-lg text-sm font-medium">
          Continuer vers l'exécution
        </button>
      </div>
    </div>
  )
}

// ─── Étape 4 — Exécution ──────────────────────────────────────
function Etape4Execute({ yearId, yearLabel, overrides, previewSummary, onDone, onBack }) {
  const [newLabel, setNewLabel] = useState(suggestNextLabel(yearLabel))
  const [carryForward, setCarryForward] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState('')

  const summary = previewSummary || {}

  // Landing here without having gone through Étape 3 first (shouldn't
  // normally happen now that steps are strictly sequential, but guard
  // anyway) would otherwise show a misleading "0 students" summary right
  // before a real, transactional execute.
  if (!previewSummary) {
    return (
      <div className="bg-white rounded-xl border border-steel-200 p-6 space-y-4">
        <p className="text-sm text-steel-500">Aucun aperçu généré. Passez d'abord par l'étape « Aperçu » pour calculer les verdicts.</p>
        <button onClick={onBack} className="px-4 py-2 border border-steel-200 rounded-lg text-sm text-steel-600 hover:bg-steel-50">Retour à l'aperçu</button>
      </div>
    )
  }

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
      sessionStorage.removeItem(CHECKLIST_STORAGE_KEY)
      sessionStorage.removeItem(OVERRIDES_STORAGE_KEY)
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
