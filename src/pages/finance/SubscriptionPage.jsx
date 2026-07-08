import { useState, useEffect } from 'react'
import api from '../../utils/api'

function formatXOF(n) {
  return new Intl.NumberFormat('fr-FR').format(Math.round(n || 0)) + ' F'
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function SubscriptionTable({ title, subtitle, studentCount, rate, firstDeadline }) {
  const total = studentCount * rate
  const seventyFive = Math.round(total * 0.75)
  const remaining = total - seventyFive

  return (
    <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-steel-200 bg-steel-50">
        <h2 className="text-sm font-semibold text-steel-800">{title}</h2>
        <p className="text-xs text-steel-500 mt-0.5">{subtitle}</p>
      </div>
      <div className="p-5">
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-steel-100">
              <td className="py-3 text-steel-600">Nombre d'élèves</td>
              <td className="py-3 text-right font-semibold text-steel-800">{studentCount.toLocaleString('fr-FR')}</td>
            </tr>
            <tr className="border-b border-steel-100">
              <td className="py-3 text-steel-600">Frais système informatique</td>
              <td className="py-3 text-right text-steel-800">
                {studentCount.toLocaleString('fr-FR')} × {formatXOF(rate)}
                <span className="block text-sm font-semibold text-steel-900 mt-0.5">= {formatXOF(total)}</span>
              </td>
            </tr>
            <tr className="border-b border-steel-100">
              <td className="py-3 text-steel-600">
                75% à payer avant la 1ère échéance
                {firstDeadline && (
                  <span className="block text-xs text-steel-400 mt-0.5">{formatDate(firstDeadline)}</span>
                )}
              </td>
              <td className="py-3 text-right font-semibold text-orange-600">{formatXOF(seventyFive)}</td>
            </tr>
            <tr>
              <td className="py-3 text-steel-600">Restant à payer avant renouvellement</td>
              <td className="py-3 text-right font-semibold text-steel-800">{formatXOF(remaining)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function SubscriptionPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.get('/api/finance/subscription').then(res => {
      setData(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
  if (!data) return <p className="text-steel-400 text-sm text-center py-12">Erreur de chargement</p>

  // license_state stores 'PRO'/'STANDARD' uppercase — compare case-insensitively
  const tierLabel = (data.tier || '').toUpperCase() === 'PRO' ? 'PRO' : 'STANDARD'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-steel-900">Mon abonnement</h1>
          <p className="text-sm text-steel-500 mt-0.5">Licence ScolaDesk — {tierLabel}</p>
        </div>
      </div>

      {/* License info bar */}
      <div className="bg-white rounded-xl border border-steel-200 p-4 mb-6 flex flex-wrap items-center gap-6">
        <div>
          <p className="text-[10px] text-steel-400 uppercase tracking-wide">Plan</p>
          <p className="text-sm font-semibold text-steel-800">{tierLabel}</p>
        </div>
        <div>
          <p className="text-[10px] text-steel-400 uppercase tracking-wide">Tarif / élève / an</p>
          <p className="text-sm font-semibold text-steel-800">{formatXOF(data.rate_per_student)}</p>
        </div>
        <div>
          <p className="text-[10px] text-steel-400 uppercase tracking-wide">Expiration</p>
          <p className="text-sm font-semibold text-steel-800">{formatDate(data.expiry_date)}</p>
        </div>
        {data.amount_paid > 0 && (
          <div>
            <p className="text-[10px] text-steel-400 uppercase tracking-wide">Déjà payé</p>
            <p className="text-sm font-semibold text-brand">{formatXOF(data.amount_paid)}</p>
          </div>
        )}
      </div>

      {/* Two tables side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SubscriptionTable
          title="Effectif déclaré"
          subtitle="Nombre d'élèves déclaré lors de l'activation"
          studentCount={data.declared_student_count}
          rate={data.rate_per_student}
          firstDeadline={data.first_deadline}
        />
        <SubscriptionTable
          title="Effectif actuel"
          subtitle="Nombre d'élèves actuellement inscrits dans le système"
          studentCount={data.actual_student_count}
          rate={data.rate_per_student}
          firstDeadline={data.first_deadline}
        />
      </div>

      {/* Règlement — paid vs remaining (floor rule: MAX(actual, paid count) × rate) */}
      <div className="mt-6 bg-white rounded-xl border border-steel-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-steel-200 bg-steel-50">
          <h2 className="text-sm font-semibold text-steel-800">Règlement</h2>
          <p className="text-xs text-steel-500 mt-0.5">Situation des paiements de l'abonnement</p>
        </div>
        <div className="p-5">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-steel-100">
                <td className="py-3 text-steel-600">Montant déjà versé</td>
                <td className="py-3 text-right font-semibold text-brand">{formatXOF(data.amount_paid)}</td>
              </tr>
              <tr className="border-b border-steel-100">
                <td className="py-3 text-steel-600">
                  Reste à régulariser <span className="text-xs text-steel-400">(indicatif)</span>
                  <span className="block text-xs text-steel-400 mt-0.5">
                    MAX(effectif réel, effectif payé) × tarif − déjà versé
                  </span>
                </td>
                <td className="py-3 text-right font-semibold">
                  {(() => {
                    const owed = Math.max(data.actual_student_count, data.paid_student_count || 0) * data.rate_per_student
                    const remaining = Math.max(0, owed - (data.amount_paid || 0))
                    return <span className={remaining > 0 ? 'text-orange-600' : 'text-brand'}>{formatXOF(remaining)}</span>
                  })()}
                </td>
              </tr>
              {data.installation_fee > 0 && (
                <tr>
                  <td className="py-3 text-steel-600">Frais d'installation</td>
                  <td className="py-3 text-right">
                    <span className="font-semibold text-steel-800">{formatXOF(data.installation_fee)}</span>
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-medium ${data.installation_fee_paid ? 'bg-brand-50 text-brand-600' : 'bg-red-50 text-red-600'}`}>
                      {data.installation_fee_paid ? 'Payé' : 'Non payé'}
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 bg-steel-50 rounded-xl border border-steel-200 p-4">
        <p className="text-xs text-steel-500">
          Ces informations sont indicatives. Le montant final sera calculé lors de la synchronisation de fin d'année
          en prenant en compte l'effectif réel et les paiements déjà effectués.
          Règle : le montant dû = MAX(effectif réel, effectif payé) × tarif par élève.
        </p>
        <p className="text-xs text-steel-500 mt-2">
          Pour toute question sur votre abonnement, un renouvellement ou une régularisation,
          contactez votre représentant ScolaDesk.
        </p>
      </div>
    </div>
  )
}
