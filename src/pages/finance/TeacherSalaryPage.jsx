import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../../utils/api'

function formatXOF(n) {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' F'
}

// Months within [startDate, endDate] inclusive -- same fix as SalariesPage's
// getMonthOptions, so a payment can't be recorded under a month that
// doesn't actually belong to the selected academic year.
function getMonthOptions(startDate, endDate) {
  if (!startDate || !endDate) return []
  const opts = []
  const d = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')
  while (d <= end) {
    const val = d.toISOString().slice(0, 7)
    const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    opts.push({ value: val, label: label.charAt(0).toUpperCase() + label.slice(1) })
    d.setMonth(d.getMonth() + 1)
  }
  return opts
}

const METHODS = [
  { value: 'especes', label: 'Espèces' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'virement', label: 'Virement' },
  { value: 'autre', label: 'Autre' },
]

export default function TeacherSalaryPage() {
  const { teacherId } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [month, setMonth] = useState(
    searchParams.get('pay_period') || new Date().toISOString().slice(0, 7)
  )
  // Carried over from the list page when viewing a past (archived) year —
  // read-only there, no payment form.
  const archivedYearId = searchParams.get('academic_year_id') || null
  const [years, setYears] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  // Payment form
  const [amount, setAmount] = useState('')
  const [adjustmentReason, setAdjustmentReason] = useState('')
  const [method, setMethod] = useState('especes')
  const [payerName, setPayerName] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [lastReceipt, setLastReceipt] = useState(null)

  // Print
  const [printData, setPrintData] = useState(null)

  useEffect(() => {
    if (!printData) return
    const style = document.createElement('style')
    style.id = 'scola-print-style'
    style.textContent = '@media print { @page { size: A4 portrait; margin: 0; } body * { visibility: hidden !important; } #scola-print-content { visibility: visible !important; position: fixed !important; top: 0; left: 0; width: 100%; height: 100%; overflow: visible; } #scola-print-content * { visibility: visible !important; } }'
    document.head.appendChild(style)
    return () => { document.getElementById('scola-print-style')?.remove() }
  }, [printData])

  function load() {
    setLoading(true)
    const params = new URLSearchParams({ pay_period: month, ...(archivedYearId ? { academic_year_id: archivedYearId } : {}) })
    api.get(`/api/finance/salaries/${teacherId}?${params.toString()}`).then(res => {
      setData(res.data)
      // Pre-fill the amount with the calculated remaining for the month
      const expected = Math.max(0, (res.data.calculated_amount || 0) - (res.data.total_paid || 0))
      setAmount(prev => prev === '' && expected > 0 ? String(Math.round(expected)) : prev)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => {
    setSearchParams({ pay_period: month, ...(archivedYearId ? { academic_year_id: archivedYearId } : {}) }, { replace: true })
    setAmount('') // reset so load() re-prefills for the new month
    setAdjustmentReason('')
    load()
  }, [teacherId, month])

  useEffect(() => {
    api.get('/api/finance/academic-years').then(res => setYears(res.data.years || []))
  }, [])

  const selectedYear = years.find(y => archivedYearId ? y.id === parseInt(archivedYearId) : y.is_active)
  const monthOptions = getMonthOptions(selectedYear?.start_date, selectedYear?.end_date)

  // Calculated remaining for the month — drives pre-fill + adjustment reason requirement
  const expectedAmount = data ? Math.max(0, (data.calculated_amount || 0) - (data.total_paid || 0)) : 0
  const needsReason = (data?.calculated_amount || 0) > 0
    && parseFloat(amount) > 0
    && Math.abs(parseFloat(amount) - expectedAmount) > 0.01

  async function submitPay(andPrint) {
    const num = parseFloat(amount)
    if (!num || num <= 0) { setError('Montant invalide'); return }
    if (needsReason && !adjustmentReason.trim()) {
      setError(`Motif d'ajustement requis — le montant diffère du calculé restant (${formatXOF(expectedAmount)})`)
      return
    }
    setSaving(true); setError('')
    try {
      const res = await api.post(`/api/finance/salaries/${teacherId}/pay`, {
        pay_period: month,
        amount: num,
        adjustment_reason: adjustmentReason.trim() || null,
        payment_method: method,
        payer_name: payerName || null,
        reference: reference || null,
        notes: notes || null,
      })
      setLastReceipt(res.data.payment)
      setAmount(''); setAdjustmentReason(''); setPayerName(''); setReference(''); setNotes('')
      load()
      if (andPrint) printPayment(res.data.payment.id)
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de l\'enregistrement')
    }
    setSaving(false)
  }

  async function handlePay(e) {
    e.preventDefault()
    await submitPay(false)
  }

  function printPayment(paymentId) {
    api.get(`/api/finance/receipt/salary/${paymentId}`).then(res => setPrintData(res.data))
  }

  if (loading && !data) return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!data) return <p className="text-steel-400 text-sm text-center py-12">Enseignant introuvable</p>

  const monthLabel = new Date(month + '-02').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

  return (
    <div className="max-w-3xl">
      {/* Back + header */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate('/finance/salaries')}
          className="text-xs text-steel-400 hover:text-steel-600 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Retour aux salaires
        </button>
        <select value={month} onChange={e => setMonth(e.target.value)}
          className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
          {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="mb-5">
        <h1 className="text-xl font-medium text-steel-900">{data.teacher.full_name}</h1>
        <p className="text-sm text-steel-500 mt-0.5">
          {data.teacher.matricule ? `Matricule : ${data.teacher.matricule} — ` : ''}
          Taux horaire : {formatXOF(data.teacher.hourly_rate)}/h
        </p>
      </div>

      {/* Month summary card */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: 'H. prévues', value: data.hours_prevues > 0 ? `${data.hours_prevues}h` : '—', muted: true },
          { label: 'H. réelles', value: data.hours_reelles > 0 ? `${data.hours_reelles}h` : '0h', muted: data.hours_reelles === 0 },
          { label: 'Calculé', value: data.calculated_amount > 0 ? formatXOF(data.calculated_amount) : '—', muted: true },
          { label: 'Total versé', value: formatXOF(data.total_paid), highlight: data.total_paid > 0 },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-steel-200 p-4 text-center">
            <p className="text-xs text-steel-400 mb-1">{card.label}</p>
            <p className={`font-semibold text-base ${card.highlight ? 'text-brand' : card.muted ? 'text-steel-400' : 'text-steel-800'}`}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Add payment form — hidden for an archived (past) year, read-only there */}
      {archivedYearId ? (
        <section className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-sm text-amber-700">
          Année archivée — lecture seule. Aucun nouveau versement ne peut être enregistré ici.
        </section>
      ) : (
      <section className="bg-white rounded-xl border border-steel-200 p-4 mb-4">
        <h2 className="text-sm font-medium text-steel-700 mb-3">
          Ajouter un versement — <span className="font-normal text-steel-500">{monthLabel}</span>
        </h2>
        <form onSubmit={handlePay} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-steel-500 mb-1">Montant versé *</label>
              <input
                type="number" min="1" required
                value={amount} onChange={e => { setAmount(e.target.value); setError('') }}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand"
                placeholder="Ex: 75 000"
              />
              {expectedAmount > 0 && (
                <p className="text-[10px] text-steel-400 mt-1">Calculé restant : {formatXOF(expectedAmount)}</p>
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-steel-500 mb-1">Remis par</label>
              <input type="text" value={payerName} onChange={e => setPayerName(e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand"
                placeholder="Nom du payeur" />
            </div>
            <div>
              <label className="block text-xs text-steel-500 mb-1">Référence</label>
              <input type="text" value={reference} onChange={e => setReference(e.target.value)}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand"
                placeholder="N° transaction (optionnel)" />
            </div>
          </div>
          {needsReason && (
            <div>
              <label className="block text-xs text-orange-600 mb-1">Motif d'ajustement * <span className="text-steel-400 font-normal">(montant différent du calculé)</span></label>
              <input type="text" value={adjustmentReason} onChange={e => { setAdjustmentReason(e.target.value); setError('') }}
                className="w-full px-3 py-2 border border-orange-300 rounded-lg text-sm focus:outline-none focus:border-orange-500"
                placeholder="Ex: avance, retenue, prime..." />
            </div>
          )}
          <div>
            <label className="block text-xs text-steel-500 mb-1">Notes</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm focus:outline-none focus:border-brand"
              placeholder="Optionnel" />
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 border border-brand text-brand hover:bg-brand-50 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors">
              {saving ? 'Enregistrement...' : 'Enregistrer sans imprimer'}
            </button>
            <button type="button" disabled={saving}
              className="flex-1 py-2.5 bg-brand hover:bg-brand-600 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors"
              onClick={() => submitPay(true)}>
              {saving ? 'Enregistrement...' : 'Enregistrer et imprimer'}
            </button>
          </div>
        </form>
      </section>
      )}

      {/* Last recorded confirmation */}
      {lastReceipt && (
        <section className="bg-brand-50 rounded-xl border border-brand-200 p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-brand">Versement enregistré</p>
              <p className="text-xs text-brand/70">Reçu N° {lastReceipt.receipt_number} — {formatXOF(lastReceipt.amount)}</p>
            </div>
            <button onClick={() => printPayment(lastReceipt.id)}
              className="px-3 py-1.5 bg-brand text-white rounded text-xs font-medium hover:bg-brand-600 transition-colors">
              Imprimer reçu
            </button>
          </div>
        </section>
      )}

      {/* Payment history */}
      {data.payments.length > 0 && (
        <section className="bg-white rounded-xl border border-steel-200 p-4">
          <h2 className="text-sm font-medium text-steel-700 mb-3">
            Versements — {monthLabel}
          </h2>
          <div className="space-y-2">
            {data.payments.map(p => (
              <div key={p.id} className="flex items-center justify-between bg-steel-50 rounded-lg px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-steel-800">{formatXOF(p.amount)}</p>
                  <p className="text-[10px] text-steel-400">
                    {new Date(p.created_at).toLocaleDateString('fr-FR')}
                    {' — '}{p.receipt_number}
                    {p.payer_name ? ` — ${p.payer_name}` : ''}
                    {p.reference ? ` — Réf: ${p.reference}` : ''}
                  </p>
                  {p.adjustment_reason && <p className="text-[10px] text-orange-500">Ajusté : {p.adjustment_reason}</p>}
                  {p.notes && <p className="text-[10px] text-steel-400 italic">{p.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-steel-500 capitalize">{p.payment_method?.replace('_', ' ')}</span>
                  <button onClick={() => printPayment(p.id)}
                    className="text-xs text-brand hover:text-brand-600">
                    Reçu
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.payments.length === 0 && (
        <p className="text-sm text-steel-400 text-center py-6">Aucun versement enregistré pour {monthLabel}</p>
      )}

      {/* Print modal */}
      {printData && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setPrintData(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}>
            <div id="scola-print-content" className="overflow-auto flex-1">
              <SalaryReceipt data={printData} />
            </div>
            <div className="flex gap-2 p-4 border-t border-steel-200 shrink-0">
              <button onClick={() => window.print()}
                className="flex-1 px-3 py-2 bg-brand hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors">
                Imprimer
              </button>
              <button onClick={() => setPrintData(null)}
                className="px-3 py-2 border border-steel-200 text-steel-600 hover:bg-steel-50 rounded-lg text-sm transition-colors">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SalaryReceipt({ data }) {
  const school = data.school || {}
  const p = data.data || {}
  const fmtN = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0)) + ' F CFA'
  const cellH = { padding: '6px 10px', border: '1px solid #ccc', backgroundColor: '#f0f0f0', fontWeight: 'bold', width: '22%', fontSize: 11, whiteSpace: 'nowrap' }
  const cellV = { padding: '6px 10px', border: '1px solid #ccc', fontSize: 12 }

  const monthLabel = p.month
    ? new Date(p.month + '-02').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    : '—'

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
        <p style={{ fontWeight: 'bold', fontSize: 16, letterSpacing: 3, margin: 0, textTransform: 'uppercase' }}>Reçu de Salaire</p>
        <p style={{ fontSize: 13, margin: '6px 0 0' }}>N° <strong style={{ fontSize: 14 }}>{p.receipt_number || '—'}</strong></p>
      </div>

      {/* Info table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
        <tbody>
          <tr>
            <td style={cellH}>Enseignant</td>
            <td style={{ ...cellV, fontWeight: 'bold' }}>{p.teacher_name || '—'}</td>
            <td style={cellH}>Date</td>
            <td style={cellV}>{p.created_at ? new Date(p.created_at).toLocaleDateString('fr-FR') : '—'}</td>
          </tr>
          <tr>
            <td style={cellH}>Matricule</td>
            <td style={cellV}>{p.teacher_matricule || '—'}</td>
            <td style={cellH}>Mois</td>
            <td style={cellV}>{monthLabel}</td>
          </tr>
          <tr>
            <td style={cellH}>Mode</td>
            <td style={cellV}>{p.payment_method?.replace('_', ' ') || '—'}</td>
            <td style={cellH}>Remis par</td>
            <td style={cellV}>{p.payer_name || '—'}</td>
          </tr>
          {p.reference && (
            <tr>
              <td style={cellH}>Référence</td>
              <td style={cellV} colSpan={3}>{p.reference}</td>
            </tr>
          )}
          {p.calculated_amount > 0 && (
            <tr>
              <td style={cellH}>Montant calculé</td>
              <td style={cellV}>{fmtN(p.calculated_amount)}</td>
              <td style={cellH}>Taux horaire</td>
              <td style={cellV}>{p.hourly_rate ? fmtN(p.hourly_rate) + '/h' : '—'}</td>
            </tr>
          )}
          {p.adjustment_reason && (
            <tr>
              <td style={cellH}>Motif ajustement</td>
              <td style={cellV} colSpan={3}>{p.adjustment_reason}</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Amount */}
      <div style={{ border: '2px solid #1a1a1a', borderRadius: 4, padding: '20px 24px', textAlign: 'center', margin: '24px 0' }}>
        <p style={{ fontSize: 12, color: '#555', margin: '0 0 6px' }}>Montant versé</p>
        <p style={{ fontSize: 28, fontWeight: 'bold', margin: 0 }}>{fmtN(p.amount)}</p>
      </div>

      {p.notes && <p style={{ fontSize: 11, color: '#555', marginBottom: 8 }}>Notes : {p.notes}</p>}

      {/* Signatures */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48, fontSize: 12 }}>
        <div style={{ textAlign: 'center', minWidth: 180 }}>
          <p style={{ fontWeight: 'bold', marginBottom: 40 }}>Signature de l'enseignant</p>
          <div style={{ borderTop: '1px solid #000', paddingTop: 4 }}>{p.teacher_name || '________________________'}</div>
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
