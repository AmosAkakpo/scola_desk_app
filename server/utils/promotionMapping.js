// Shared by the promotion preview (read-only) and execute (creates the
// rows) endpoints so the target-classroom decision the admin sees in the
// preview is exactly what execute actually does -- no divergence.

function getTargetLevel(db, levelId) {
  const current = db.prepare('SELECT display_order FROM levels WHERE id = ?').get(levelId)
  if (!current) return null
  return db.prepare('SELECT * FROM levels WHERE display_order > ? ORDER BY display_order LIMIT 1').get(current.display_order)
}

function classroomSuffix(label, levelName) {
  return label.startsWith(levelName) ? label.slice(levelName.length).trim() : ''
}

// Resolves the (level, série, label) a student's new classroom should be in.
// verdict: 'admis' (moves to the next level) or 'doublant' (repeats the
// same level). Returns null if verdict is 'admis' and there is no next
// level (Terminale etc.) -- caller treats that as graduation.
function resolveTarget(db, sourceClassroom, sourceLevel, verdict, currentYearId) {
  const targetLevel = verdict === 'doublant' ? sourceLevel : getTargetLevel(db, sourceLevel.id)
  if (!targetLevel) return null

  let targetSerieId = null
  if (targetLevel.has_serie) {
    if (verdict === 'doublant' && sourceClassroom.serie_id) {
      targetSerieId = sourceClassroom.serie_id
    } else if (sourceClassroom.serie_id) {
      const sourceSerieName = db.prepare('SELECT name FROM series WHERE id = ?').get(sourceClassroom.serie_id)?.name
      const matched = sourceSerieName
        ? db.prepare('SELECT id FROM series WHERE level_id = ? AND name = ?').get(targetLevel.id, sourceSerieName)
        : null
      targetSerieId = matched?.id
        || db.prepare('SELECT id FROM series WHERE level_id = ? ORDER BY id LIMIT 1').get(targetLevel.id)?.id
        || null
    } else {
      targetSerieId = db.prepare('SELECT id FROM series WHERE level_id = ? ORDER BY id LIMIT 1').get(targetLevel.id)?.id || null
    }
  }

  const suffix = classroomSuffix(sourceClassroom.label, sourceLevel.name)
  const desiredLabel = suffix ? `${targetLevel.name} ${suffix}` : targetLevel.name

  // Same-letter match against the target level's sections already running
  // THIS year (a real proxy for "the section that will exist next year" when
  // the school runs both levels in parallel today).
  const existingTargets = targetLevel.has_serie
    ? db.prepare(`
        SELECT * FROM classrooms
        WHERE level_id = ? AND serie_id = ? AND academic_year_id = ? AND is_deleted = 0
      `).all(targetLevel.id, targetSerieId, currentYearId)
    : db.prepare(`
        SELECT * FROM classrooms
        WHERE level_id = ? AND academic_year_id = ? AND is_deleted = 0
      `).all(targetLevel.id, currentYearId)

  let matched = existingTargets.find(c => c.label === desiredLabel)
  if (!matched && existingTargets.length > 0) {
    // Fallback: least-full existing section of the target level. Capacity
    // never blocks -- this only picks the emptiest bucket as a starting point.
    let best = null
    let bestCount = Infinity
    for (const c of existingTargets) {
      const cnt = db.prepare(`
        SELECT COUNT(*) as cnt FROM enrollments
        WHERE classroom_id = ? AND academic_year_id = ? AND is_deleted = 0 AND is_expelled = 0
      `).get(c.id, currentYearId)?.cnt || 0
      if (cnt < bestCount) { best = c; bestCount = cnt }
    }
    matched = best
  }

  return {
    level_id: targetLevel.id,
    level_name: targetLevel.name,
    serie_id: targetSerieId,
    label: matched ? matched.label : desiredLabel,
    // The level had zero sections running this year -- a new/growing school
    // reaching it for the first time. Execute creates the section fresh and
    // flips levels.is_active.
    is_new_level: existingTargets.length === 0,
  }
}

module.exports = { getTargetLevel, resolveTarget }
