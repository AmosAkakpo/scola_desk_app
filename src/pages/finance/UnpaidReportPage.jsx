import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../utils/api'

function formatXOF(n) {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' F'
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR')
}

const STATUS_LABELS = { paid: 'Soldé', partial: 'Partiel', unpaid: 'Impayé' }

export default function UnpaidReportPage() {
  const navigate = useNavigate()
  const [classrooms, setClassrooms] = useState([])
  const [selected, setSelected] = useState([])
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [printing, setPrinting] = useState(false)

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

  useEffect(() => {
    if (!printing) return
    const style = document.createElement('style')
    style.id = 'scola-print-style'
    style.textContent = '@media print { @page { size: A4 portrait; margin: 0; } body * { visibility: hidden !important; } #scola-print-content { visibility: visible !important; position: fixed !important; top: 0; left: 0; width: 100%; overflow: visible; } #scola-print-content * { visibility: visible !important; } }'
    document.head.appendChild(style)
    window.print()
    const cleanup = () => { document.getElementById('scola-print-style')?.remove(); setPrinting(false) }
    window.addEventListener('afterprint', cleanup, { once: true })
    return () => { document.getElementById('scola-print-style')?.remove() }
  }, [printing])

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
            <button onClick={() => setPrinting(true)}
              className="px-4 py-2 bg-brand hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              Imprimer
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

      {/* Report */}
      {report && (
        <div id="scola-print-content" className="bg-white rounded-xl border border-steel-200" style={printing ? { padding: '10mm 12mm', fontFamily: 'Arial, sans-serif' } : { padding: '20px' }}>
          {report.classrooms.length === 0 && (
            <p className="text-steel-400 text-sm text-center py-8">Aucune classe trouvée pour cette sélection.</p>
          )}
          {report.classrooms.map((c, idx) => (
            <div key={c.classroom_id} style={printing ? { breakBefore: idx > 0 ? 'page' : 'auto' } : { marginBottom: '32px' }}>
              {/* Header (print only) */}
              {printing && (
                <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: 10, marginBottom: 14 }}>
                  <p style={{ fontWeight: 'bold', fontSize: 9, letterSpacing: 1 }}>RÉPUBLIQUE DU BÉNIN</p>
                  <p style={{ fontWeight: 'bold', fontSize: 14, margin: '4px 0 0' }}>{report.school?.school_name || 'Établissement scolaire'}</p>
                  <p style={{ fontWeight: 'bold', fontSize: 12, letterSpacing: 1, margin: '10px 0 0', textTransform: 'uppercase' }}>État financier — Liste des impayés</p>
                  <p style={{ fontSize: 10, margin: '4px 0 0' }}>Année scolaire {report.year_label || '—'} — Édité le {new Date().toLocaleDateString('fr-FR')}</p>
                </div>
              )}

              <h2 className="text-base font-medium text-steel-900 mb-2">{c.classroom_label}</h2>
              <p className="text-xs text-steel-500 mb-3">
                {c.summary.total_students} élève(s) — Total dû {formatXOF(c.summary.total_due)} — Payé {formatXOF(c.summary.total_paid)} — Reste {formatXOF(c.summary.total_remaining)} — {c.summary.count_owing} élève(s) en retard
              </p>

              <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead style={{ display: 'table-header-group' }}>
                  <tr className="border-b border-steel-200 bg-steel-50">
                    <th className="text-left px-3 py-2 text-steel-500 font-medium" style={{ border: printing ? '1px solid #ddd' : 'none' }}>Nom</th>
                    <th className="text-left px-3 py-2 text-steel-500 font-medium" style={{ border: printing ? '1px solid #ddd' : 'none' }}>Matricule</th>
                    <th className="text-right px-3 py-2 text-steel-500 font-medium" style={{ border: printing ? '1px solid #ddd' : 'none' }}>Payé</th>
                    <th className="text-right px-3 py-2 text-steel-500 font-medium" style={{ border: printing ? '1px solid #ddd' : 'none' }}>Reste</th>
                    <th className="text-left px-3 py-2 text-steel-500 font-medium" style={{ border: printing ? '1px solid #ddd' : 'none' }}>Dernier paiement</th>
                    <th className="text-left px-3 py-2 text-steel-500 font-medium" style={{ border: printing ? '1px solid #ddd' : 'none' }}>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {c.students.map(s => (
                    <tr key={s.matricule} style={{ pageBreakInside: 'avoid', borderBottom: printing ? 'none' : '1px solid #eee' }}>
                      <td className="px-3 py-2 text-steel-800" style={{ border: printing ? '1px solid #ddd' : 'none' }}>{s.full_name}</td>
                      <td className="px-3 py-2 text-steel-600" style={{ border: printing ? '1px solid #ddd' : 'none' }}>{s.matricule}</td>
                      <td className="px-3 py-2 text-right text-steel-700" style={{ border: printing ? '1px solid #ddd' : 'none' }}>{formatXOF(s.total_paid)}</td>
                      <td className="px-3 py-2 text-right font-medium" style={{ border: printing ? '1px solid #ddd' : 'none', color: s.remaining > 0 ? '#dc2626' : '#111' }}>{formatXOF(s.remaining)}</td>
                      <td className="px-3 py-2 text-steel-600" style={{ border: printing ? '1px solid #ddd' : 'none' }}>{formatDate(s.last_payment_date)}</td>
                      <td className="px-3 py-2" style={{ border: printing ? '1px solid #ddd' : 'none', color: s.status === 'paid' ? '#059669' : s.status === 'partial' ? '#d97706' : '#dc2626' }}>{STATUS_LABELS[s.status]}</td>
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
