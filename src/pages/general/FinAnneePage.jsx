import { useState, useEffect, useCallback } from 'react'
import api from '../../utils/api'
import ConfirmModal from '../../components/ConfirmModal'

// Fin d'année wizard: Étape 1 (checklist) -> Étape 2 (résultats examens) ->
// Étape 3 (aperçu) -> Étape 4 (exécution) -> Étape 5 (historique/rollback).
// Steps 3-5 are built in the next pass (Step 7 of promotion_build_steps.md);
// this file currently implements Étape 1 + Étape 2.
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
      {step >= 3 && (
        <div className="bg-white rounded-xl border border-steel-200 p-6 text-sm text-steel-500">
          Aperçu / Exécution / Historique — à venir.
          <button onClick={() => setStep(1)} className="ml-3 text-brand hover:underline">Retour à l'étape 1</button>
        </div>
      )}
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
                Configurez les critères de passage dans Paramètres → Structure académique → Examens nationaux.
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
    Promise.all([
      api.get('/api/promotion/exam-cohort-levels'),
      api.get('/api/promotion/exam-rules'),
    ]).then(([lvl, r]) => {
      const rulesByType = {}
      for (const rule of r.data.rules || []) rulesByType[rule.exam_type] = rule
      const needed = (lvl.data.levels || [])
        .filter(l => l.is_exam_cohort && rulesByType[l.exam_name]?.mode !== 'moyenne_only')
        .map(l => l.exam_name)
      const unique = [...new Set(needed)]
      setExamTypes(unique)
      setActiveExam(unique[0] || '')
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="bg-white rounded-xl border border-steel-200 p-6"><p className="text-sm text-steel-400">Chargement...</p></div>

  if (examTypes.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-steel-200 p-6 space-y-4">
        <p className="text-sm text-steel-500">Aucun examen national ne nécessite de saisie (tous configurés en « moyenne de l'année seulement »).</p>
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
