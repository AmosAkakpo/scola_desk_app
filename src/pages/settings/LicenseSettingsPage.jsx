import { useState, useEffect } from 'react'
import api from '../../utils/api'

// Reactivation just re-hits POST /api/activation/activate — the same
// endpoint used for first-time activation. CAP already treats a
// same-school/same-fingerprint call as a valid re-activation (refreshed
// expiry/tier), no separate "renew" endpoint needed.
export default function LicenseSettingsPage() {
  const [status, setStatus] = useState(null)
  const [schoolCode, setSchoolCode] = useState('')
  const [licenseKey, setLicenseKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    api.get('/api/activation/status').then(res => setStatus(res.data)).catch(() => {})
  }, [])

  function formatKey(value) {
    const clean = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 20)
    const parts = []
    if (clean.length > 0) parts.push(clean.slice(0, 4))
    if (clean.length > 4) parts.push(clean.slice(4, 8))
    if (clean.length > 8) parts.push(clean.slice(8, 12))
    if (clean.length > 12) parts.push(clean.slice(12, 16))
    if (clean.length > 16) parts.push(clean.slice(16, 20))
    return parts.join('-')
  }

  async function handleActivate(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      let fingerprint
      if (window.scola) {
        const hwResult = await window.scola.invoke('get-hardware-fingerprint')
        if (!hwResult.success) {
          setError('Impossible de capturer l\'empreinte matérielle: ' + (hwResult.error || ''))
          setLoading(false)
          return
        }
        fingerprint = hwResult.fingerprint
      } else {
        fingerprint = 'dev-local-static-fingerprint'
      }

      const res = await api.post('/api/activation/activate', {
        school_code: schoolCode.trim().toUpperCase(),
        license_key: licenseKey.trim().toUpperCase(),
        fingerprint,
      })

      if (res.data.success) {
        setDone(true)
        // Full reload so App.jsx's checkStatus() re-runs from scratch and
        // exits read-only mode everywhere, not just on this page.
        setTimeout(() => window.location.reload(), 1500)
      } else {
        setError(res.data.message || "Erreur d'activation")
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Impossible de contacter le serveur central')
    }
    setLoading(false)
  }

  const expired = status?.license_status === 'expired'
  // Reactivation is also needed when CAP no longer recognizes this
  // device's license at all (renewal/reissue issued a new key) even
  // though the stale local copy hasn't hit its own expiry yet -- the
  // banner that links here covers exactly this case, so the form must
  // actually appear for it (owner report 2026-07-18: banner linked here
  // but the form only showed for local 'expired', leaving nowhere to
  // type the new key).
  const needsKeyEntry = expired || status?.reactivation_needed

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-steel-200 p-6">
        <h2 className="text-sm font-semibold text-steel-800 mb-3">Statut de la licence</h2>
        {status ? (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-steel-500 text-xs">Niveau</p>
              <p className="text-steel-800 font-medium">{status.tier || '—'}</p>
            </div>
            <div>
              <p className="text-steel-500 text-xs">Expiration</p>
              <p className={`font-medium ${expired ? 'text-red-600' : 'text-steel-800'}`}>
                {status.expiry ? new Date(status.expiry).toLocaleDateString('fr-FR') : '—'}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-steel-500 text-xs">Statut</p>
              <p className={`font-medium ${needsKeyEntry ? 'text-red-600' : 'text-brand'}`}>
                {expired ? 'Expirée — mode lecture seule'
                  : status?.reactivation_needed ? 'Nouvelle clé requise — mode lecture seule'
                  : 'Active'}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-steel-400">Chargement...</p>
        )}
      </div>

      {needsKeyEntry && (
        <div className="bg-white rounded-xl border border-steel-200 p-6">
          <h2 className="text-sm font-semibold text-steel-800 mb-1">
            {status?.reactivation_needed && !expired ? 'Entrer la nouvelle clé' : 'Renouveler la licence'}
          </h2>
          <p className="text-xs text-steel-500 mb-4">
            Entrez le code école et la nouvelle clé de licence fournis par l'équipe ScolaDesk. Une connexion internet est requise.
          </p>

          {done ? (
            <p className="text-sm text-brand font-medium">Licence réactivée — rechargement...</p>
          ) : (
            <form onSubmit={handleActivate} className="space-y-3 max-w-sm">
              <div>
                <label className="block text-xs text-steel-500 mb-1">Code école</label>
                <input type="text" required value={schoolCode} onChange={e => setSchoolCode(e.target.value.toUpperCase())}
                  placeholder="CC-YYYY-XXXX"
                  className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm font-mono text-center focus:outline-none focus:border-brand" />
              </div>
              <div>
                <label className="block text-xs text-steel-500 mb-1">Clé de licence</label>
                <input type="text" required value={licenseKey} onChange={e => setLicenseKey(formatKey(e.target.value))}
                  placeholder="SDLK-YYYY-XXXX-XXXX-XXXX"
                  className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm font-mono text-center focus:outline-none focus:border-brand" />
              </div>
              {error && <p className="text-red-500 text-xs">{error}</p>}
              <button type="submit" disabled={loading || !schoolCode.trim() || licenseKey.replace(/-/g, '').length < 20}
                className="w-full py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                {loading ? 'Activation...' : 'Activer'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
