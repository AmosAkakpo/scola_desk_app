// One-time reformat of auto-generated student matricules from the old
// SCHOOLCODE/YEAR/SEQ shape to SCHOOLCODE-YEARSEQ (e.g. BJ-2026-A4P3-20260001).
// Only touches matricules that exactly match the old auto-generated pattern
// for THIS school's own school_code -- manually-typed matricules (matricule
// mode 'manual') never match this pattern and are left untouched.
exports.migration016 = function (db) {
  const schoolCode = db.prepare('SELECT school_code FROM school_config LIMIT 1').get()?.school_code
  if (!schoolCode) return

  const escaped = schoolCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`^${escaped}/(\\d{4})/(\\d{4,})$`)

  const students = db.prepare('SELECT id, matricule FROM students WHERE matricule IS NOT NULL').all()
  const update = db.prepare('UPDATE students SET matricule = ? WHERE id = ?')

  for (const s of students) {
    const match = s.matricule.match(pattern)
    if (!match) continue
    const [, year, seq] = match
    update.run(`${schoolCode}-${year}${seq}`, s.id)
  }
}
