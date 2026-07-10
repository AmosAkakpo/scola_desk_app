import { useState, useEffect, useRef } from 'react'
import api from '../../utils/api'

function formatDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Shown after activation when the local DB is empty but CAP holds a cloud
// backup for this school (new/wiped PC). Offers restore-or-start-fresh.
export default function RestorePage({ info, onDone, onSkip }) {
  const [phase, setPhase] = useState('offer') // offer | running | failed
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const pollRef = useRef(null)

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  async function startRestore() {
    setError('')
    try {
      await api.post('/api/restore/start', { sync_uid: info.sync_uid, chunk_count: info.chunk_count, synced_at: info.synced_at })
      setPhase('running')
      pollRef.current = setInterval(async () => {
        try {
          const res = await api.get('/api/restore/progress')
          if (res.data.running) { setProgress(res.data); return }
          clearInterval(pollRef.current)
          pollRef.current = null
          if (res.data.last_result?.status === 'success') {
            onDone()
          } else {
            setError(res.data.last_result?.error || 'La restauration a échoué')
            setPhase('failed')
          }
        } catch { /* keep polling */ }
      }, 1000)
    } catch (err) {
      setError(err.friendlyMessage || 'Impossible de démarrer la restauration')
      setPhase('failed')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-steel-900 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
        <div className="w-14 h-14 bg-brand/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V7M3 7l9 6 9-6M3 7l9-4 9 4" />
          </svg>
        </div>

        {phase === 'offer' && (
          <>
            <h1 className="text-lg font-semibold text-steel-900 text-center mb-2">Sauvegarde trouvée</h1>
            <p className="text-sm text-steel-500 text-center mb-5">
              Une sauvegarde de cet établissement existe sur ScolaDesk Central.
              Vous pouvez restaurer vos données ou recommencer à zéro.
            </p>
            <div className="bg-steel-50 rounded-lg px-4 py-3 mb-6 text-sm space-y-1">
              <p className="text-steel-700">Dernière sauvegarde : <strong>{formatDateTime(info.synced_at)}</strong></p>
              <p className="text-steel-500 text-xs">{info.records_sent ? `${info.records_sent} enregistrements` : ''}</p>
            </div>
            <button onClick={startRestore}
              className="w-full py-3 bg-brand hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors mb-3">
              Restaurer les données
            </button>
            <button onClick={onSkip}
              className="w-full py-3 border border-steel-200 text-steel-600 hover:bg-steel-50 rounded-lg text-sm font-medium transition-colors">
              Recommencer à zéro
            </button>
          </>
        )}

        {phase === 'running' && (
          <>
            <h1 className="text-lg font-semibold text-steel-900 text-center mb-2">Restauration en cours…</h1>
            <p className="text-sm text-steel-500 text-center mb-6">Ne fermez pas l'application.</p>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-steel-500">{progress?.label || 'Téléchargement…'}</span>
              <span className="text-xs text-steel-500">{progress ? `${progress.current}/${progress.total}` : ''}</span>
            </div>
            <div className="w-full h-2 bg-steel-100 rounded-full overflow-hidden">
              <div className="h-full bg-brand transition-all duration-300"
                style={{ width: `${progress?.total ? Math.min(100, (progress.current / progress.total) * 100) : 5}%` }} />
            </div>
          </>
        )}

        {phase === 'failed' && (
          <>
            <h1 className="text-lg font-semibold text-steel-900 text-center mb-2">Échec de la restauration</h1>
            <p className="text-sm text-red-600 text-center mb-6">{error}</p>
            <button onClick={startRestore}
              className="w-full py-3 bg-brand hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors mb-3">
              Réessayer
            </button>
            <button onClick={onSkip}
              className="w-full py-3 border border-steel-200 text-steel-600 hover:bg-steel-50 rounded-lg text-sm font-medium transition-colors">
              Recommencer à zéro
            </button>
          </>
        )}
      </div>
    </div>
  )
}
