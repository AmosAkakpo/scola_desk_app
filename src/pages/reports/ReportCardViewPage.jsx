import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../../utils/api'

export function BulletinContent({ d }) {
  const sem = d.semester
  const semLabel = `${sem === 1 ? '1er' : sem === 2 ? '2ème' : '3ème'} Trimestre`
  return (
    <div className="bg-white mx-auto print:m-0 print:shadow-none shadow-lg" style={{ width: '210mm', minHeight: '297mm', padding: '10mm 12mm', fontSize: '10pt', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div className="flex items-start justify-between mb-3" style={{ borderBottom: '2px solid #000', paddingBottom: '6px' }}>
          <div className="w-20 h-20 flex items-center justify-center">
            {d.school.logo_path ? (
              <img src={`/api/settings/school-logo?t=${d.school.logo_path ? encodeURIComponent(d.school.logo_path) : 'logo'}`} alt="" className="max-w-full max-h-full object-contain" />
            ) : (
              <div className="w-14 h-14 border-2 border-steel-400 rounded-lg flex items-center justify-center">
                <span className="text-steel-400 text-xl font-bold">S</span>
              </div>
            )}
          </div>
          <div className="text-center flex-1 px-4">
            <p className="font-bold text-[9pt] tracking-wide">RÉPUBLIQUE DU BÉNIN</p>
            <p className="font-bold text-[11pt] mt-1">{d.school.section_name || d.school.name}</p>
            <p className="font-bold text-[12pt] mt-2 underline">BULLETIN DE NOTES DU {semLabel.toUpperCase()}</p>
            <p className="text-[9pt] mt-0.5">Année Scolaire {d.academic_year}</p>
          </div>
          <div className="w-20 h-20 flex items-center justify-center">
            <img src="/drapeau_benin.png" alt="Drapeau du Bénin" className="max-w-full max-h-full object-contain" />
          </div>
        </div>

        {/* Student Info */}
        <div className="mb-3" style={{ border: '1px solid #ccc', padding: '8px 12px', minHeight: '38mm', fontSize: '9pt', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div className="grid grid-cols-3 gap-x-6 gap-y-3">
            <div><p style={{ color: '#888', marginBottom: '2px' }}>Nom complet</p><strong>{d.student.full_name}</strong></div>
            <div><p style={{ color: '#888', marginBottom: '2px' }}>Matricule</p><strong>{d.student.matricule || '—'}</strong></div>
            <div><p style={{ color: '#888', marginBottom: '2px' }}>Sexe</p><strong>{d.student.gender || '—'}</strong></div>
            <div><p style={{ color: '#888', marginBottom: '2px' }}>Classe</p><strong>{d.classroom.label}</strong></div>
            <div><p style={{ color: '#888', marginBottom: '2px' }}>Effectif de la classe</p><strong>{d.class_size}</strong></div>
            <div><p style={{ color: '#888', marginBottom: '2px' }}>Année scolaire</p><strong>{d.academic_year}</strong></div>
          </div>
        </div>

        {/* Subject Table — dynamic columns */}
        {(() => {
          const maxD = Math.max(0, ...d.subjects.map(s => s.devoirs?.length || 0))
          const maxC = Math.max(0, ...d.subjects.map(s => s.compositions?.length || 0))
          const totalExtraCols = 1 + maxD + maxC // interro + devoirs + compos
          const th = (label, w) => <th key={label} className="border border-steel-400 px-1 py-1 text-center" style={w ? { width: w } : {}}>{label}</th>
          const td = (val, opts = {}) => <td key={Math.random()} className={`border border-steel-300 px-1 py-0.5 text-center ${opts.bold ? 'font-bold' : ''}`} style={opts.style || {}}>{val ?? '—'}</td>
          return (
            <table className="w-full border-collapse mb-3" style={{ fontSize: '8pt' }}>
              <thead>
                <tr style={{ backgroundColor: '#f0f0f0' }}>
                  {th('Matières', '20%')}
                  {th('Moy Interro')}
                  {Array.from({ length: maxD }, (_, i) => th(`Devoir ${i + 1}`))}
                  {Array.from({ length: maxC }, (_, i) => th(maxC > 1 ? `Compo ${i + 1}` : 'Compo'))}
                  {th('Moyenne')}
                  {th('Coef')}
                  {th('Moy×Coef')}
                  {th('Rang')}
                  {th('Moy Max')}
                  {th('Moy Min')}
                  {th('Appréciation')}
                </tr>
              </thead>
              <tbody>
                {d.subjects.map((sub, i) => (
                  <tr key={i}>
                    <td className="border border-steel-300 px-1 py-0.5 font-medium">{sub.name}</td>
                    {td(sub.interro_avg?.toFixed(2))}
                    {Array.from({ length: maxD }, (_, j) => td(sub.devoirs?.[j]?.toFixed(2)))}
                    {Array.from({ length: maxC }, (_, j) => td(sub.compositions?.[j]?.toFixed(2)))}
                    {td(sub.raw_average?.toFixed(2), { bold: true })}
                    {td(sub.coefficient)}
                    {td(sub.weighted_average?.toFixed(2), { bold: true })}
                    {td(sub.rank)}
                    {td(sub.class_highest?.toFixed(2))}
                    {td(sub.class_lowest?.toFixed(2))}
                    <td className="border border-steel-300 px-1 py-0.5 text-center" style={{ fontSize: '7pt' }}>{sub.appreciation ?? '—'}</td>
                  </tr>
                ))}
                <tr style={{ backgroundColor: '#f0f0f0', fontWeight: 'bold' }}>
                  <td className="border border-steel-400 px-1 py-1">Total</td>
                  <td className="border border-steel-400 px-1 py-1 text-center" colSpan={totalExtraCols}>—</td>
                  <td className="border border-steel-400 px-1 py-1 text-center" colSpan={3}>
                    {d.totals.total_coefficients > 0
                      ? `Moy Générale: ${(d.totals.total_weighted_points / d.totals.total_coefficients).toFixed(2)}/20`
                      : 'Moy Générale: —'}
                  </td>
                  <td className="border border-steel-400 px-1 py-1 text-center" colSpan={4}>
                    Conduite: {d.decision?.conduite_score ?? 18}/20
                  </td>
                </tr>
              </tbody>
            </table>
          )
        })()}

        {/* Bilan */}
        {d.summary && (
          <div className="mb-3" style={{ border: '1px solid #999', padding: '4px 8px', fontSize: '9pt' }}>
            <div className="flex gap-6">
              <span><strong>Moyenne du trimestre:</strong> {d.summary.semester_average?.toFixed(2) ?? '—'}/20</span>
              <span><strong>Rang:</strong> {d.summary.class_rank ?? '—'}ème/{d.summary.class_size}</span>
              {d.decision?.conduite_score !== null && d.decision?.conduite_score !== undefined && (
                <span><strong>Conduite:</strong> {d.decision.conduite_score}/20</span>
              )}
              {d.summary.mention && <span><strong>Mention:</strong> {d.summary.mention}</span>}
            </div>
          </div>
        )}

        {/* Cross-semester bilan — always show all rows; future semesters and total show — until data exists */}
        <table className="w-full border-collapse mb-3" style={{ fontSize: '9pt' }}>
          <thead>
            <tr style={{ backgroundColor: '#f0f0f0' }}>
              <th className="border border-steel-400 px-1 py-1 text-left">Bilan</th>
              <th className="border border-steel-400 px-1 py-1 text-center">Moyenne</th>
              <th className="border border-steel-400 px-1 py-1 text-center">Rang</th>
              <th className="border border-steel-400 px-1 py-1 text-center">Moy Max</th>
              <th className="border border-steel-400 px-1 py-1 text-center">Moy Min</th>
            </tr>
          </thead>
          <tbody>
            {d.cross_semesters.map(cs => {
              const hasData = cs.semester <= sem && cs.average != null
              return (
                <tr key={cs.semester}>
                  <td className="border border-steel-300 px-1 py-0.5">Bilan {cs.semester === 1 ? '1er' : `${cs.semester}ème`} Trimestre</td>
                  <td className="border border-steel-300 px-1 py-0.5 text-center">{hasData ? cs.average.toFixed(2) : '—'}</td>
                  <td className="border border-steel-300 px-1 py-0.5 text-center">{hasData && cs.rank ? `${cs.rank}ème/${cs.class_size}` : '—'}</td>
                  <td className="border border-steel-300 px-1 py-0.5 text-center">{hasData ? (cs.highest?.toFixed(2) ?? '—') : '—'}</td>
                  <td className="border border-steel-300 px-1 py-0.5 text-center">{hasData ? (cs.lowest?.toFixed(2) ?? '—') : '—'}</td>
                </tr>
              )
            })}
            {/* Bilan Annuel row — always shown; values only on last semester */}
            <tr style={{ backgroundColor: '#f0f0f0', fontWeight: 'bold' }}>
              <td className="border border-steel-400 px-1 py-1">Bilan Annuel</td>
              <td className="border border-steel-400 px-1 py-1 text-center">{d.annual_average != null ? d.annual_average.toFixed(2) : '—'}</td>
              <td className="border border-steel-400 px-1 py-1 text-center">
                {d.annual_rank != null ? `${d.annual_rank}ème/${d.cross_semesters.find(cs => cs.class_size)?.class_size ?? '—'}` : '—'}
              </td>
              <td className="border border-steel-400 px-1 py-1 text-center">—</td>
              <td className="border border-steel-400 px-1 py-1 text-center">—</td>
            </tr>
          </tbody>
        </table>

        {/* Sanctions · Félicitations · Conseil — 4-column row */}
        <div className="grid grid-cols-4 mb-3" style={{ fontSize: '9pt', border: '1px solid #ccc' }}>
          <div style={{ borderRight: '1px solid #ccc', padding: '4px 8px' }}>
            <p className="font-bold mb-1">Sanctions</p>
            <p>Avertissement: <strong>{d.decision?.avertissement ? 'Oui' : 'Non'}</strong></p>
            <p>Blâme: <strong>{d.decision?.blame ? 'Oui' : 'Non'}</strong></p>
          </div>
          <div style={{ borderRight: '1px solid #ccc', padding: '4px 8px' }}>
            <p className="font-bold mb-1">Félicitations</p>
            <p>Encouragement: <strong>{d.decision?.encouragement ? 'Oui' : 'Non'}</strong></p>
            <p>Félicitation: <strong>{d.decision?.felicitation ? 'Oui' : 'Non'}</strong></p>
            <p>Tableau d'honneur: <strong>{d.decision?.tableau_honneur ? 'Oui' : 'Non'}</strong></p>
          </div>
          <div className="col-span-2" style={{ padding: '4px 8px' }}>
            <p className="font-bold mb-1">Décision du conseil des professeurs</p>
            {d.decision?.conseil_decision ? (
              <p style={{ color: d.decision.conseil_decision_pass ? '#166534' : '#b91c1c', fontWeight: 600 }}>
                {d.decision.conseil_decision}
              </p>
            ) : (
              <p style={{ color: '#555' }}>—</p>
            )}
          </div>
        </div>

        {/* Admission en classe supérieure — row always visible; value only on last semester */}
        <div style={{ border: '1px solid #ccc', padding: '4px 8px', fontSize: '9pt', marginBottom: '8px' }}>
          <span className="font-bold">Admission en classe supérieure :&nbsp;</span>
          {d.passage_admis != null ? (
            <span style={{ fontWeight: 700, color: d.passage_admis ? '#166534' : '#b91c1c' }}>
              {d.passage_admis ? 'Admis(e)' : 'Non admis(e)'}
            </span>
          ) : (
            <span style={{ color: '#888' }}>—</span>
          )}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 'auto', paddingTop: '10mm', fontSize: '9pt' }}>
          <div className="flex items-end justify-between">
            <div>
              <p className="font-bold">Cachet et signature du Directeur/rice</p>
              <p className="mt-8">{d.school.director || '___________________________'}</p>
            </div>
          </div>
          <div style={{ fontSize: '8pt', color: '#666', marginTop: '6px', textAlign: 'center' }}>
            <p>Tout bulletin comportant des ratures ou surcharges est nul. Seul fait foi le bulletin portant le cachet et la signature du Directeur.</p>
          </div>
        </div>
      </div>
  )
}

export default function ReportCardViewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/api/report-cards/view/${id}`).then(res => {
      setSnapshot(res.data.snapshot)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id])

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
  if (!snapshot) return <p className="text-steel-500 py-20 text-center">Bulletin introuvable</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-4 print:hidden">
        <button onClick={() => navigate(-1)} className="text-xs text-steel-400 hover:text-steel-600 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Retour
        </button>
        <button onClick={() => window.print()} className="px-4 py-2 bg-brand hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
          Imprimer
        </button>
      </div>
      <BulletinContent d={snapshot} />
    </div>
  )
}
