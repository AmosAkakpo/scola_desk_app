import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../../utils/api'

const TYPE_LABELS = { interrogation: 'Interro', devoir: 'Devoir', composition: 'Compo', tp: 'TP', oral: 'Oral' }

function drawVerificationPage(doc, classroomLabel, subj, semesterLabel, yearLabel, W, H) {
  const margin = 10
  const headerH = 26
  const colHeaderH = 8
  const nScoreCols = subj.columns.length
  const contentW = W - 2 * margin
  const numW = 8, avgW = 18, rankW = 14
  const scoreColW = Math.max(14, Math.min(20, (contentW - numW - avgW - rankW - 50) / nScoreCols))
  const nameW = contentW - numW - scoreColW * nScoreCols - avgW - rankW
  const rowTop = margin + headerH + colHeaderH
  const availH = H - margin - rowTop
  const rowH = Math.min(7, availH / Math.max(subj.students.length, 1))

  // Header
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42)
  doc.text(`${classroomLabel}  ·  ${subj.subject_name} (Coef. ${subj.coefficient})`, margin, margin + 6)
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139)
  doc.text(`${semesterLabel}${yearLabel ? '  ·  ' + yearLabel : ''}`, margin, margin + 12)
  if (subj.teacher_name && subj.teacher_name !== 'NA') {
    doc.text(`Enseignant : ${subj.teacher_name}`, margin, margin + 18)
  }
  doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.3)
  doc.line(margin, margin + 22, W - margin, margin + 22)

  // Column header row
  const chY = margin + headerH
  doc.setFillColor(241, 245, 249); doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.2)
  doc.rect(margin, chY, contentW, colHeaderH, 'FD')
  doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(71, 85, 105)

  let cx = margin
  doc.text('#', cx + numW / 2, chY + colHeaderH / 2 + 1.5, { align: 'center' }); cx += numW
  doc.text('Nom complet', cx + 2, chY + colHeaderH / 2 + 1.5); cx += nameW
  subj.columns.forEach(col => {
    doc.text(`${col.label}`, cx + scoreColW / 2, chY + colHeaderH / 2, { align: 'center' })
    doc.setFontSize(5); doc.setFont('helvetica', 'normal')
    doc.text(`/${col.max_score}`, cx + scoreColW / 2, chY + colHeaderH / 2 + 3.5, { align: 'center' })
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold')
    cx += scoreColW
  })
  doc.text('Moy', cx + avgW / 2, chY + colHeaderH / 2 + 1.5, { align: 'center' }); cx += avgW
  doc.text('Rang', cx + rankW / 2, chY + colHeaderH / 2 + 1.5, { align: 'center' })

  // Vertical separator lines in header
  let lx = margin + numW
  doc.line(lx, chY, lx, chY + colHeaderH); lx += nameW
  doc.line(lx, chY, lx, chY + colHeaderH)
  subj.columns.forEach(() => { lx += scoreColW; doc.line(lx, chY, lx, chY + colHeaderH) })
  lx += avgW; doc.line(lx, chY, lx, chY + colHeaderH)

  // Student rows
  subj.students.forEach((st, idx) => {
    const y = rowTop + idx * rowH
    const isEven = idx % 2 === 0
    doc.setFillColor(isEven ? 255 : 249, isEven ? 255 : 250, isEven ? 255 : 252)
    doc.rect(margin, y, contentW, rowH, 'F')
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.15)
    doc.line(margin, y + rowH, margin + contentW, y + rowH)

    const textY = y + rowH / 2 + 1.5
    doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139)
    let rx = margin
    doc.text(String(idx + 1), rx + numW / 2, textY, { align: 'center' }); rx += numW

    doc.setTextColor(15, 23, 42); doc.setFont('helvetica', idx < 3 && st.average !== null ? 'bold' : 'normal')
    const nameLines = doc.splitTextToSize(st.full_name, nameW - 2)
    doc.text(nameLines[0], rx + 1.5, textY); rx += nameW

    st.scores.forEach(sc => {
      doc.setFont('helvetica', 'normal')
      if (sc === 'ABS') {
        doc.setTextColor(220, 38, 38)
        doc.text('ABS', rx + scoreColW / 2, textY, { align: 'center' })
        doc.setTextColor(15, 23, 42)
      } else if (sc !== null) {
        doc.setTextColor(15, 23, 42)
        doc.text(String(sc), rx + scoreColW / 2, textY, { align: 'center' })
      } else {
        doc.setTextColor(203, 213, 225)
        doc.text('—', rx + scoreColW / 2, textY, { align: 'center' })
        doc.setTextColor(15, 23, 42)
      }
      rx += scoreColW
    })

    if (st.average !== null) {
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(st.average >= 10 ? 22 : 220, st.average >= 10 ? 163 : 38, st.average >= 10 ? 74 : 38)
      doc.text(st.average.toFixed(2), rx + avgW / 2, textY, { align: 'center' })
    } else {
      doc.setTextColor(203, 213, 225); doc.setFont('helvetica', 'normal')
      doc.text('—', rx + avgW / 2, textY, { align: 'center' })
    }
    rx += avgW

    doc.setFont('helvetica', 'bold'); doc.setTextColor(59, 130, 246)
    doc.text(st.rank ? `${st.rank}${st.rank_ex ? 'ex' : ''}` : '—', rx + rankW / 2, textY, { align: 'center' })

    // Vertical separators per row
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.15)
    let vx = margin + numW
    doc.line(vx, y, vx, y + rowH); vx += nameW; doc.line(vx, y, vx, y + rowH)
    subj.columns.forEach(() => { vx += scoreColW; doc.line(vx, y, vx, y + rowH) })
    vx += avgW; doc.line(vx, y, vx, y + rowH)
  })

  // Outer border
  doc.setDrawColor(148, 163, 184); doc.setLineWidth(0.3)
  doc.rect(margin, margin + headerH, contentW, colHeaderH + subj.students.length * rowH)
}

