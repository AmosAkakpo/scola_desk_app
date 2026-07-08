import { useState } from 'react'

// Two modes: plain yes/no (default), or "type X to confirm" when requireMatch
// is set — used for destructive/sensitive actions (delete, personal info,
// conduite) where a stray click shouldn't be enough.
export default function ConfirmModal({
  title,
  message,
  children,
  requireMatch,
  matchLabel = 'matricule',
  danger = false,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  saving = false,
  savingLabel = 'Enregistrement...',
  onConfirm,
  onCancel,
}) {
  const [matchInput, setMatchInput] = useState('')
  const needsMatch = !!requireMatch
  const matches = !needsMatch || matchInput.trim().toLowerCase() === requireMatch.trim().toLowerCase()

  const confirmClasses = danger ? 'bg-red-500 hover:bg-red-600' : 'bg-brand hover:bg-brand-600'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-base font-medium text-steel-900 mb-1">{title}</h2>
        {message && <p className="text-sm text-steel-500 mb-4">{message}</p>}
        {children && <div className="mb-4">{children}</div>}

        {needsMatch && (
          <div className="mb-4">
            <label className="block text-xs text-steel-500 mb-1">
              Entrez le {matchLabel} pour confirmer — <span className="font-bold text-steel-800 select-all">{requireMatch}</span>
            </label>
            <input
              type="text"
              value={matchInput}
              onChange={e => setMatchInput(e.target.value)}
              placeholder={requireMatch}
              className={`w-full px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none transition-colors ${
                matchInput && !matches ? 'border-red-300 focus:border-red-400' :
                matchInput && matches ? 'border-brand focus:border-brand' : 'border-steel-200 focus:border-brand'
              }`}
            />
            {matchInput && !matches && (
              <p className="text-xs text-red-500 mt-1">{matchLabel.charAt(0).toUpperCase() + matchLabel.slice(1)} incorrect</p>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onCancel} disabled={saving}
            className="flex-1 py-2.5 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50 disabled:opacity-50">
            {cancelLabel}
          </button>
          <button onClick={onConfirm} disabled={saving || !matches}
            className={`flex-1 py-2.5 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${confirmClasses}`}>
            {saving ? savingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
