import { useState } from 'react'
import api from '../../utils/api'

// Shown when the school is configured but has zero users — the state a
// cloud restore leaves behind (users are never synced). Reuses the same
// first-admin endpoint as onboarding Step 2 (POST /api/auth/setup, which
// refuses to run if any user already exists).
export default function CreateAdminPage({ onDone }) {
  const [form, setForm] = useState({ fullName: '', username: '', password: '', confirm: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (form.password.length < 6) { setError('Mot de passe minimum 6 caractères'); return }
    if (form.password !== form.confirm) { setError('Les mots de passe ne correspondent pas'); return }
    setSaving(true)
    try {
      await api.post('/api/auth/setup', {
        fullName: form.fullName.trim(),
        username: form.username.trim(),
        password: form.password,
      })
      onDone()
    } catch (err) {
      setError(err.friendlyMessage || 'Erreur lors de la création du compte')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-steel-900 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
        <div className="w-14 h-14 bg-brand/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-steel-900 text-center mb-2">Créer le compte administrateur</h1>
        <p className="text-sm text-steel-500 text-center mb-6">
          Les données ont été restaurées, mais les comptes utilisateurs ne sont jamais
          sauvegardés en ligne. Créez un nouveau compte administrateur pour continuer.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-steel-500 mb-1">Nom complet <span className="text-red-500">*</span></label>
            <input type="text" required value={form.fullName}
              onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))}
              className="w-full px-3 py-2.5 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
          </div>
          <div>
            <label className="block text-xs text-steel-500 mb-1">Nom d'utilisateur <span className="text-red-500">*</span></label>
            <input type="text" required value={form.username}
              onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
              className="w-full px-3 py-2.5 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
          </div>
          <div>
            <label className="block text-xs text-steel-500 mb-1">Mot de passe <span className="text-red-500">*</span></label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} required value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                className="w-full px-3 py-2.5 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand pr-10" />
              <button type="button" onClick={() => setShowPassword(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-steel-400 hover:text-steel-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {showPassword
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    : <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></>}
                </svg>
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-steel-500 mb-1">Confirmer le mot de passe <span className="text-red-500">*</span></label>
            <input type={showPassword ? 'text' : 'password'} required value={form.confirm}
              onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))}
              className="w-full px-3 py-2.5 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
          </div>

          {error && <p className="text-red-500 text-xs">{error}</p>}

          <button type="submit" disabled={saving}
            className="w-full py-3 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
            {saving ? 'Création…' : 'Créer le compte'}
          </button>
        </form>
      </div>
    </div>
  )
}