function recomputeRows(rows, templates, coefficient, appreciationScale) {
  const interroTemplates = templates.filter(t => t.assessment_type === 'interrogation')
  const otherTemplates = templates.filter(t => t.assessment_type !== 'interrogation')

  const computed = rows.map(row => {
    let totalGraded = 0
    templates.forEach(t => {
      const s = row.scores[t.id] || {}
      if (s.score !== null || s.is_absent) totalGraded++
    })

    // Per-type averages for display (moy interro, etc.)
    const byType = {}
    templates.forEach(t => {
      if (!byType[t.assessment_type]) byType[t.assessment_type] = { total: 0, count: 0, max: t.max_score }
      const s = row.scores[t.id] || {}
      if (s.score !== null && !s.is_absent) {
        byType[t.assessment_type].total += s.score
        byType[t.assessment_type].count++
      }
    })
    const typeAverages = {}
    for (const [type, data] of Object.entries(byType)) {
      typeAverages[type] = data.count > 0 ? parseFloat(((data.total / data.count) * (data.max === 20 ? 1 : 20 / data.max)).toFixed(2)) : null
    }

    // Overall average: (moy_interro + each_devoir + each_compo) / total_slots
    let interroSum = 0, interroCount = 0
    for (const t of interroTemplates) {
      const s = row.scores[t.id] || {}
      if (s.score !== null && !s.is_absent) {
        interroSum += (s.score / t.max_score) * 20
        interroCount++
      }
    }
    const slots = []
    if (interroCount > 0) slots.push(interroSum / interroCount)
    for (const t of otherTemplates) {
      const s = row.scores[t.id] || {}
      if (s.score !== null && !s.is_absent) slots.push((s.score / t.max_score) * 20)
    }

    const average = slots.length > 0 ? parseFloat((slots.reduce((a, b) => a + b, 0) / slots.length).toFixed(2)) : null
    const moyCoef = average !== null ? parseFloat((average * coefficient).toFixed(2)) : null

    let appreciation = ''
    if (average !== null && appreciationScale) {
      for (const s of appreciationScale) {
        if (average >= s.min && average <= s.max) { appreciation = s.label; break }
      }
    }

    return { ...row, type_averages: typeAverages, average, moy_coef: moyCoef, appreciation, graded: totalGraded, total_assessments: templates.length }
  })

  const sorted = [...computed].filter(r => r.average !== null).sort((a, b) => b.average - a.average)
  let rank = 1
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i].average < sorted[i - 1].average) rank = i + 1
    sorted[i]._rank = rank
    sorted[i]._rankSuffix = (i > 0 && sorted[i].average === sorted[i - 1].average) ? 'ex' : ''
  }
  const rankMap = {}
  sorted.forEach(r => { rankMap[r.student_id] = { rank: r._rank, suffix: r._rankSuffix } })

  computed.forEach(r => {
    const rk = rankMap[r.student_id]
    r.rank = rk?.rank || null
    r.rank_suffix = rk?.suffix || ''
  })

  const validAverages = computed.filter(r => r.average !== null).map(r => r.average)
  const classStats = {
    class_average: validAverages.length > 0 ? parseFloat((validAverages.reduce((a, b) => a + b, 0) / validAverages.length).toFixed(2)) : null,
    highest: validAverages.length > 0 ? Math.max(...validAverages) : null,
    lowest: validAverages.length > 0 ? Math.min(...validAverages) : null,
    graded_count: computed.filter(r => r.graded > 0).length,
    total_count: computed.length,
  }

  return { rows: computed, classStats }
}

