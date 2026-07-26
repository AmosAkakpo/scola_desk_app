import { useState, useEffect, useCallback, Fragment } from 'react'
import api from '../../utils/api'
import YearSwitcher from '../../components/YearSwitcher'

function formatXOF(n) {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' F'
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR')
}

// 'YYYY-MM' → 'Septembre 2025'
function monthLabel(m) {
  const [y, mo] = m.split('-').map(Number)
  const label = new Date(y, mo - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// Itemized entrant/sortant lines for one month, as a single table:
// Type - Catégorie - Description - Montant. Rendered whenever the month
// is expanded on screen, or unconditionally while printing (owner request
// 2026-07-26: printing shows the full breakdown by default, not just
// whatever was expanded).
function MonthLines({ lines }) {
  if (lines.length === 0) {
    return <p className="text-xs text-steel-400 px-4 py-3">Aucun mouvement ce mois</p>
  }
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-steel-200">
          <th className="text-left px-4 py-1.5 text-steel-400 font-medium">Type</th>
          <th className="text-left px-4 py-1.5 text-steel-400 font-medium">Catégorie</th>
          <th className="text-left px-4 py-1.5 text-steel-400 font-medium">Description</th>
          <th className="text-left px-4 py-1.5 text-steel-400 font-medium">Date</th>
          <th className="text-right px-4 py-1.5 text-steel-400 font-medium">Montant</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => (
          <tr key={i} className="border-b border-steel-100 last:border-0">
            <td className={`px-4 py-1.5 font-medium ${l.flow === 'entrant' ? 'text-brand' : 'text-red-500'}`}>{l.flow === 'entrant' ? 'Entrant' : 'Sortant'}</td>
            <td className="px-4 py-1.5 text-steel-700">{l.category}</td>
            <td className="px-4 py-1.5 text-steel-600">{l.description || '—'}</td>
            <td className="px-4 py-1.5 text-steel-500">{formatDate(l.date)}</td>
            <td className="px-4 py-1.5 text-right text-steel-800 font-medium">{formatXOF(l.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function FinanceReportPage() {
  const [months, setMonths] = useState(null) // [{ month, entrant, sortant }]
  const [lines, setLines] = useState([])      // flat itemized lines, whole year
  const [yearLabel, setYearLabel] = useState('')
  const [school, setSchool] = useState(null)
  const [loading, setLoading] = useState(true)
  const [printing, setPrinting] = useState(false)
  const [yearId, setYearId] = useState(null) // null = current year
  const [expanded, setExpanded] = useState({}) // month -> true

  const load = useCallback(() => {
    setLoading(true)
    setExpanded({})
    const params = yearId ? { academic_year_id: yearId } : {}
    Promise.all([
      api.get('/api/finance/report', { params }),
      api.get('/api/finance/report/lines', { params }),
    ]).then(([reportRes, linesRes]) => {
      const monthly = (reportRes.data.months || []).map(m => ({
        month: m.month,
        entrant: m.tuition + m.other,
        sortant: m.expenses + m.salaries,
      }))
      setMonths(monthly)
      setLines(linesRes.data.lines || [])
      setYearLabel(reportRes.data.year_label || '')
      setSchool(reportRes.data.school || null)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [yearId])

  useEffect(() => { load() }, [load])

  function toggleMonth(month) {
    setExpanded(prev => {
      const next = { ...prev }
      if (next[month]) delete next[month]
      else next[month] = true
      return next
    })
  }

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
  if (!months) return <p className="text-steel-400 text-sm text-center py-12">Erreur de chargement</p>

  const linesByMonth = {}
  for (const l of lines) (linesByMonth[l.month] ||= []).push(l)

  const grandEntrant = months.reduce((s, m) => s + m.entrant, 0)
  const grandSortant = months.reduce((s, m) => s + m.sortant, 0)
  const restant = grandEntrant - grandSortant

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-steel-900">Rapport financier</h1>
          <p className="text-sm text-steel-500 mt-0.5">Vue mensuelle des flux — Année {yearLabel || '—'}</p>
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
            <p style={{ fontWeight: 'bold', fontSize: 14, letterSpacing: 2, margin: '12px 0 0', textTransform: 'uppercase' }}>Rapport financier — {yearLabel}</p>
            <p style={{ fontSize: 10, color: '#888', margin: '4px 0 0' }}>Édité le {new Date().toLocaleDateString('fr-FR')}</p>
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-steel-200 bg-steel-50">
              <th className="text-left px-4 py-2.5 text-steel-500 font-medium">Mois</th>
              <th className="text-right px-4 py-2.5 text-brand font-semibold">Total entrant</th>
              <th className="text-right px-4 py-2.5 text-red-500 font-semibold">Total sortant</th>
            </tr>
          </thead>
          <tbody>
            {months.map(m => {
              const isOpen = !!expanded[m.month] || printing
              const monthLines = linesByMonth[m.month] || []
              return (
                <Fragment key={m.month}>
                  <tr className="border-b border-steel-50 hover:bg-steel-50/60 cursor-pointer print:hover:bg-transparent" onClick={() => toggleMonth(m.month)}>
                    <td className="px-4 py-2.5 text-steel-800 font-medium flex items-center gap-1.5">
                      <svg className={`w-3 h-3 text-steel-400 transition-transform print:hidden ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      {monthLabel(m.month)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-steel-700">{m.entrant > 0 ? formatXOF(m.entrant) : '—'}</td>
                    <td className="px-4 py-2.5 text-right text-red-600">{m.sortant > 0 ? formatXOF(m.sortant) : '—'}</td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-steel-100 bg-steel-50/30">
                      <td colSpan={3} className="p-0">
                        <MonthLines lines={monthLines} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {months.length === 0 && (
              <tr><td colSpan="3" className="px-4 py-8 text-center text-steel-400 text-sm">Aucune donnée financière pour cette année</td></tr>
            )}
          </tbody>
          {months.length > 0 && (
            <tfoot>
              <tr className="bg-steel-50 border-t-2 border-steel-300 font-semibold">
                <td className="px-4 py-3 text-steel-900">TOTAL</td>
                <td className="px-4 py-3 text-right text-brand">{formatXOF(grandEntrant)}</td>
                <td className="px-4 py-3 text-right text-red-600">{formatXOF(grandSortant)}</td>
              </tr>
              <tr className="bg-steel-100 font-bold">
                <td className="px-4 py-3 text-steel-900">RESTANT</td>
                <td colSpan={2} className={`px-4 py-3 text-right ${restant >= 0 ? 'text-brand' : 'text-red-600'}`}>{formatXOF(restant)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
