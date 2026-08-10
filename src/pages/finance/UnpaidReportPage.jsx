import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../utils/api'

function formatXOF(n) {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' F'
}

// PDF-only formatter -- Intl.NumberFormat('fr-FR') inserts a "narrow
// no-break space" (U+202F) between digit groups, which jsPDF's built-in
// font has no glyph for and rendered as a stray "/" (owner report
// 2026-08-10). A plain ASCII space sidesteps the font entirely.
function formatXOFPdf(n) {
  if (n === null || n === undefined) return '-'
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' F'
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR')
}

const STATUS_LABELS = { paid: 'Soldé', partial: 'Partiel', unpaid: 'Impayé' }
const STATUS_COLORS = { paid: [5, 150, 105], partial: [217, 119, 6], unpaid: [220, 38, 38] }

export default function UnpaidReportPage() {
  const navigate = useNavigate()
  const [classrooms, setClassrooms] = useState([])
  const [selected, setSelected] = useState([])
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    api.get('/api/finance/tuition?limit=1').then(res => setClassrooms(res.data.classrooms || []))
  }, [])

  function toggle(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function generate() {
    setLoading(true)
    const params = selected.length ? { classroom_ids: selected.join(',') } : {}
    api.get('/api/finance/tuition-report', { params }).then(res => {
      setReport(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  // Built directly with jsPDF instead of window.print()/print-to-PDF --
  // that route was corrupting the output on this Electron/Chromium build
  // ("Failed to load PDF document", owner report 2026-08-09, still
  // failing after two attempts at fixing the print CSS). Same proven
  // approach already used for the timetable and student-summary PDFs
  // elsewhere in the app: draw text/lines directly, track a y cursor, and
  // call doc.addPage() manually when a section would overflow.
  async function downloadPdf() {
    if (!report) return
    setGenerating(true)
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const W = 210
      const H = 297
      const MARGIN = 18
      const BOTTOM = H - 18
      const printedAt = new Date()

      let logoDataUrl = null
      try {
        const logoRes = await api.get('/api/settings/school-logo', { responseType: 'blob' })
        logoDataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result)
          reader.onerror = reject
          reader.readAsDataURL(logoRes.data)
        })
      } catch { /* no logo configured */ }

      // Header -- once, at the very top of the whole document, not
      // repeated per classroom (owner report 2026-08-09).
      const boxSize = 18
      if (logoDataUrl) {
        doc.addImage(logoDataUrl, 'PNG', MARGIN, 14, boxSize, boxSize)
      }
      doc.setFontSize(9)
      doc.setFont(undefined, 'bold')
      doc.text('RÉPUBLIQUE DU BÉNIN', W / 2, 16, { align: 'center' })
      doc.setFontSize(14)
      doc.text(report.school?.school_name || 'Établissement scolaire', W / 2, 23, { align: 'center' })
      doc.setFontSize(11)
      doc.text('ÉTAT FINANCIER — LISTE DES IMPAYÉS', W / 2, 30, { align: 'center' })
      doc.setFontSize(9)
      doc.setFont(undefined, 'normal')
      doc.text(`Année scolaire ${report.year_label || '—'} — Édité le ${printedAt.toLocaleDateString('fr-FR')}`, W / 2, 36, { align: 'center' })
      doc.setDrawColor(0)
      doc.line(MARGIN, 40, W - MARGIN, 40)

      let y = 48

      // Explicit right edge per column (not just a start x) so adjacent
      // columns never touch -- right-aligned text ending exactly where
      // the next label started was rendering as one merged word (owner
      // report 2026-08-10, e.g. "RestDern. paiement"). 2mm gutter built
      // into each boundary below.
      const cols = [
        { key: 'full_name', label: 'Nom', x: MARGIN, right: 60, align: 'left' },
        { key: 'matricule', label: 'Matricule', x: 62, right: 90, align: 'left' },
        { key: 'total_paid', label: 'Payé', x: 92, right: 116, align: 'right' },
        { key: 'remaining', label: 'Reste', x: 118, right: 142, align: 'right' },
        { key: 'last_payment_date', label: 'Dern. paiement', x: 144, right: 170, align: 'left' },
        { key: 'status', label: 'Statut', x: 172, right: 192, align: 'left' },
      ]
      const rowH = 6.5

      function drawTableHeader() {
        doc.setFillColor(240, 240, 240)
        doc.rect(MARGIN, y - 4.5, W - 2 * MARGIN, 6.5, 'F')
        doc.setFontSize(8.5)
        doc.setFont(undefined, 'bold')
        doc.setTextColor(80)
        cols.forEach(c => doc.text(c.label, c.align === 'right' ? c.right : c.x, y, { align: c.align }))
        doc.setTextColor(0)
        y += rowH
      }

      // needed: how much vertical space the next thing takes. header: if
      // true, redraws the column header row right after a page break so a
      // classroom continuing onto a new page is still readable.
      function ensureSpace(needed, header) {
        if (y + needed > BOTTOM) {
          doc.addPage()
          y = MARGIN
          if (header) drawTableHeader()
          return true
        }
        return false
      }

      if (!report.classrooms || report.classrooms.length === 0) {
        doc.setFontSize(10)
        doc.text('Aucune classe trouvée pour cette sélection.', W / 2, y, { align: 'center' })
      }

      report.classrooms.forEach((c, idx) => {
        // Classes flow one after another, not one per page (owner
        // request 2026-08-10) -- only a real page break when content
        // actually runs out of room.
        ensureSpace(idx === 0 ? 0 : 14)
        if (idx > 0) y += 6

        doc.setFontSize(12)
        doc.setFont(undefined, 'bold')
        doc.setTextColor(0)
        doc.text(c.classroom_label, MARGIN, y)
        y += 6

        doc.setFontSize(8.5)
        doc.setFont(undefined, 'normal')
        doc.setTextColor(100)
        const summary = [
          `${c.summary.total_students} élève(s)`,
          `Total du ${formatXOFPdf(c.summary.total_due)}`,
          `Paye ${formatXOFPdf(c.summary.total_paid)}`,
          `Reste ${formatXOFPdf(c.summary.total_remaining)}`,
          `${c.summary.count_owing} en retard`,
        ].join('  -  ')
        const summaryLines = doc.splitTextToSize(summary, W - 2 * MARGIN)
        doc.text(summaryLines, MARGIN, y)
        doc.setTextColor(0)
        y += summaryLines.length * 4 + 2

        drawTableHeader()

        c.students.forEach((s, i) => {
          ensureSpace(rowH, true)
          if (i % 2 === 1) {
            doc.setFillColor(250, 250, 250)
            doc.rect(MARGIN, y - 4.5, W - 2 * MARGIN, rowH, 'F')
          }
          doc.setFontSize(8.5)
          doc.setFont(undefined, 'normal')
          doc.setTextColor(0)
          doc.text(s.full_name, cols[0].x, y)
          doc.text(s.matricule || '-', cols[1].x, y)
          doc.text(formatXOFPdf(s.total_paid), cols[2].right, y, { align: 'right' })
          const remCol = STATUS_COLORS[s.remaining > 0 ? 'unpaid' : 'paid']
          doc.setTextColor(...remCol)
          doc.text(formatXOFPdf(s.remaining), cols[3].right, y, { align: 'right' })
          doc.setTextColor(0)
          doc.text(formatDate(s.last_payment_date), cols[4].x, y)
          doc.setTextColor(...(STATUS_COLORS[s.status] || [0, 0, 0]))
          doc.text(STATUS_LABELS[s.status] || s.status, cols[5].x, y)
          doc.setTextColor(0)
          y += rowH
        })
      })

      const yearSlug = (report.year_label || 'annee').replace(/[^a-z0-9]/gi, '_')
      doc.save(`Etat_financier_impayes_${yearSlug}.pdf`)
    } catch (err) {
      console.error('PDF generation error', err)
    }
    setGenerating(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-steel-900">État financier — Liste des impayés</h1>
          <p className="text-sm text-steel-500 mt-0.5">Sélectionnez une ou plusieurs classes, puis générez le rapport.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/finance/tuition')} className="text-sm text-steel-500 hover:text-steel-700">Retour</button>
          {report && (
            <button onClick={downloadPdf} disabled={generating}
              className="px-4 py-2 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>
              {generating ? 'Génération...' : 'Télécharger PDF'}
            </button>
          )}
        </div>
      </div>

      {/* Classroom picker */}
      <div className="bg-white rounded-xl border border-steel-200 p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-steel-700">Classes</p>
          <button onClick={() => setSelected(selected.length === classrooms.length ? [] : classrooms.map(c => c.id))}
            className="text-xs text-brand hover:text-brand-600 font-medium">
            {selected.length === classrooms.length ? 'Tout désélectionner' : 'Toutes les classes'}
          </button>
        </div>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {classrooms.map(c => (
            <label key={c.id} className="flex items-center gap-2 px-3 py-2 border border-steel-200 rounded-lg text-sm hover:bg-steel-50 cursor-pointer">
              <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)}
                className="rounded border-steel-300 text-brand focus:ring-brand" />
              <span className="text-steel-700">{c.label}</span>
            </label>
          ))}
        </div>
        <button onClick={generate} disabled={loading}
          className="px-4 py-2 bg-brand hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
          {loading ? 'Génération...' : 'Générer le rapport'}
        </button>
        <span className="text-xs text-steel-400 ml-3">
          {selected.length === 0 ? 'Aucune sélection = toutes les classes' : `${selected.length} classe(s) sélectionnée(s)`}
        </span>
      </div>

      {/* On-screen preview */}
      {report && (
        <div className="bg-white rounded-xl border border-steel-200 p-5">
          {report.classrooms.length === 0 && (
            <p className="text-steel-400 text-sm text-center py-8">Aucune classe trouvée pour cette sélection.</p>
          )}
          {report.classrooms.map(c => (
            <div key={c.classroom_id} className="mb-8 last:mb-0">
              <h2 className="text-base font-medium text-steel-900 mb-2">{c.classroom_label}</h2>
              <p className="text-xs text-steel-500 mb-3">
                {c.summary.total_students} élève(s) — Total dû {formatXOF(c.summary.total_due)} — Payé {formatXOF(c.summary.total_paid)} — Reste {formatXOF(c.summary.total_remaining)} — {c.summary.count_owing} élève(s) en retard
              </p>

              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-steel-200 bg-steel-50">
                    <th className="text-left px-3 py-2 text-steel-500 font-medium">Nom</th>
                    <th className="text-left px-3 py-2 text-steel-500 font-medium">Matricule</th>
                    <th className="text-right px-3 py-2 text-steel-500 font-medium">Payé</th>
                    <th className="text-right px-3 py-2 text-steel-500 font-medium">Reste</th>
                    <th className="text-left px-3 py-2 text-steel-500 font-medium">Dernier paiement</th>
                    <th className="text-left px-3 py-2 text-steel-500 font-medium">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {c.students.map(s => (
                    <tr key={s.matricule} className="border-b border-steel-50">
                      <td className="px-3 py-2 text-steel-800">{s.full_name}</td>
                      <td className="px-3 py-2 text-steel-600">{s.matricule}</td>
                      <td className="px-3 py-2 text-right text-steel-700">{formatXOF(s.total_paid)}</td>
                      <td className="px-3 py-2 text-right font-medium" style={{ color: s.remaining > 0 ? '#dc2626' : '#111' }}>{formatXOF(s.remaining)}</td>
                      <td className="px-3 py-2 text-steel-600">{formatDate(s.last_payment_date)}</td>
                      <td className="px-3 py-2" style={{ color: s.status === 'paid' ? '#059669' : s.status === 'partial' ? '#d97706' : '#dc2626' }}>{STATUS_LABELS[s.status]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
