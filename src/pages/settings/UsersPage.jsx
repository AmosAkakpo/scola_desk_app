import { useState, useEffect } from 'react'
import api from '../../utils/api'
import ConfirmModal from '../../components/ConfirmModal'

const ROLE_COLORS = { admin: 'bg-steel-100 text-steel-600', secretary: 'bg-blue-50 text-blue-600', accountant: 'bg-brand-50 text-brand-600' }

export default function UsersPage() {
  const [users, setUsers] = useState([])
  const [tier, setTier] = useState('STANDARD')
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [toggleTarget, setToggleTarget] = useState(null)
  const [toggling, setToggling] = useState(false)
  const [resetTarget, setResetTarget] = useState(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState('')

  function load() {
    setLoading(true)
    api.get('/api/users').then(res => {
      setUsers(res.data.users || [])
      setTier(res.data.tier || 'STANDARD')
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function confirmToggle() {
    setToggling(true)
    try {
      await api.patch(`/api/users/${toggleTarget.id}/toggle-active`)
      setToggleTarget(null)
      load()
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur')
    }
    setToggling(false)
  }

  async function confirmReset() {
    if (resetPassword.length < 6) { setResetError('Mot de passe minimum 6 caractères'); return }
    setResetting(true)
    setResetError('')
    try {
      await api.post(`/api/users/${resetTarget.id}/reset-password`, { new_password: resetPassword })
      setResetTarget(null)
      setResetPassword('')
    } catch (err) {
      setResetError(err.response?.data?.message || 'Erreur')
    }
    setResetting(false)
  }

  const secretaryCount = users.filter(u => u.role_name === 'secretary').length
  const canAddSecretary = tier === 'PRO' || secretaryCount === 0

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-steel-900">Utilisateurs</h1>
          <p className="text-sm text-steel-500 mt-0.5">{users.length} compte(s) — licence {tier}</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-brand hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Ajouter un compte
        </button>
      </div>

      <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-steel-200 bg-steel-50">
              <th className="text-left px-4 py-3 text-steel-500 font-medium">Nom complet</th>
              <th className="text-left px-4 py-3 text-steel-500 font-medium">Nom d'utilisateur</th>
              <th className="text-left px-4 py-3 text-steel-500 font-medium">Rôle</th>
              <th className="text-left px-4 py-3 text-steel-500 font-medium">Statut</th>
              <th className="text-right px-4 py-3 text-steel-500 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-steel-400">Chargement...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-steel-400">Aucun compte</td></tr>
            ) : users.map(u => (
              <tr key={u.id} className="border-b border-steel-100 hover:bg-steel-50 transition-colors">
                <td className="px-4 py-3 text-steel-800 font-medium">{u.full_name}</td>
                <td className="px-4 py-3 text-steel-600 font-mono text-xs">{u.username}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[u.role_name] || 'bg-steel-100 text-steel-500'}`}>
                    {u.role_label}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.is_active === 1 ? 'bg-brand-50 text-brand-600' : 'bg-steel-100 text-steel-500'}`}>
                    {u.is_active === 1 ? 'Actif' : 'Inactif'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {u.role_name !== 'admin' && (
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => { setResetTarget(u); setResetPassword(''); setResetError('') }}
                        className="text-xs text-steel-500 hover:text-brand transition-colors">Mot de passe</button>
                      <button onClick={() => setToggleTarget(u)}
                        className={`text-xs transition-colors ${u.is_active === 1 ? 'text-red-500 hover:text-red-600' : 'text-brand hover:text-brand-600'}`}>
                        {u.is_active === 1 ? 'Désactiver' : 'Réactiver'}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <AddUserModal
          canAddSecretary={canAddSecretary}
          canAddAccountant={tier === 'PRO'}
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); load() }}
        />
      )}

      {toggleTarget && (
        <ConfirmModal
          title={toggleTarget.is_active === 1 ? 'Désactiver ce compte' : 'Réactiver ce compte'}
          message={toggleTarget.is_active === 1
            ? "L'utilisateur ne pourra plus se connecter."
            : 'Cet utilisateur pourra de nouveau se connecter.'}
          danger={toggleTarget.is_active === 1}
          confirmLabel={toggleTarget.is_active === 1 ? 'Désactiver' : 'Réactiver'}
          saving={toggling}
          onCancel={() => setToggleTarget(null)}
          onConfirm={confirmToggle}
        >
          <div className="bg-steel-50 rounded-lg px-4 py-3">
            <p className="font-medium text-steel-800">{toggleTarget.full_name}</p>
            <p className="text-xs text-steel-500 mt-0.5">{toggleTarget.role_label}</p>
          </div>
        </ConfirmModal>
      )}

      {resetTarget && (
        <ConfirmModal
          title="Réinitialiser le mot de passe"
          message={`Nouveau mot de passe pour ${resetTarget.full_name}.`}
          confirmLabel="Réinitialiser"
          saving={resetting}
          onCancel={() => setResetTarget(null)}
          onConfirm={confirmReset}
        >
          <input type="password" autoFocus value={resetPassword} onChange={e => setResetPassword(e.target.value)}
            placeholder="Nouveau mot de passe"
            className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
          {resetError && <p className="text-red-500 text-xs mt-2">{resetError}</p>}
        </ConfirmModal>
      )}
    </div>
  )
}

function AddUserModal({ canAddSecretary, canAddAccountant, onClose, onCreated }) {
  const defaultRole = canAddSecretary ? 'secretary' : (canAddAccountant ? 'accountant' : '')
  const [form, setForm] = useState({ full_name: '', username: '', password: '', role: defaultRole })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.full_name.trim() || !form.username.trim() || !form.password || !form.role) {
      setError('Tous les champs sont requis'); return
    }
    setSaving(true); setError('')
    try {
      await api.post('/api/users', form)
      onCreated()
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-medium text-steel-900 mb-4">Ajouter un compte</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-steel-500 mb-1">Nom complet <span className="text-red-500">*</span></label>
            <input type="text" required value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
          </div>
          <div>
            <label className="block text-xs text-steel-500 mb-1">Nom d'utilisateur <span className="text-red-500">*</span></label>
            <input type="text" required value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
          </div>
          <div>
            <label className="block text-xs text-steel-500 mb-1">Mot de passe <span className="text-red-500">*</span></label>
            <input type="password" required value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
          </div>
          <div>
            <label className="block text-xs text-steel-500 mb-1">Rôle <span className="text-red-500">*</span></label>
            <select required value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
              <option value="">— Sélectionner —</option>
              {canAddSecretary && <option value="secretary">Secrétaire</option>}
              {canAddAccountant && <option value="accountant">Comptable</option>}
            </select>
            {!canAddSecretary && !canAddAccountant && (
              <p className="text-xs text-orange-500 mt-1">Licence STANDARD : limite d'un compte secrétaire atteinte.</p>
            )}
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50">Annuler</button>
            <button type="submit" disabled={saving || !form.role} className="flex-1 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium">
              {saving ? 'Ajout...' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
