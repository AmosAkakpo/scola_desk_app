import { useState, useEffect, useCallback, Fragment } from 'react'
import api from '../../utils/api'
import YearSwitcher from '../../components/YearSwitcher'

function formatXOF(n) {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' F'
}

// PDF-only formatter -- Intl.NumberFormat('fr-FR') inserts a "narrow
// no-break space" (U+202F) between digit groups, which jsPDF's built-in
// font has no glyph for and rendered as a stray "/" (owner report
// 2026-08-10, same bug as UnpaidReportPage.jsx). A plain ASCII space
// sidesteps the font entirely.
function formatXOFPdf(n) {
  if (n === null || n === undefined) return '-'
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' F'
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
  const [generating, setGenerating] = useState(false)
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

  const linesByMonth = {}
  for (const l of lines) (linesByMonth[l.month] ||= []).push(l)

  const grandEntrant = (months || []).reduce((s, m) => s + m.entrant, 0)
  const grandSortant = (months || []).reduce((s, m) => s + m.sortant, 0)
  const restant = grandEntrant - grandSortant

  // Built directly with jsPDF instead of window.print()/print-to-PDF --
  // that route was corrupting the output on this Electron/Chromium build
  // ("Failed to load PDF document", owner report 2026-08-09). Same
  // approach as UnpaidReportPage.jsx: draw text/lines directly, track a y
  // cursor, addPage() manually. Every month's full breakdown is always
  // included, not just whatever was expanded on screen (owner request
  // 2026-07-26).
  async function downloadPdf() {
    if (!months) return
    setGenerating(true)
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const W = 210
      const H = 297
      const MARGIN = 18
      const BOTTOM = H - 18
      const printedAt = new Date()

      function drawDocHeader() {
        doc.setFontSize(16)
        doc.setFont(undefined, 'bold')
        doc.setTextColor(0)
        doc.text(school?.school_name || 'Établissement scolaire', W / 2, 20, { align: 'center' })
        if (school?.city || school?.country) {
          doc.setFontSize(10)
          doc.setFont(undefined, 'normal')
          doc.setTextColor(100)
          doc.text([school.city, school.country].filter(Boolean).join(' — '), W / 2, 26, { align: 'center' })
        }
        doc.setFontSize(12)
        doc.setFont(undefined, 'bold')
        doc.setTextColor(0)
        doc.text(`RAPPORT FINANCIER — ${yearLabel || ''}`, W / 2, 33, { align: 'center' })
        doc.setFontSize(8.5)
        doc.setFont(undefined, 'normal')
        doc.setTextColor(130)
        doc.text(`Édité le ${printedAt.toLocaleDateString('fr-FR')}`, W / 2, 38, { align: 'center' })
        doc.setTextColor(0)
        doc.setDrawColor(0)
        doc.line(MARGIN, 41, W - MARGIN, 41)
      }

      drawDocHeader()
      let y = 49

      function ensureSpace(needed) {
        if (y + needed > BOTTOM) {
          doc.addPage()
          y = MARGIN
        }
      }

      months.forEach(m => {
        ensureSpace(16)
        doc.setFontSize(11)
        doc.setFont(undefined, 'bold')
        doc.setTextColor(0)
        doc.text(monthLabel(m.month), MARGIN, y)
        doc.setFontSize(9.5)
        doc.text(m.entrant > 0 ? formatXOFPdf(m.entrant) : '-', W - MARGIN - 30, y, { align: 'right' })
        doc.setTextColor(5, 150, 105)
        doc.text('Entrant:', W - MARGIN - 55, y, { align: 'left' })
        doc.setTextColor(0)
        doc.text(m.sortant > 0 ? formatXOFPdf(m.sortant) : '-', W - MARGIN, y, { align: 'right' })
        doc.setTextColor(220, 38, 38)
        doc.text('Sortant:', W - MARGIN - 30 - 22, y, { align: 'left' })
        doc.setTextColor(0)
        y += 5

        const monthLines = linesByMonth[m.month] || []
        if (monthLines.length === 0) {
          doc.setFontSize(8)
          doc.setFont(undefined, 'italic')
          doc.setTextColor(150)
          doc.text('Aucun mouvement ce mois', MARGIN + 2, y)
          doc.setTextColor(0)
          y += 6
        } else {
          doc.setFontSize(8)
          doc.setFont(undefined, 'bold')
          doc.setTextColor(120)
          doc.text('Type', MARGIN + 2, y)
          doc.text('Catégorie', MARGIN + 22, y)
          doc.text('Description', MARGIN + 62, y)
          doc.text('Date', MARGIN + 122, y)
          doc.text('Montant', W - MARGIN, y, { align: 'right' })
          doc.setTextColor(0)
          y += 4.5
          doc.setFont(undefined, 'normal')
          monthLines.forEach(l => {
            ensureSpace(4.5)
            doc.setTextColor(...(l.flow === 'entrant' ? [5, 150, 105] : [220, 38, 38]))
            doc.text(l.flow === 'entrant' ? 'Entrant' : 'Sortant', MARGIN + 2, y)
            doc.setTextColor(0)
            doc.text(String(l.category || ''), MARGIN + 22, y)
            doc.text(String(l.description || '—').slice(0, 32), MARGIN + 62, y)
            doc.text(formatDate(l.date), MARGIN + 122, y)
            doc.text(formatXOFPdf(l.amount), W - MARGIN, y, { align: 'right' })
            y += 4.5
          })
        }
        y += 4
      })

      ensureSpace(20)
      doc.setDrawColor(0)
      doc.line(MARGIN, y, W - MARGIN, y)
      y += 6
      doc.setFontSize(10)
      doc.setFont(undefined, 'bold')
      doc.text('TOTAL', MARGIN, y)
      doc.setTextColor(5, 150, 105)
      doc.text(formatXOFPdf(grandEntrant), W - MARGIN - 30, y, { align: 'right' })
      doc.setTextColor(220, 38, 38)
      doc.text(formatXOFPdf(grandSortant), W - MARGIN, y, { align: 'right' })
      doc.setTextColor(0)
      y += 7
      doc.setFontSize(11)
      doc.text('RESTANT', MARGIN, y)
      doc.setTextColor(...(restant >= 0 ? [5, 150, 105] : [220, 38, 38]))
      doc.text(formatXOFPdf(restant), W - MARGIN, y, { align: 'right' })
      doc.setTextColor(0)

      const yearSlug = (yearLabel || 'annee').replace(/[^a-z0-9]/gi, '_')
      doc.save(`Rapport_financier_${yearSlug}.pdf`)
    } catch (err) {
      console.error('PDF generation error', err)
    }
    setGenerating(false)
  }

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
  if (!months) return <p className="text-steel-400 text-sm text-center py-12">Erreur de chargement</p>

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-steel-900">Rapport financier</h1>
          <p className="text-sm text-steel-500 mt-0.5">Vue mensuelle des flux — Année {yearLabel || '—'}</p>
        </div>
        <div className="flex items-center gap-3">
          <YearSwitcher yearId={yearId} onChange={setYearId} />
          <button onClick={downloadPdf} disabled={generating}
            className="px-4 py-2 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>
            {generating ? 'Génération...' : 'Télécharger PDF'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-steel-200 overflow-hidden">
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
              const isOpen = !!expanded[m.month]
              const monthLines = linesByMonth[m.month] || []
              return (
                <Fragment key={m.month}>
                  <tr className="border-b border-steel-50 hover:bg-steel-50/60 cursor-pointer" onClick={() => toggleMonth(m.month)}>
                    <td className="px-4 py-2.5 text-steel-800 font-medium flex items-center gap-1.5">
                      <svg className={`w-3 h-3 text-steel-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
