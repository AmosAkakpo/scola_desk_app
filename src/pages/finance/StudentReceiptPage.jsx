import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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

export default function StudentReceiptPage() {
  const { studentId } = useParams()
  const navigate = useNavigate()

  const [data, setData] = useState(null)
  const [selections, setSelections] = useState([])
  const [loading, setLoading] = useState(true)

  // selectedFees: { [fee_type_id]: amountString }
  const [selectedFees, setSelectedFees] = useState({})
  const [amountReceived, setAmountReceived] = useState('')
  const [method, setMethod] = useState('especes')
  const [payerName, setPayerName] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [lastResult, setLastResult] = useState(null)
  const [printModal, setPrintModal] = useState(null) // { type: 'receipt'|'statement', data }

  useEffect(() => {
    if (!printModal) return
    const style = document.createElement('style')
    style.id = 'scola-print-style'
    style.textContent = '@media print { @page { size: A4 portrait; margin: 0; } body * { visibility: hidden !important; } #scola-print-content { visibility: visible !important; position: fixed !important; top: 0; left: 0; width: 100%; height: 100%; overflow: visible; } #scola-print-content * { visibility: visible !important; } }'
    document.head.appendChild(style)
    return () => { document.getElementById('scola-print-style')?.remove() }
  }, [printModal])

  function load() {
    setLoading(true)
    Promise.all([
      api.get(`/api/finance/tuition/${studentId}`),
      api.get(`/api/finance/tuition/${studentId}/fee-selections`),
    ]).then(([tuitionRes, selRes]) => {
      setData(tuitionRes.data)
      setSelections(selRes.data.selections || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [studentId])

  // Reset fee selections when data reloads
  useEffect(() => { setSelectedFees({}) }, [studentId])

  const totalSelected = useMemo(() => {
    return Object.values(selectedFees).reduce((sum, v) => sum + (parseFloat(v) || 0), 0)
  }, [selectedFees])

  const changeToReturn = useMemo(() => {
    const received = parseFloat(amountReceived) || 0
    return Math.max(0, received - totalSelected)
  }, [amountReceived, totalSelected])

  function toggleFee(fee) {
    setSelectedFees(prev => {
      if (prev[fee.fee_type_id] !== undefined) {
        const next = { ...prev }
        delete next[fee.fee_type_id]
        return next
      }
      return { ...prev, [fee.fee_type_id]: String(fee.remaining) }
    })
  }

  function setFeeAmount(feeTypeId, value, max) {
    setSelectedFees(prev => {
      const num = parseFloat(value)
      const capped = !isNaN(num) && num > max ? String(max) : value
      return { ...prev, [feeTypeId]: capped }
    })
  }

  async function handlePay(andPrint) {
    const fees = Object.entries(selectedFees)
      .map(([fee_type_id, amount]) => ({ fee_type_id: parseInt(fee_type_id), amount: parseFloat(amount) || 0 }))
      .filter(f => f.amount > 0)

    if (fees.length === 0) { setError('Sélectionnez au moins un frais et entrez un montant'); return }

    const received = parseFloat(amountReceived) || 0
    if (received <= 0) { setError('Entrez le montant remis par le parent'); return }

    setSaving(true); setError('')
    try {
      const res = await api.post(`/api/finance/tuition/${studentId}/pay`, {
        fees,
        amount_received: received,
        payment_method: method,
        payer_name: payerName || null,
        reference: reference || null,
        notes: notes || null,
      })
      setLastResult(res.data)
      setSelectedFees({})
      setAmountReceived('')
      setPayerName('')
      setReference('')
      setNotes('')
      load()
      if (andPrint) printReceipt(res.data.payment.id)
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de l\'enregistrement')
    }
    setSaving(false)
  }

  async function toggleOptionalFee(feeTypeId, optIn) {
    try {
      await api.put(`/api/finance/tuition/${studentId}/fee-selections`, { fee_type_id: feeTypeId, opted_in: optIn })
      load()
    } catch (err) {
      if (err.response?.data?.error === 'HAS_PAYMENTS') alert('Ce frais a déjà reçu un paiement.')
    }
  }

  function printReceipt(paymentId) {
    api.get(`/api/finance/receipt/payment/${paymentId}`).then(res => {
      setPrintModal({ type: 'receipt', data: res.data })
    })
  }

  function printStatement() {
    api.get(`/api/finance/receipt/statement/${studentId}`).then(res => {
      setPrintModal({ type: 'statement', data: res.data })
    })
  }

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
  if (!data) return <p className="text-steel-400 text-sm text-center py-12">Élève introuvable</p>

  const optionalFees = selections.filter(s => !s.is_mandatory && !s.is_system)
  const payableFees = data.fees.filter(f => f.remaining > 0)
  const hasSelection = Object.keys(selectedFees).length > 0

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate('/finance/tuition')} className="text-xs text-steel-400 hover:text-steel-600 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Retour aux paiements
        </button>
        <button onClick={printStatement} className="px-3 py-1.5 border border-steel-200 text-steel-600 hover:bg-steel-50 rounded-lg text-xs font-medium transition-colors">
          Imprimer état des frais
        </button>
      </div>

      <div className="mb-6">
        <h1 className="text-xl font-medium text-steel-900">{data.student.full_name}</h1>
        <p className="text-sm text-steel-500 mt-0.5">
          Matricule: {data.student.matricule || '—'} | Classe: {data.student.classroom_label} | Année: {data.student.year_label}
        </p>
      </div>

      {/* Fee breakdown with selection */}
      <section className="bg-white rounded-xl border border-steel-200 overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-steel-200 bg-steel-50 flex items-center justify-between">
          <h2 className="text-sm font-medium text-steel-700">Frais</h2>
          {payableFees.length > 0 && (
            <button
              onClick={() => {
                if (Object.keys(selectedFees).length === payableFees.length) {
                  setSelectedFees({})
                } else {
                  const all = {}
                  payableFees.forEach(f => { all[f.fee_type_id] = String(f.remaining) })
                  setSelectedFees(all)
                }
              }}
              className="text-xs text-brand hover:text-brand-600"
            >
              {Object.keys(selectedFees).length === payableFees.length ? 'Tout désélectionner' : 'Tout sélectionner'}
            </button>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-steel-100">
              <th className="w-8 px-3 py-2"></th>
              <th className="text-left px-3 py-2 text-steel-500 font-medium text-xs">Frais</th>
              <th className="text-right px-3 py-2 text-steel-500 font-medium text-xs">Montant</th>
              <th className="text-right px-3 py-2 text-steel-500 font-medium text-xs">Payé</th>
              <th className="text-right px-3 py-2 text-steel-500 font-medium text-xs">Reste</th>
              <th className="text-right px-3 py-2 text-steel-500 font-medium text-xs w-32">À payer</th>
            </tr>
          </thead>
          <tbody>
            {data.fees.map(f => {
              const isSelected = selectedFees[f.fee_type_id] !== undefined
              const isPaid = f.remaining <= 0
              return (
                <tr key={f.fee_type_id} className={`border-b border-steel-50 ${isSelected ? 'bg-brand-50/40' : ''}`}>
                  <td className="px-3 py-2 text-center">
                    {!isPaid && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleFee(f)}
                        className="rounded border-steel-300 text-brand focus:ring-brand"
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 text-steel-800">{f.name}</td>
                  <td className="px-3 py-2 text-right text-steel-700">{formatXOF(f.amount_due)}</td>
                  <td className="px-3 py-2 text-right text-steel-700">{formatXOF(f.amount_paid)}</td>
                  <td className="px-3 py-2 text-right text-steel-700">{formatXOF(f.remaining)}</td>
                  <td className="px-3 py-2 text-right">
                    {isPaid ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-brand-50 text-brand-600">Soldé</span>
                    ) : isSelected ? (
                      <input
                        type="number"
                        min="1"
                        max={f.remaining}
                        value={selectedFees[f.fee_type_id]}
                        onChange={e => setFeeAmount(f.fee_type_id, e.target.value, f.remaining)}
                        className="w-28 px-2 py-1 border border-brand rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-brand bg-white"
                      />
                    ) : (
                      <span className="text-steel-300 text-xs">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-steel-50 font-semibold">
              <td></td>
              <td className="px-3 py-2.5 text-steel-800">TOTAL</td>
              <td className="px-3 py-2.5 text-right text-steel-800">{formatXOF(data.summary.totalDue)}</td>
              <td className="px-3 py-2.5 text-right text-steel-800">{formatXOF(data.summary.totalPaid)}</td>
              <td className="px-3 py-2.5 text-right text-steel-800">{formatXOF(data.summary.remaining)}</td>
              <td className="px-3 py-2.5 text-right text-brand font-bold">
                {hasSelection ? formatXOF(totalSelected) : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      {/* Optional fees */}
      {optionalFees.length > 0 && (
        <section className="bg-white rounded-xl border border-steel-200 p-4 mb-4">
          <h2 className="text-sm font-medium text-steel-700 mb-3">Frais optionnels</h2>
          <div className="space-y-2">
            {optionalFees.map(f => (
              <label key={f.fee_type_id} className="flex items-center justify-between text-sm cursor-pointer">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={f.opted_in} disabled={!f.can_toggle}
                    onChange={e => toggleOptionalFee(f.fee_type_id, e.target.checked)}
                    className="rounded border-steel-300" />
                  <span className="text-steel-700">{f.name}</span>
                  {f.has_payments && !f.can_toggle && <span className="text-[10px] text-steel-400">(paiement déjà reçu)</span>}
                </div>
                <span className="text-steel-500">{formatXOF(f.amount)}</span>
              </label>
            ))}
          </div>
        </section>
      )}

      {/* Payment form */}
      {data.summary.remaining > 0 && (
        <section className="bg-white rounded-xl border border-steel-200 p-4 mb-4">
          <h2 className="text-sm font-medium text-steel-700 mb-3">Enregistrer un paiement</h2>

          {!hasSelection && (
            <p className="text-xs text-steel-400 mb-3">Cochez les frais à régler dans le tableau ci-dessus.</p>
          )}

          {hasSelection && (
            <div className="bg-steel-50 rounded-lg border border-steel-200 p-3 mb-3 text-sm space-y-1">
              {Object.entries(selectedFees).map(([feeTypeId, amt]) => {
                const fee = data.fees.find(f => f.fee_type_id === parseInt(feeTypeId))
                if (!fee) return null
                const num = parseFloat(amt) || 0
                return (
                  <div key={feeTypeId} className="flex items-center justify-between text-xs">
                    <span className="text-steel-600">{fee.name}</span>
                    <span className="text-steel-800 font-medium">{formatXOF(num)}</span>
                  </div>
                )
              })}
              <div className="border-t border-steel-200 pt-1 mt-1 flex items-center justify-between font-semibold text-xs">
                <span className="text-steel-700">Total à enregistrer</span>
                <span className="text-steel-900">{formatXOF(totalSelected)}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-steel-500 mb-1">Montant remis par le parent *</label>
              <input
                type="number"
                min="1"
                value={amountReceived}
                onChange={e => setAmountReceived(e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand"
                placeholder="Ex: 80 000"
              />
              {parseFloat(amountReceived) > 0 && changeToReturn > 0 && (
                <p className="text-xs text-orange-600 mt-1 font-medium">Monnaie à rendre : {formatXOF(changeToReturn)}</p>
              )}
            </div>
            <div>
              <label className="block text-xs text-steel-500 mb-1">Mode de paiement</label>
              <select value={method} onChange={e => setMethod(e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
                {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-steel-500 mb-1">Nom du payeur</label>
              <input type="text" value={payerName} onChange={e => setPayerName(e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" placeholder="Parent / tuteur" />
            </div>
            <div>
              <label className="block text-xs text-steel-500 mb-1">Référence</label>
              <input type="text" value={reference} onChange={e => setReference(e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" placeholder="N° transaction (optionnel)" />
            </div>
          </div>

          <div className="mb-3">
            <label className="block text-xs text-steel-500 mb-1">Notes</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand" placeholder="Optionnel" />
          </div>

          {error && <p className="text-red-500 text-xs mb-2">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={() => handlePay(false)}
              disabled={saving || !hasSelection}
              className="flex-1 py-2.5 border border-brand text-brand hover:bg-brand-50 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? 'Enregistrement...' : 'Enregistrer sans imprimer'}
            </button>
            <button
              onClick={() => handlePay(true)}
              disabled={saving || !hasSelection}
              className="flex-1 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? 'Enregistrement...' : 'Enregistrer et imprimer'}
            </button>
          </div>
        </section>
      )}

      {/* Last result confirmation */}
      {lastResult && (
        <section className="bg-brand-50 rounded-xl border border-brand-200 p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-brand">Paiement enregistré</p>
              <p className="text-xs text-brand/70">
                Reçu N° {lastResult.payment.receipt_number} — {formatXOF(lastResult.amount_recorded)}
                {lastResult.change_to_return > 0 && ` — Monnaie rendue : ${formatXOF(lastResult.change_to_return)}`}
              </p>
            </div>
            <button onClick={() => printReceipt(lastResult.payment.id)} className="px-3 py-1.5 bg-brand text-white rounded text-xs font-medium hover:bg-brand-600 transition-colors">
              Imprimer reçu
            </button>
          </div>
        </section>
      )}

      {/* Payment history */}
      {data.payments.length > 0 && (
        <section className="bg-white rounded-xl border border-steel-200 p-4">
          <h2 className="text-sm font-medium text-steel-700 mb-3">Historique des paiements</h2>
          <div className="space-y-2">
            {data.payments.map(p => (
              <div key={p.id} className="flex items-center justify-between text-sm bg-steel-50 rounded-lg px-3 py-2">
                <div>
                  <p className="text-steel-800 font-medium">{formatXOF(p.amount)}</p>
                  <p className="text-[10px] text-steel-400">
                    {new Date(p.payment_date).toLocaleDateString('fr-FR')} — {p.receipt_number} — {p.payer_name || '—'}
                  </p>
                  {p.allocations?.length > 0 && (
                    <p className="text-[10px] text-steel-400">
                      {p.allocations.map(a => `${a.fee_name}: ${formatXOF(a.amount)}`).join(' · ')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-steel-500 capitalize">{p.payment_method?.replace('_', ' ')}</span>
                  <button onClick={() => printReceipt(p.id)} className="text-xs text-brand hover:text-brand-600">Voir reçu</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Print modal */}
      {printModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setPrintModal(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div id="scola-print-content" className="overflow-auto flex-1 p-6">
              {printModal.type === 'receipt'
                ? <PrintReceipt data={printModal.data} />
                : <PrintStatement data={printModal.data} />}
            </div>
            <div className="flex gap-2 p-4 border-t border-steel-200 shrink-0">
              <button onClick={() => window.print()} className="flex-1 px-3 py-2 bg-brand hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors">
                Imprimer
              </button>
              <button onClick={() => setPrintModal(null)} className="px-3 py-2 border border-steel-200 text-steel-600 hover:bg-steel-50 rounded-lg text-sm transition-colors">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PrintReceipt({ data }) {
  const school = data.school || {}
  const p = data.data || {}
  const fmtN = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0)) + ' F CFA'
  const cellH = { padding: '6px 10px', border: '1px solid #ccc', backgroundColor: '#f0f0f0', fontWeight: 'bold', width: '20%', fontSize: 11, whiteSpace: 'nowrap' }
  const cellV = { padding: '6px 10px', border: '1px solid #ccc', fontSize: 12 }
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: '12mm 16mm', fontSize: 12, color: '#000', minHeight: '297mm', boxSizing: 'border-box' }}>
      {/* School header */}
      <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: 10, marginBottom: 16 }}>
        <p style={{ fontWeight: 'bold', fontSize: 18, margin: '0 0 3px' }}>{school.school_name || 'Établissement scolaire'}</p>
        {(school.city || school.country) && (
          <p style={{ fontSize: 11, margin: 0, color: '#555' }}>{[school.city, school.country].filter(Boolean).join(' — ')}</p>
        )}
        {school.phone && <p style={{ fontSize: 11, margin: '2px 0', color: '#555' }}>Tél : {school.phone}</p>}
      </div>

      {/* Title + receipt number */}
      <div style={{ textAlign: 'center', margin: '16px 0 20px' }}>
        <p style={{ fontWeight: 'bold', fontSize: 16, letterSpacing: 3, margin: 0, textTransform: 'uppercase' }}>Reçu de Paiement</p>
        <p style={{ fontSize: 13, margin: '6px 0 0' }}>N° <strong style={{ fontSize: 14 }}>{p.receipt_number || '—'}</strong></p>
      </div>

      {/* Student + payment meta */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
        <tbody>
          <tr>
            <td style={cellH}>Élève</td>
            <td style={{ ...cellV, fontWeight: 'bold' }}>{p.student_name || '—'}</td>
            <td style={cellH}>Date</td>
            <td style={cellV}>{p.payment_date ? new Date(p.payment_date).toLocaleDateString('fr-FR') : '—'}</td>
          </tr>
          <tr>
            <td style={cellH}>Matricule</td>
            <td style={cellV}>{p.matricule || '—'}</td>
            <td style={cellH}>Mode</td>
            <td style={cellV}>{p.payment_method?.replace('_', ' ') || '—'}</td>
          </tr>
          <tr>
            <td style={cellH}>Classe</td>
            <td style={cellV}>{p.classroom_label || '—'}</td>
            <td style={cellH}>Payé par</td>
            <td style={cellV}>{p.payer_name || '—'}</td>
          </tr>
          {p.reference && (
            <tr>
              <td style={cellH}>Référence</td>
              <td style={cellV} colSpan={3}>{p.reference}</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Fee lines */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
        <thead>
          <tr style={{ backgroundColor: '#1a1a1a', color: '#fff' }}>
            <th style={{ padding: '9px 12px', textAlign: 'left', fontSize: 12 }}>Désignation</th>
            <th style={{ padding: '9px 12px', textAlign: 'right', fontSize: 12, width: '35%' }}>Montant</th>
          </tr>
        </thead>
        <tbody>
          {(p.allocations || []).map((a, i) => (
            <tr key={i} style={{ backgroundColor: i % 2 ? '#f7f7f7' : '#fff' }}>
              <td style={{ padding: '8px 12px', borderBottom: '1px solid #e5e5e5' }}>{a.fee_name}</td>
              <td style={{ padding: '8px 12px', borderBottom: '1px solid #e5e5e5', textAlign: 'right' }}>{fmtN(a.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ backgroundColor: '#f0f0f0', fontWeight: 'bold', borderTop: '2px solid #333' }}>
            <td style={{ padding: '10px 12px', fontSize: 14 }}>TOTAL PAYÉ</td>
            <td style={{ padding: '10px 12px', fontSize: 14, textAlign: 'right' }}>{fmtN(p.amount)}</td>
          </tr>
        </tfoot>
      </table>

      {p.notes && <p style={{ fontSize: 11, color: '#555', marginBottom: 8 }}>Notes : {p.notes}</p>}

      {/* Signature block */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48, fontSize: 12 }}>
        <div style={{ textAlign: 'center', minWidth: 180 }}>
          <p style={{ fontWeight: 'bold', marginBottom: 40 }}>Signature du payeur</p>
          <div style={{ borderTop: '1px solid #000', paddingTop: 4 }}>{p.payer_name || '________________________'}</div>
        </div>
        <div style={{ textAlign: 'center', minWidth: 180 }}>
          <p style={{ fontWeight: 'bold', marginBottom: 40 }}>Cachet et signature</p>
          <div style={{ borderTop: '1px solid #000', paddingTop: 4 }}>{p.receiver_name || '________________________'}</div>
        </div>
      </div>

      <p style={{ marginTop: 'auto', paddingTop: 40, textAlign: 'center', fontSize: 9, color: '#bbb' }}>ScolaDesk — Système de gestion scolaire</p>
    </div>
  )
}

function PrintStatement({ data }) {
  const school = data.school || {}
  const student = data.student || {}
  const summary = data.summary || {}
  const fees = data.fees || []
  const fmtN = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0)) + ' F CFA'
  const cellH = { padding: '6px 10px', border: '1px solid #ccc', backgroundColor: '#f0f0f0', fontWeight: 'bold', width: '20%', fontSize: 11, whiteSpace: 'nowrap' }
  const cellV = { padding: '6px 10px', border: '1px solid #ccc', fontSize: 12 }
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: '12mm 16mm', fontSize: 12, color: '#000', minHeight: '297mm', boxSizing: 'border-box' }}>
      {/* School header */}
      <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: 10, marginBottom: 16 }}>
        <p style={{ fontWeight: 'bold', fontSize: 18, margin: '0 0 3px' }}>{school.school_name || 'Établissement scolaire'}</p>
        {(school.city || school.country) && (
          <p style={{ fontSize: 11, margin: 0, color: '#555' }}>{[school.city, school.country].filter(Boolean).join(' — ')}</p>
        )}
      </div>

      {/* Title */}
      <div style={{ textAlign: 'center', margin: '16px 0 20px' }}>
        <p style={{ fontWeight: 'bold', fontSize: 16, letterSpacing: 3, margin: 0, textTransform: 'uppercase' }}>État des Frais Scolaires</p>
        <p style={{ fontSize: 12, margin: '5px 0 0', color: '#555' }}>{student.year_label || ''}</p>
      </div>

      {/* Student info */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
        <tbody>
          <tr>
            <td style={cellH}>Élève</td>
            <td style={{ ...cellV, fontWeight: 'bold' }}>{student.full_name || '—'}</td>
            <td style={cellH}>Matricule</td>
            <td style={cellV}>{student.matricule || '—'}</td>
          </tr>
          <tr>
            <td style={cellH}>Classe</td>
            <td style={cellV} colSpan={3}>{student.classroom_label || '—'}</td>
          </tr>
        </tbody>
      </table>

      {/* Fee table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
        <thead>
          <tr style={{ backgroundColor: '#1a1a1a', color: '#fff' }}>
            <th style={{ padding: '9px 12px', textAlign: 'left', fontSize: 12 }}>Frais</th>
            <th style={{ padding: '9px 12px', textAlign: 'right', fontSize: 12, width: '22%' }}>Montant dû</th>
            <th style={{ padding: '9px 12px', textAlign: 'right', fontSize: 12, width: '22%' }}>Payé</th>
            <th style={{ padding: '9px 12px', textAlign: 'right', fontSize: 12, width: '22%' }}>Reste</th>
          </tr>
        </thead>
        <tbody>
          {fees.map((f, i) => (
            <tr key={i} style={{ backgroundColor: i % 2 ? '#f7f7f7' : '#fff' }}>
              <td style={{ padding: '8px 12px', borderBottom: '1px solid #e5e5e5' }}>{f.name}</td>
              <td style={{ padding: '8px 12px', borderBottom: '1px solid #e5e5e5', textAlign: 'right' }}>{fmtN(f.amount_due)}</td>
              <td style={{ padding: '8px 12px', borderBottom: '1px solid #e5e5e5', textAlign: 'right', color: '#166534' }}>{fmtN(f.amount_paid)}</td>
              <td style={{ padding: '8px 12px', borderBottom: '1px solid #e5e5e5', textAlign: 'right', fontWeight: f.remaining > 0 ? 'bold' : 'normal', color: f.remaining > 0 ? '#b91c1c' : '#166534' }}>{fmtN(f.remaining)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ backgroundColor: '#f0f0f0', fontWeight: 'bold', borderTop: '2px solid #333', fontSize: 13 }}>
            <td style={{ padding: '10px 12px' }}>TOTAL</td>
            <td style={{ padding: '10px 12px', textAlign: 'right' }}>{fmtN(summary.totalDue)}</td>
            <td style={{ padding: '10px 12px', textAlign: 'right', color: '#166534' }}>{fmtN(summary.totalPaid)}</td>
            <td style={{ padding: '10px 12px', textAlign: 'right', color: summary.remaining > 0 ? '#b91c1c' : '#166534' }}>{fmtN(summary.remaining)}</td>
          </tr>
        </tfoot>
      </table>

      <p style={{ fontSize: 11, color: '#555' }}>Édité le : {new Date().toLocaleDateString('fr-FR')}</p>
      <p style={{ marginTop: 'auto', paddingTop: 40, textAlign: 'center', fontSize: 9, color: '#bbb' }}>ScolaDesk — Système de gestion scolaire</p>
    </div>
  )
}
