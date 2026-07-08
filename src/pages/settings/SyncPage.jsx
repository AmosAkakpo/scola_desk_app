import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../../utils/api'

function formatDateTime(d) {
  if (!d) return 'Jamais'
  return new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function SyncPage() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(null)
  const [starting, setStarting] = useState(false)
  const [banner, setBanner] = useState(null)
  const pollRef = useRef(null)
  const wasRunningRef = useRef(false)

  const fetchStatus = useCallback(() => {
    return api.get('/api/sync/status').then(res => {
      setStatus(res.data)
      return res.data
    })
  }, [])

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const pollProgress = useCallback(() => {
    api.get('/api/sync/progress').then(res => {
      const data = res.data
      setProgress(data)

      if (data.running) {
        wasRunningRef.current = true
        return
      }

      if (wasRunningRef.current) {
        wasRunningRef.current = false
        stopPolling()
        fetchStatus().then(fresh => {
          const last = fresh.recent?.[0]
          if (last?.status === 'success') {
            setBanner({ type: 'success', message: `Synchronisation terminée — ${last.records_sent} enregistrements envoyés` })
          } else if (last?.status === 'partial') {
            setBanner({ type: 'error', message: last.error_message || 'Synchronisation interrompue' })
          }
        })
      }
    }).catch(() => {})
  }, [fetchStatus, stopPolling])

  const startPolling = useCallback(() => {
    stopPolling()
    pollRef.current = setInterval(pollProgress, 1000)
    pollProgress()
  }, [pollProgress, stopPolling])

  useEffect(() => {
    fetchStatus().then(data => {
      setLoading(false)
      if (data.running) {
        wasRunningRef.current = true
        startPolling()
      }
    })
    return () => stopPolling()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleStart(resume) {
    setBanner(null)
    setStarting(true)
    try {
      await api.post('/api/sync/start', { resume })
      startPolling()
    } catch (err) {
      setBanner({ type: 'error', message: err.friendlyMessage || 'Impossible de démarrer la synchronisation' })
    } finally {
      setStarting(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
  }

  const isRunning = !!progress?.running
  const latest = status?.recent?.[0]
  const isResumable = !isRunning && status?.resumable

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-steel-900">Synchronisation</h1>
          <p className="text-sm text-steel-500 mt-0.5">Sauvegarde et envoi des données vers ScolaDesk Central</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-steel-200 p-5 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-[10px] text-steel-400 uppercase tracking-wide">Dernière synchronisation réussie</p>
            <p className="text-sm font-semibold text-steel-800 mt-1">{formatDateTime(status?.last_success_at)}</p>
          </div>
          <button
            onClick={() => handleStart(false)}
            disabled={isRunning || starting}
            className="px-4 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
          >
            {isRunning ? 'Synchronisation en cours…' : 'Synchroniser maintenant'}
          </button>
        </div>

        {isResumable && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm text-amber-800">
              Synchronisation interrompue à l'étape {latest?.checkpoint ?? 0}/{latest?.total_chunks || '?'}.
            </p>
            <button
              onClick={() => handleStart(true)}
              disabled={starting}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
            >
              Reprendre
            </button>
          </div>
        )}

        {isRunning && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-steel-500">Envoi : {progress.label || '…'}</span>
              <span className="text-xs text-steel-500">{progress.current}/{progress.total}</span>
            </div>
            <div className="w-full h-2 bg-steel-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand transition-all duration-300"
                style={{ width: `${progress.total ? Math.min(100, (progress.current / progress.total) * 100) : 0}%` }}
              />
            </div>
          </div>
        )}

        {!isRunning && banner && (
          <div className={`mt-4 rounded-lg p-4 text-sm ${
            banner.type === 'success' ? 'bg-brand/10 text-brand-600' : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {banner.message}
          </div>
        )}
      </div>

      <div className="bg-steel-50 rounded-xl border border-steel-200 p-4">
        <p className="text-xs text-steel-500">
          Nécessite une connexion internet. Recommandé chaque samedi. Obligatoire avant la promotion de fin d'année.
        </p>
      </div>
    </div>
  )
}