export default function GradesPage() {
  const [classrooms, setClassrooms] = useState([])
  const [subjects, setSubjects] = useState([])
  const [periodeCount, setPeriodeCount] = useState(3)
  const [periodeType, setPeriodeType] = useState('trimestre')
  const [semester, setSemester] = useState(1)
  const [showPdfModal, setShowPdfModal] = useState(false)
  const [pdfSemester, setPdfSemester] = useState(1)
  const [pdfSelections, setPdfSelections] = useState([])
  const [pdfOrientation, setPdfOrientation] = useState('portrait')
  const [generating, setGenerating] = useState(false)
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null)
  const [classroomId, setClassroomId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [templates, setTemplates] = useState([])
  const [rows, setRows] = useState([])
  const [classStats, setClassStats] = useState(null)
  const [coefficient, setCoefficient] = useState(1)
  const [appreciationScale, setAppreciationScale] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const debounceRef = useRef(null)
  const pendingRef = useRef([])

  useEffect(() => {
    api.get('/api/grades/selectors').then(res => {
      setClassrooms(res.data.classrooms || [])
      setPeriodeCount(res.data.periode_count || 3)
      setPeriodeType(res.data.periode_type || 'trimestre')
    })
  }, [])

  useEffect(() => {
    if (!classroomId) { setSubjects([]); return }
    api.get(`/api/grades/subjects/${classroomId}`).then(res => {
      setSubjects(res.data.subjects || [])
      setSubjectId('')
    })
  }, [classroomId])

  const loadGrades = useCallback(async () => {
    if (!classroomId || !subjectId || !semester) return
    setLoading(true)
    const res = await api.get(`/api/grades/${classroomId}/${subjectId}/${semester}`)
    const tpls = res.data.templates || []
    const coef = res.data.coefficient || 1
    const scale = res.data.appreciation_scale || []
    setTemplates(tpls)
    setCoefficient(coef)
    setAppreciationScale(scale)
    const { rows: computed, classStats: stats } = recomputeRows(res.data.rows || [], tpls, coef, scale)
    setRows(computed)
    setClassStats(stats)
    setLoading(false)
  }, [classroomId, subjectId, semester])

  useEffect(() => { loadGrades() }, [loadGrades])

  function handleScoreChange(studentId, templateId, value, isAbsent) {
    setRows(prev => {
      const updated = prev.map(r => {
        if (r.student_id !== studentId) return r
        const newScores = { ...r.scores }
        newScores[templateId] = { ...newScores[templateId], score: value, is_absent: isAbsent }
        return { ...r, scores: newScores }
      })
      const { rows: recomputed, classStats: stats } = recomputeRows(updated, templates, coefficient, appreciationScale)
      setClassStats(stats)
      return recomputed
    })

    pendingRef.current.push({ template_id: templateId, student_id: studentId, score: value, is_absent: isAbsent })
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const batch = pendingRef.current.filter(p => p.template_id)
      pendingRef.current = []
      if (batch.length === 0) return
      setSaving(true)
      try { await api.post('/api/grades/batch', { scores: batch }) } catch {}
      setSaving(false)
    }, 400)
  }

  const grouped = templates.map(t => ({
    ...t,
    label: `${TYPE_LABELS[t.assessment_type] || t.assessment_type} ${t.sequence_number}`,
  }))

  const typeGroups = {}
  templates.forEach(t => {
    if (!typeGroups[t.assessment_type]) typeGroups[t.assessment_type] = 0
    typeGroups[t.assessment_type]++
  })

  const gradedCount = classStats?.graded_count || 0
  const totalCount = classStats?.total_count || 0
  const pct = totalCount > 0 ? Math.round((gradedCount / totalCount) * 100) : 0

  const periodeLabel = periodeType === 'semestre' ? 'Semestre' : 'Trimestre'

  async function buildVerifPdf(selectionIds, sem, orientation) {
    const { jsPDF } = await import('jspdf')
    const ids = selectionIds.join(',')
    const res = await api.get(`/api/grades/verification-pdf?semester=${sem}&classroom_ids=${ids}`)
    const { data, year_label } = res.data
    const semLabel = `${periodeLabel} ${sem}`
    const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' })
    const W = orientation === 'landscape' ? 297 : 210
    const H = orientation === 'landscape' ? 210 : 297
    const totalPages = data.reduce((n, cb) => n + cb.subjects.length, 0)
    if (totalPages === 0) {
      setPdfError(`Aucune évaluation configurée pour ${periodeLabel} ${sem}. Vérifiez que des modèles d'évaluation ont été créés pour ces classes.`)
      return null
    }
    let firstPage = true
    for (const classBlock of data) {
      for (const subj of classBlock.subjects) {
        if (!firstPage) doc.addPage()
        firstPage = false
        drawVerificationPage(doc, classBlock.classroom.label, subj, semLabel, year_label || '', W, H)
      }
    }
    return doc
  }

  const [pdfError, setPdfError] = useState('')

  async function previewVerifPdf() {
    if (!pdfSelections.length) return
    setGenerating(true); setPdfError('')
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl)
    try {
      const doc = await buildVerifPdf(pdfSelections, pdfSemester, pdfOrientation)
      if (!doc) { setPdfBlobUrl(null); setGenerating(false); return }
      setPdfBlobUrl(URL.createObjectURL(doc.output('blob')))
    } catch (err) {
      console.error('PDF preview error', err)
      setPdfError("Impossible de générer l'aperçu. Vérifiez que des notes ont été saisies pour ces classes.")
    }
    setGenerating(false)
  }

  async function downloadVerifPdf() {
    if (!pdfSelections.length) return
    setGenerating(true); setPdfError('')
    try {
      const doc = await buildVerifPdf(pdfSelections, pdfSemester, pdfOrientation)
      if (doc) doc.save(`Verification_notes_${periodeLabel}_${pdfSemester}.pdf`)
    } catch (err) {
      console.error('PDF download error', err)
      setPdfError("Impossible de générer le PDF.")
    }
    setGenerating(false)
  }

  function openPdfModal() {
    setPdfSemester(semester || 1)
    setPdfSelections(classroomId ? [classroomId] : [])
    setShowPdfModal(true)
  }

  function closePdfModal() {
    if (pdfBlobUrl) { URL.revokeObjectURL(pdfBlobUrl); setPdfBlobUrl(null) }
    setShowPdfModal(false)
    setPdfSelections([])
    setPdfError('')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-steel-900">Saisie des notes</h1>
          <p className="text-sm text-steel-500 mt-0.5">Sélectionnez le {periodeLabel.toLowerCase()}, la classe et la matière</p>
        </div>
        <div className="flex items-center gap-3">
          {saving && <span className="text-xs text-brand animate-pulse">Enregistrement...</span>}
          <button onClick={openPdfModal} className="px-3 py-2 border border-steel-200 text-steel-600 rounded-lg text-sm font-medium hover:bg-steel-50 flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Vérification PDF
          </button>
        </div>
      </div>

      {/* Selectors */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <select value={semester} onChange={e => setSemester(parseInt(e.target.value))}
          className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
          {Array.from({ length: periodeCount }, (_, i) => i + 1).map(n => (
            <option key={n} value={n}>{periodeLabel} {n}</option>
          ))}
        </select>
        <select value={classroomId} onChange={e => setClassroomId(e.target.value)}
          className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand">
          <option value="">— Classe —</option>
          {classrooms.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select value={subjectId} onChange={e => setSubjectId(e.target.value)} disabled={!classroomId}
          className="px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand disabled:opacity-50">
          <option value="">— Matière —</option>
          {subjects.map(s => <option key={s.subject_id} value={s.subject_id}>{s.subject_name} (coef {s.coefficient})</option>)}
        </select>
      </div>

      {/* Progress */}
      {classStats && (
        <div className="bg-white rounded-lg border border-steel-200 p-3 mb-4 flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-steel-500">{gradedCount}/{totalCount} élèves notés</span>
              <span className="text-xs text-steel-400">{pct}%</span>
            </div>
            <div className="w-full h-1.5 bg-steel-100 rounded-full">
              <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
          {classStats.class_average !== null && (
            <div className="flex gap-4 text-xs text-steel-500">
              <span>Moy: <strong className="text-steel-800">{classStats.class_average}</strong></span>
              <span>Max: <strong className="text-steel-800">{classStats.highest}</strong></span>
              <span>Min: <strong className="text-steel-800">{classStats.lowest}</strong></span>
            </div>
          )}
        </div>
      )}

      {/* Grade Table */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
      ) : !classroomId || !subjectId ? (
        <div className="bg-white rounded-xl border border-steel-200 p-12 text-center">
          <p className="text-steel-400 text-sm">Sélectionnez une classe et une matière pour commencer</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-steel-200 p-12 text-center">
          <p className="text-steel-400 text-sm">Aucun élève dans cette classe</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-steel-200 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-steel-200 bg-steel-50">
                <th className="text-left px-3 py-2.5 text-steel-500 font-medium sticky left-0 bg-steel-50 z-10 min-w-[40px]">#</th>
                <th className="text-left px-3 py-2.5 text-steel-500 font-medium sticky left-[40px] bg-steel-50 z-10 min-w-[160px]">Nom complet</th>
                {grouped.map(t => (
                  <th key={t.id} className="text-center px-2 py-2.5 text-steel-500 font-medium min-w-[60px]">
                    <span className="block">{t.label}</span>
                    <span className="text-[10px] text-steel-400">/{t.max_score}</span>
                  </th>
                ))}
                {Object.keys(typeGroups).filter(t => typeGroups[t] > 1).map(type => (
                  <th key={`avg_${type}`} className="text-center px-2 py-2.5 text-steel-500 font-medium bg-steel-100 min-w-[55px]">
                    Moy {TYPE_LABELS[type] || type}
                  </th>
                ))}
                <th className="text-center px-2 py-2.5 text-steel-700 font-semibold bg-steel-100 min-w-[55px]">Moy</th>
                <th className="text-center px-2 py-2.5 text-steel-500 font-medium bg-steel-100 min-w-[40px]">Coef</th>
                <th className="text-center px-2 py-2.5 text-steel-700 font-semibold bg-steel-100 min-w-[55px]">M×C</th>
                <th className="text-center px-2 py-2.5 text-steel-700 font-semibold bg-steel-100 min-w-[45px]">Rang</th>
                <th className="text-left px-2 py-2.5 text-steel-500 font-medium bg-steel-100 min-w-[80px]">Appréciation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row.student_id} className={`border-b border-steel-50 ${idx % 2 === 0 ? '' : 'bg-steel-50/30'}`}>
                  <td className="px-3 py-1.5 text-steel-400 sticky left-0 bg-white z-10">{idx + 1}</td>
                  <td className="px-3 py-1.5 text-steel-800 font-medium sticky left-[40px] bg-white z-10 truncate max-w-[160px]">{row.full_name}</td>
                  {grouped.map(t => {
                    const s = row.scores[t.id] || {}
                    return (
                      <td key={t.id} className="px-1 py-1">
                        <GradeCell
                          value={s.score}
                          isAbsent={s.is_absent}
                          maxScore={t.max_score}
                          onChange={(val, absent) => handleScoreChange(row.student_id, t.id, val, absent)}
                        />
                      </td>
                    )
                  })}
                  {Object.keys(typeGroups).filter(t => typeGroups[t] > 1).map(type => (
                    <td key={`avg_${type}`} className="px-2 py-1.5 text-center bg-steel-50/50 font-medium text-steel-700">
                      {row.type_averages[type]?.toFixed(2) ?? '—'}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-center bg-steel-50/50 font-semibold text-steel-900">
                    {row.average?.toFixed(2) ?? '—'}
                  </td>
                  <td className="px-2 py-1.5 text-center bg-steel-50/50 text-steel-500">{coefficient}</td>
                  <td className="px-2 py-1.5 text-center bg-steel-50/50 font-semibold text-steel-900">
                    {row.moy_coef?.toFixed(2) ?? '—'}
                  </td>
                  <td className="px-2 py-1.5 text-center bg-steel-50/50 font-semibold text-brand">
                    {row.rank ? `${row.rank}${row.rank_suffix ? ' ex.' : ''}` : '—'}
                  </td>
                  <td className="px-2 py-1.5 bg-steel-50/50 text-steel-600">{row.appreciation || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showPdfModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl flex flex-col" style={{ width: 820, maxHeight: '92vh' }}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-steel-200 shrink-0">
              <h2 className="text-sm font-semibold text-steel-800">Vérification des notes — PDF</h2>
              <button onClick={closePdfModal} className="text-steel-400 hover:text-steel-600 text-lg leading-none">✕</button>
            </div>

            <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
              {/* Left: semester + class selection */}
              <div className="w-56 border-r border-steel-200 flex flex-col shrink-0">
                <div className="px-3 py-2.5 border-b border-steel-100">
                  <p className="text-xs text-steel-500 mb-1.5">{periodeLabel}</p>
                  <div className="flex gap-1 flex-wrap">
                    {Array.from({ length: periodeCount }, (_, i) => i + 1).map(n => (
                      <button key={n} onClick={() => { setPdfSemester(n); setPdfBlobUrl(null) }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${pdfSemester === n ? 'bg-brand text-white border-brand' : 'bg-white border-steel-200 text-steel-600 hover:bg-steel-50'}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="px-3 py-2 border-b border-steel-100 flex gap-3">
                  <button onClick={() => { setPdfSelections(classrooms.map(c => String(c.id))); setPdfBlobUrl(null) }}
                    className="text-xs text-brand hover:underline">Tout</button>
                  <button onClick={() => { setPdfSelections([]); setPdfBlobUrl(null) }}
                    className="text-xs text-steel-400 hover:underline">Aucun</button>
                </div>
                <div className="overflow-y-auto flex-1 p-2 space-y-0.5">
                  {classrooms.map(c => (
                    <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-steel-50 cursor-pointer">
                      <input type="checkbox" className="accent-brand"
                        checked={pdfSelections.includes(String(c.id))}
                        onChange={e => {
                          const id = String(c.id)
                          setPdfSelections(prev => e.target.checked ? [...prev, id] : prev.filter(x => x !== id))
                          setPdfBlobUrl(null)
                        }} />
                      <span className="text-sm text-steel-700 leading-snug">{c.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Right: orientation + preview */}
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-steel-200 shrink-0 flex-wrap">
                  <span className="text-xs text-steel-500 mr-1">Orientation :</span>
                  {[['portrait', 'Portrait'], ['landscape', 'Paysage']].map(([o, l]) => (
                    <button key={o} onClick={() => { setPdfOrientation(o); setPdfBlobUrl(null) }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${pdfOrientation === o ? 'bg-brand text-white border-brand' : 'bg-white border-steel-200 text-steel-600 hover:bg-steel-50'}`}>
                      {l}
                    </button>
                  ))}
                  <div className="ml-auto flex gap-2">
                    <button onClick={previewVerifPdf} disabled={!pdfSelections.length || generating}
                      className="px-3 py-1.5 border border-steel-200 text-steel-600 hover:bg-steel-50 disabled:opacity-40 rounded-lg text-xs font-medium transition-colors">
                      {generating ? 'Génération...' : 'Aperçu'}
                    </button>
                    <button onClick={downloadVerifPdf} disabled={!pdfSelections.length || generating}
                      className="px-3 py-1.5 bg-brand hover:bg-brand-600 disabled:opacity-40 text-white rounded-lg text-xs font-medium transition-colors">
                      Télécharger PDF
                    </button>
                  </div>
                </div>

                {pdfBlobUrl ? (
                  <iframe src={pdfBlobUrl} className="flex-1 w-full" style={{ border: 'none' }} title="Aperçu PDF" />
                ) : pdfError ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8">
                    <svg className="w-10 h-10 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                    </svg>
                    <p className="text-sm text-steel-600 text-center">{pdfError}</p>
                    <button onClick={() => setPdfError('')} className="text-xs text-brand hover:underline">Fermer</button>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-steel-400 gap-3">
                    <svg className="w-12 h-12 opacity-25" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm">Sélectionnez des classes puis cliquez sur <span className="font-medium text-steel-600">Aperçu</span></p>
                    <p className="text-xs text-steel-300">1 page par classe × matière · classes dans l'ordre des niveaux</p>
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-2 border-t border-steel-200 shrink-0">
              <p className="text-xs text-steel-400">
                {pdfSelections.length} classe(s) · {periodeLabel} {pdfSemester}
                {pdfSelections.length > 0 ? ' · 1 page par matière par classe' : ''}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function GradeCell({ value, isAbsent, maxScore, onChange }) {
  const [localVal, setLocalVal] = useState(value ?? '')
  const [absent, setAbsent] = useState(isAbsent || false)
  const inputRef = useRef(null)

  useEffect(() => { setLocalVal(value ?? ''); setAbsent(isAbsent || false) }, [value, isAbsent])

  function handleBlur() {
    const num = localVal === '' ? null : parseFloat(localVal)
    if (num !== null && (num < 0 || num > maxScore)) return
    onChange(num, absent)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === 'Tab') {
      handleBlur()
    }
  }

  function toggleAbsent() {
    const newAbsent = !absent
    setAbsent(newAbsent)
    if (newAbsent) setLocalVal('')
    onChange(newAbsent ? null : (localVal === '' ? null : parseFloat(localVal)), newAbsent)
  }

  return (
    <div className="relative group">
      {absent ? (
        <div className="w-full h-7 flex items-center justify-center bg-red-50 border border-red-200 rounded text-xs text-red-500 font-medium cursor-pointer" onClick={toggleAbsent}>
          ABS
        </div>
      ) : (
        <input ref={inputRef} type="number" min="0" max={maxScore} step="0.25"
          value={localVal} onChange={e => setLocalVal(e.target.value)}
          onBlur={handleBlur} onKeyDown={handleKeyDown}
          className="w-full h-7 px-1.5 border border-steel-200 rounded text-xs text-center focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
      )}
      <button onClick={toggleAbsent}
        className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-steel-200 rounded-full text-[8px] text-steel-500 hidden group-hover:flex items-center justify-center hover:bg-red-200 hover:text-red-600"
        title="Absent">
        A
      </button>
    </div>
  )
}
