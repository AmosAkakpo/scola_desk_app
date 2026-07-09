import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../../utils/api'
import { BulletinContent } from './ReportCardViewPage'

export default function ReportCardBatchPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const classroomId = searchParams.get('classroomId')
  const semester = parseInt(searchParams.get('semester') || '1')

  const [snapshots, setSnapshots] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!classroomId) { setError('Paramètres manquants'); setLoading(false); return }

    api.get(`/api/report-cards/batch-view/${classroomId}/${semester}`)
      .then(res => {
        const results = (res.data.snapshots || []).map(s => s.snapshot).filter(Boolean)
        setSnapshots(results)
        setLoading(false)
      })
      .catch(() => { setError('Erreur de chargement'); setLoading(false) })
  }, [classroomId, semester])

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (error) return <p className="text-steel-500 py-20 text-center">{error}</p>

  if (snapshots.length === 0) return (
    <div className="text-center py-20">
      <p className="text-steel-500">Aucun bulletin disponible.</p>
      <button onClick={() => navigate(-1)} className="mt-4 text-sm text-brand hover:text-brand-600">Retour</button>
    </div>
  )

  return (
    <div>
      <div className="print:hidden flex items-center justify-between mb-6 px-4 py-3 bg-white border-b border-steel-200 sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="text-xs text-steel-400 hover:text-steel-600 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Retour
        </button>
        <span className="text-sm text-steel-600">{snapshots.length} bulletin{snapshots.length > 1 ? 's' : ''}</span>
        <button onClick={() => window.print()}
          className="px-4 py-2 bg-brand hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
          Imprimer tout ({snapshots.length})
        </button>
      </div>

      {snapshots.map((snap, i) => (
        <div key={snap.student?.id ?? i} style={{ pageBreakAfter: i < snapshots.length - 1 ? 'always' : 'auto' }}>
          <BulletinContent d={snap} />
        </div>
      ))}
    </div>
  )
}
