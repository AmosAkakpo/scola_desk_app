import { useState, useEffect } from 'react'
import api from '../../utils/api'

function formatXOF(n) {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' F'
}

const METHODS = [
  { value: 'especes', label: 'Espèces' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'virement', label: 'Virement' },
  { value: 'autre', label: 'Autre' },
]

function getMonthOptions() {
  const opts = []
  const now = new Date()
  for (let i = -2; i <= 1; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const val = d.toISOString().slice(0, 7)
    const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    opts.push({ value: val, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }
  return opts
}

export default function SalariesPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [showPay, setShowPay] = useState(null)
  function load() {
    setLoading(true)
    api.get(`/api/finance/salaries?pay_period=${month}`).then(res => {
      setData(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [month])

  const teachers = data?.teachers || []
  const paid = teachers.filter(t => t.entry?.is_paid)
  const unpaid = teachers.filter(t => !t.entry?.is_paid)
  const totalPaid = paid.reduce((s, t) => s + (t.entry?.amount || 0), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-steel-900">Salaires</h1>
          <p className="text-sm text-steel-500 mt-0.5">{paid.length}/{teachers.length} versés — {formatXOF(totalPaid)} ce mois</p>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <select value={month} onChange={e => setMonth(e.target.value)}
          className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
          {getMonthOptions().map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-steel-200 bg-steel-50">
                <th className="text-left px-4 py-2.5 text-steel-500 font-medium">Enseignant</th>
                <th className="text-right px-4 py-2.5 text-steel-500 font-medium">H. prévues</th>
                <th className="text-right px-4 py-2.5 text-steel-500 font-medium">H. réelles</th>
                <th className="text-right px-4 py-2.5 text-steel-500 font-medium">Calculé</th>
                <th className="text-right px-4 py-2.5 text-steel-500 font-medium">Versé</th>
                <th className="text-center px-4 py-2.5 text-steel-500 font-medium">Statut</th>
                <th className="text-center px-4 py-2.5 text-steel-500 font-medium w-24"></th>
              </tr>
            </thead>
            <tbody>
              {teachers.map(t => {
                const taux = t.hours_prevues > 0 ? Math.round((t.hours_reelles / t.hours_prevues) * 100) : null
                return (
                  <tr key={t.id} className="border-b border-steel-50">
                    <td className="px-4 py-2.5">
                      <p className="text-steel-800 font-medium">{t.full_name}</p>
                      {t.matricule && <p className="text-[10px] text-steel-400 font-mono">{t.matricule}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-steel-500 text-xs">{t.hours_prevues > 0 ? `${t.hours_prevues}h` : '—'}</td>
                    <td className="px-4 py-2.5 text-right text-xs">
                      {t.hours_reelles > 0 ? (
                        <span className={taux !== null && taux < 80 ? 'text-orange-600 font-medium' : 'text-steel-700'}>{t.hours_reelles}h</span>
                      ) : <span className="text-steel-300">0h</span>}
                      {taux !== null && <span className="text-steel-400 ml-1">({taux}%)</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-steel-700">{t.calculated_amount > 0 ? formatXOF(t.calculated_amount) : '—'}</td>
                    <td className="px-4 py-2.5 text-right text-steel-800">{t.entry?.is_paid ? formatXOF(t.entry.amount) : '—'}</td>
                    <td className="px-4 py-2.5 text-center">
                      {t.entry?.is_paid ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-600">Payé</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-steel-100 text-steel-500">En attente</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {!t.entry?.is_paid ? (
                        <button onClick={() => setShowPay(t)} className="px-2.5 py-1 bg-brand hover:bg-brand-600 text-white rounded text-xs font-medium transition-colors">
                          Payer
                        </button>
                      ) : t.entry.receipt_number ? (
                        <button onClick={() => printSalaryReceipt(t.entry.id)} className="px-2.5 py-1 border border-steel-200 text-steel-600 hover:bg-steel-50 rounded text-xs font-medium transition-colors">
                          Reçu
                        </button>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
              {teachers.length === 0 && (
                <tr><td colSpan="7" className="px-4 py-8 text-center text-steel-400 text-sm">Aucun enseignant actif</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showPay && (
        <PaySalaryModal teacher={showPay} month={month} onClose={() => setShowPay(null)} onPaid={() => { setShowPay(null); load() }} />
      )}
    </div>
  )
}

function printSalaryReceipt(entryId) {
  api.get(`/api/finance/receipt/salary/${entryId}`).then(res => {
    const school = res.data.school || {}
    const d = res.data.data || {}
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reçu ${d.receipt_number}</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;max-width:350px;margin:0 auto;padding:20px}
h1{font-size:16px;text-align:center;margin:0 0 4px}.sub{text-align:center;font-size:10px;color:#666;margin-bottom:16px}
.line{border-top:1px dashed #ccc;margin:10px 0}.meta{font-size:10px;color:#666}
@media print{body{padding:0}}</style></head>
<body>
<h1>${school.school_name || 'ScolaDesk'}</h1>
<div class="sub">${school.city || ''} — ${school.country || ''}</div>
<div class="line"></div>
<p><strong>REÇU DE SALAIRE</strong></p>
<p>N°: <strong>${d.receipt_number || ''}</strong></p>
<p>Date: ${d.paid_at ? new Date(d.paid_at).toLocaleDateString('fr-FR') : ''}</p>
<p>Enseignant: <strong>${d.teacher_name || ''}</strong></p>
<p>Matricule: ${d.teacher_matricule || ''}</p>
<p>Mois: ${d.month || ''}</p>
<div class="line"></div>
<p style="font-size:16px;font-weight:bold;text-align:center">${new Intl.NumberFormat('fr-FR').format(Math.round(d.amount || 0))} F</p>
<div class="line"></div>
<p class="meta">Mode: ${d.payment_method || ''} ${d.reference ? '— Réf: ' + d.reference : ''}</p>
<p class="meta">Payé par: ${d.payer_name || school.school_name || '—'}</p>
<p class="meta">Reçu par: ${d.receiver_name || '—'}</p>
<div style="margin-top:30px;text-align:center;font-size:9px;color:#999">ScolaDesk</div>
</body></html>`
    const w = window.open('', '_blank', 'width=400,height=600')
    w.document.write(html)
    w.document.close()
    w.print()
  })
}

function PaySalaryModal({ teacher, month, onClose, onPaid }) {
  const [preview, setPreview] = useState(null)
  const [amount, setAmount] = useState('')
  const [adjustmentReason, setAdjustmentReason] = useState('')
  const [method, setMethod] = useState('especes')
  const [payerName, setPayerName] = useState('')
  const [reference, setReference] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/api/finance/salaries/preview/${teacher.id}?pay_period=${month}`).then(res => {
      setPreview(res.data)
      setAmount(String(Math.round(res.data.calculated_amount || 0)))
    }).catch(() => {})
  }, [teacher.id, month])

  const calculatedAmount = preview?.calculated_amount || 0
  const currentAmount = parseFloat(amount) || 0
  const isAdjusted = calculatedAmount > 0 && Math.abs(currentAmount - calculatedAmount) > 0.01

  async function handleSubmit(e) {
    e.preventDefault()
    if (!currentAmount || currentAmount <= 0) return
    if (isAdjusted && !adjustmentReason.trim()) {
      setError('Un motif est requis si le montant diffère du calculé')
      return
    }
    setSaving(true); setError('')
    try {
      await api.post('/api/finance/salaries/pay', {
        teacher_id: teacher.id,
        pay_period: month,
        amount: currentAmount,
        calculated_amount: calculatedAmount,
        adjustment_reason: isAdjusted ? adjustmentReason.trim() : null,
        payment_method: method,
        payer_name: payerName || null,
        reference: reference || null,
      })
      onPaid()
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="p-5 border-b border-steel-200">
          <h2 className="text-base font-medium text-steel-900">Payer {teacher.full_name}</h2>
          <p className="text-xs text-steel-500 mt-0.5">{month}</p>
        </div>

        {preview && (
          <div className="px-5 pt-4 pb-0">
            <div className="bg-steel-50 rounded-lg p-3 grid grid-cols-3 gap-3 text-center text-xs mb-4">
              <div>
                <p className="text-steel-400 mb-0.5">H. prévues</p>
                <p className="font-semibold text-steel-700">{preview.hours_prevues}h</p>
              </div>
              <div>
                <p className="text-steel-400 mb-0.5">H. réelles</p>
                <p className={`font-semibold ${preview.hours_reelles < preview.hours_prevues * 0.8 ? 'text-orange-600' : 'text-steel-700'}`}>{preview.hours_reelles}h</p>
              </div>
              <div>
                <p className="text-steel-400 mb-0.5">Calculé</p>
                <p className="font-semibold text-brand">{formatXOF(calculatedAmount)}</p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div>
            <label className="block text-xs text-steel-500 mb-1">Montant à verser *</label>
            <input type="number" min="1" required value={amount} onChange={e => { setAmount(e.target.value); setError('') }}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-brand ${isAdjusted ? 'border-orange-300 bg-orange-50' : 'border-steel-200'}`} />
            {isAdjusted && (
              <p className="text-xs text-orange-600 mt-1">Diffère du montant calculé — un motif est requis</p>
            )}
          </div>

          {isAdjusted && (
            <div>
              <label className="block text-xs text-steel-500 mb-1">Motif de l'ajustement *</label>
              <input type="text" value={adjustmentReason} onChange={e => setAdjustmentReason(e.target.value)}
                className="w-full px-3 py-2 border border-orange-300 rounded-lg text-sm focus:outline-none focus:border-brand"
                placeholder="Ex: prime, avance déduite…" />
            </div>
          )}

          <div>
            <label className="block text-xs text-steel-500 mb-1">Mode de paiement</label>
            <select value={method} onChange={e => setMethod(e.target.value)}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
              {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-steel-500 mb-1">Nom du payeur</label>
              <input type="text" value={payerName} onChange={e => setPayerName(e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" placeholder="École" />
            </div>
            <div>
              <label className="block text-xs text-steel-500 mb-1">Référence</label>
              <input type="text" value={reference} onChange={e => setReference(e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" />
            </div>
          </div>

          {error && <p className="text-red-500 text-xs">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50 transition-colors">Annuler</button>
            <button type="submit" disabled={saving || !preview} className="flex-1 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
              {saving ? 'Enregistrement...' : 'Verser'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
