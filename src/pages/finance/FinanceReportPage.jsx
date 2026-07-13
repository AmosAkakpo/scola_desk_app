import { useState, useEffect, useCallback } from 'react'
import api from '../../utils/api'
import YearSwitcher from '../../components/YearSwitcher'

function formatXOF(n) {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' F'
}

// 'YYYY-MM' → 'Septembre 2025'
function monthLabel(m) {
  const [y, mo] = m.split('-').map(Number)
  const label = new Date(y, mo - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export default function FinanceReportPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [printing, setPrinting] = useState(false)
  const [yearId, setYearId] = useState(null) // null = current year

  const load = useCallback(() => {
    setLoading(true)
    api.get('/api/finance/report', { params: yearId ? { academic_year_id: yearId } : {} }).then(res => {
      setData(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [yearId])

  useEffect(() => { load() }, [load])

  // Print only the report block (same pattern as receipt pages)
  useEffect(() => {
    if (!printing) return
    const style = document.createElement('style')
    style.id = 'scola-print-style'
    style.textContent = '@media print { @page { size: A4 portrait; margin: 0; } body * { visibility: hidden !important; } #scola-print-content { visibility: visible !important; position: fixed !important; top: 0; left: 0; width: 100%; overflow: visible; } #scola-print-content * { visibility: visible !important; } }'
    document.head.appendChild(style)
    window.print()
    const cleanup = () => { document.getElementById('scola-print-style')?.remove(); setPrinting(false) }
    // afterprint may not fire in all webviews — also cleanup on next tick focus
    window.addEventListener('afterprint', cleanup, { once: true })
    return () => { document.getElementById('scola-print-style')?.remove() }
  }, [printing])

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
  if (!data) return <p className="text-steel-400 text-sm text-center py-12">Erreur de chargement</p>

  const { months, totals, year_label, school } = data

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-steel-900">Rapport financier</h1>
          <p className="text-sm text-steel-500 mt-0.5">Vue mensuelle des flux — Année {year_label || '—'}</p>
        </div>
        <div className="flex items-center gap-3">
          <YearSwitcher yearId={yearId} onChange={setYearId} />
          <button onClick={() => setPrinting(true)}
            className="px-4 py-2 bg-brand hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
            Imprimer
          </button>
        </div>
      </div>

      <div id="scola-print-content" className="bg-white rounded-xl border border-steel-200 overflow-hidden" style={printing ? { padding: '12mm 16mm', fontFamily: 'Arial, sans-serif' } : {}}>
        {/* Print-only header */}
        {printing && (
          <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: 10, marginBottom: 16 }}>
            <p style={{ fontWeight: 'bold', fontSize: 18, margin: '0 0 3px' }}>{school?.school_name || 'Établissement scolaire'}</p>
            {(school?.city || school?.country) && (
              <p style={{ fontSize: 11, margin: 0, color: '#555' }}>{[school.city, school.country].filter(Boolean).join(' — ')}</p>
            )}
            <p style={{ fontWeight: 'bold', fontSize: 14, letterSpacing: 2, margin: '12px 0 0', textTransform: 'uppercase' }}>Rapport financier — {year_label}</p>
            <p style={{ fontSize: 10, color: '#888', margin: '4px 0 0' }}>Édité le {new Date().toLocaleDateString('fr-FR')}</p>
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-steel-200 bg-steel-50">
              <th className="text-left px-4 py-2.5 text-steel-500 font-medium">Mois</th>
              <th className="text-right px-4 py-2.5 text-steel-500 font-medium">Scolarité</th>
              <th className="text-right px-4 py-2.5 text-steel-500 font-medium">Revenus divers</th>
              <th className="text-right px-4 py-2.5 text-steel-500 font-medium">Dépenses</th>
              <th className="text-right px-4 py-2.5 text-steel-500 font-medium">Salaires</th>
              <th className="text-right px-4 py-2.5 text-steel-500 font-medium">Solde</th>
            </tr>
          </thead>
          <tbody>
            {months.map(m => (
              <tr key={m.month} className="border-b border-steel-50">
                <td className="px-4 py-2.5 text-steel-800 font-medium">{monthLabel(m.month)}</td>
                <td className="px-4 py-2.5 text-right text-steel-700">{m.tuition > 0 ? formatXOF(m.tuition) : '—'}</td>
                <td className="px-4 py-2.5 text-right text-steel-700">{m.other > 0 ? formatXOF(m.other) : '—'}</td>
                <td className="px-4 py-2.5 text-right text-red-600">{m.expenses > 0 ? formatXOF(m.expenses) : '—'}</td>
                <td className="px-4 py-2.5 text-right text-red-600">{m.salaries > 0 ? formatXOF(m.salaries) : '—'}</td>
                <td className={`px-4 py-2.5 text-right font-semibold ${m.solde >= 0 ? 'text-brand' : 'text-red-600'}`}>{formatXOF(m.solde)}</td>
              </tr>
            ))}
            {months.length === 0 && (
              <tr><td colSpan="6" className="px-4 py-8 text-center text-steel-400 text-sm">Aucune donnée financière pour cette année</td></tr>
            )}
          </tbody>
          {months.length > 0 && (
            <tfoot>
              <tr className="bg-steel-50 border-t-2 border-steel-300 font-semibold">
                <td className="px-4 py-3 text-steel-900">TOTAL</td>
                <td className="px-4 py-3 text-right text-steel-900">{formatXOF(totals.tuition)}</td>
                <td className="px-4 py-3 text-right text-steel-900">{formatXOF(totals.other)}</td>
                <td className="px-4 py-3 text-right text-red-600">{formatXOF(totals.expenses)}</td>
                <td className="px-4 py-3 text-right text-red-600">{formatXOF(totals.salaries)}</td>
                <td className={`px-4 py-3 text-right ${totals.solde >= 0 ? 'text-brand' : 'text-red-600'}`}>{formatXOF(totals.solde)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
