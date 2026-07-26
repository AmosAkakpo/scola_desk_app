import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import api from '../../utils/api'

function formatXOF(n) {
  return new Intl.NumberFormat('fr-FR').format(Math.round(n || 0)) + ' F'
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Simple expected-cost view: effectif × tarif. No payment state shown —
// schools are offline most of the year, so any "déjà versé" figure from the
// activation snapshot would be stale and misleading. Remittance is continuous
// ("reversez au fur et à mesure des encaissements"), reconciled at year-end.
function SubscriptionTable({ title, subtitle, studentCount, rate }) {
  const total = studentCount * rate

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
              <td className="py-3 text-steel-600">Tarif par élève / an</td>
              <td className="py-3 text-right text-steel-800">{formatXOF(rate)}</td>
            </tr>
            <tr>
              <td className="py-3 text-steel-600 font-medium">Coût total annuel</td>
              <td className="py-3 text-right font-bold text-steel-900 text-base">{formatXOF(total)}</td>
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
  const location = useLocation()
  const deniedFrom = location.state?.deniedFrom
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
  const diff = data.actual_student_count - data.declared_student_count

  return (
    <div>
      {deniedFrom && (
        <div className="mb-4 px-4 py-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-700">
          Vous n'avez pas accès à cette page. Contactez l'administrateur si vous pensez que c'est une erreur.
        </div>
      )}
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
        {diff !== 0 && (
          <div>
            <p className="text-[10px] text-steel-400 uppercase tracking-wide">Écart d'effectif</p>
            <p className={`text-sm font-semibold ${diff > 0 ? 'text-orange-600' : 'text-brand'}`}>
              {diff > 0 ? '+' : ''}{diff} élève(s) vs déclaré
            </p>
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
        />
        <SubscriptionTable
          title="Effectif actuel"
          subtitle="Nombre d'élèves actuellement inscrits dans le système"
          studentCount={data.actual_student_count}
          rate={data.rate_per_student}
        />
      </div>

      <div className="mt-6 bg-steel-50 rounded-xl border border-steel-200 p-4">
        <p className="text-xs text-steel-500">
          Les frais de gestion sont à reverser à ScolaDesk au fur et à mesure des encaissements de scolarité —
          regroupez les montants collectés et transmettez-les régulièrement.
          Le décompte final est établi lors de la synchronisation de fin d'année :
          montant dû = MAX(effectif réel, effectif payé) × tarif par élève.
        </p>
        <p className="text-xs text-steel-500 mt-2">
          Astuce : enregistrez chaque versement à ScolaDesk dans <strong>Dépenses</strong> sous la catégorie
          « Abonnement ScolaDesk » pour suivre localement ce que vous avez déjà réglé.
        </p>
        <p className="text-xs text-steel-500 mt-2">
          Pour toute question sur votre abonnement, un renouvellement ou une régularisation,
          contactez votre représentant ScolaDesk.
        </p>
      </div>
    </div>
  )
}
