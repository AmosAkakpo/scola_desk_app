import { useState } from 'react'

// Deep-equality via JSON — settings values are small plain objects/arrays.
export const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

export function useSettingsMsg() {
  const [msg, setMsg] = useState('')
  function showMsg(text) { setMsg(text); setTimeout(() => setMsg(''), 2000) }
  return [msg, showMsg]
}

// Save-confirmation modal shared by the Paramètres sub-pages.
// `confirm` shape: { show, label, onConfirm, onCancel } — onCancel reverts
// the edited state back to its last-saved snapshot.
export function SaveConfirmModal({ confirm, onClose }) {
  if (!confirm.show) return null
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => { confirm.onCancel?.(); onClose() }}>
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-steel-900 mb-1">Confirmer la modification</h3>
        <p className="text-sm text-steel-500 mb-5">
          Voulez-vous vraiment enregistrer les modifications apportées à <strong className="text-steel-800">{confirm.label}</strong> ?
        </p>
        <div className="flex gap-3 justify-end">
          <button onClick={() => { confirm.onCancel?.(); onClose() }}
            className="px-4 py-2 border border-steel-200 text-steel-600 rounded-lg text-sm hover:bg-steel-50 transition-colors">
            Annuler
          </button>
          <button onClick={() => { confirm.onConfirm(); onClose() }}
            className="px-4 py-2 bg-brand hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors">
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}
