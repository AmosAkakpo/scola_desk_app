import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import api from '../../utils/api'

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [schoolName, setSchoolName] = useState('')
  const [showReset, setShowReset] = useState(false)
  const { login } = useAuth()

  useEffect(() => {
    api.get('/api/activation/status').then(res => {
      if (res.data.school_name) setSchoolName(res.data.school_name)
    }).catch(() => {})
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username.trim().toLowerCase(), password)
      onLogin()
    } catch (err) {
      setError(err.response?.data?.message || err.friendlyMessage || 'Identifiants incorrects')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-steel-900">
      <div className="w-full max-w-sm p-8">
        <div className="flex flex-col items-center mb-8">
          <img src="/android-chrome-192x192.png" alt="ScolaDesk" className="w-16 h-16 rounded-2xl mb-4" />
          <h1 className="text-xl font-medium text-steel-200">{schoolName || 'ScolaDesk'}</h1>
          <p className="text-steel-400 text-sm mt-1">Connexion</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-steel-400 mb-1.5">Nom d'utilisateur</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} required autoFocus
              className="w-full px-3 py-2.5 bg-steel-800 border border-steel-700 rounded-lg text-steel-200 placeholder-steel-500 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand text-sm"
              placeholder="Nom d'utilisateur" />
          </div>
          <div>
            <label className="block text-sm text-steel-400 mb-1.5">Mot de passe</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full px-3 py-2.5 bg-steel-800 border border-steel-700 rounded-lg text-steel-200 placeholder-steel-500 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand text-sm"
              placeholder="••••••••" />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button type="submit" disabled={loading || !username || !password}
            className="w-full py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition-colors">
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        <button onClick={() => setShowReset(true)}
          className="w-full mt-4 text-xs text-steel-500 hover:text-steel-300 transition-colors">
          Mot de passe administrateur oublié ?
        </button>
      </div>

      {showReset && <ResetAdminModal onClose={() => setShowReset(false)} />}
    </div>
  )
}

// Admin password reset via a day-code obtained from ScolaDesk by phone —
// verified offline by the server (HMAC over school_code + date).
function ResetAdminModal({ onClose }) {
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (newPassword.length < 6) { setError('Mot de passe minimum 6 caractères'); return }
    if (newPassword !== confirm) { setError('Les mots de passe ne correspondent pas'); return }
    setSaving(true)
    try {
      await api.post('/api/auth/reset-admin', { code: code.trim(), new_password: newPassword })
      setDone(true)
    } catch (err) {
      setError(err.response?.data?.message || err.friendlyMessage || 'Erreur')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        {done ? (
          <>
            <h2 className="text-base font-medium text-steel-900 mb-2">Mot de passe réinitialisé</h2>
            <p className="text-sm text-steel-500 mb-5">Connectez-vous avec le nouveau mot de passe administrateur.</p>
            <button onClick={onClose}
              className="w-full py-2.5 bg-brand hover:bg-brand-600 text-white rounded-lg text-sm font-medium">
              Fermer
            </button>
          </>
        ) : (
          <>
            <h2 className="text-base font-medium text-steel-900 mb-1">Réinitialiser le mot de passe administrateur</h2>
            <p className="text-sm text-steel-500 mb-4">
              Réinitialise uniquement le compte <strong>administrateur</strong> — pas secrétaire ni comptable.
              Contactez ScolaDesk pour obtenir un code, valable uniquement le jour de son émission et à usage unique.
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-steel-500 mb-1">Code de réinitialisation <span className="text-red-500">*</span></label>
                <input type="text" required value={code} onChange={e => setCode(e.target.value)} autoFocus
                  placeholder="XXXX-XXXX"
                  className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm font-mono uppercase focus:outline-none focus:border-brand" />
              </div>
              <div>
                <label className="block text-xs text-steel-500 mb-1">Nouveau mot de passe <span className="text-red-500">*</span></label>
                <input type="password" required value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
              </div>
              <div>
                <label className="block text-xs text-steel-500 mb-1">Confirmer le mot de passe <span className="text-red-500">*</span></label>
                <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)}
                  className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
              </div>
              {error && <p className="text-red-500 text-xs">{error}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={onClose}
                  className="flex-1 py-2.5 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50">
                  Annuler
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
                  {saving ? 'Réinitialisation...' : 'Réinitialiser'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
