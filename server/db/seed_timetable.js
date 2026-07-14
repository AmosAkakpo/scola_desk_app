'use strict'
// Run: node server/db/seed_timetable.js
// Clears and rebuilds teacher_schedule + timetable_entries for the current academic year.

const Database = require('better-sqlite3-multiple-ciphers')
const path = require('path')

const DB_PATH = path.join(__dirname, '../../data/scolaDesk.db')
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// ─── TIME HELPERS ────────────────────────────────────────────────────────────

function toMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m }
function fromHour(h) { return `${String(h).padStart(2, '0')}:00` }

// ─── LOAD IDs FROM DB ────────────────────────────────────────────────────────

const yearRow = db.prepare("SELECT value FROM app_settings WHERE key='current_academic_year_id'").get()
if (!yearRow?.value) { console.error('No current_academic_year_id set'); process.exit(1) }
const YEAR_ID = parseInt(yearRow.value)

const teacherMap = {}
for (const t of db.prepare('SELECT id, full_name FROM teachers WHERE is_deleted=0').all())
  teacherMap[t.full_name] = t.id

const classroomMap = {}
for (const c of db.prepare(`
  SELECT c.id, c.label, l.level_code
  FROM classrooms c JOIN levels l ON l.id = c.level_id
  WHERE c.is_deleted=0 AND c.academic_year_id=?
`).all(YEAR_ID))
  classroomMap[c.label] = { id: c.id, levelCode: c.level_code }

const subjectMap = {}
for (const s of db.prepare('SELECT id, name FROM subjects WHERE is_active=1').all())
  subjectMap[s.name] = s.id

console.log(`Year ID: ${YEAR_ID}`)
console.log(`Teachers: ${Object.keys(teacherMap).length}`)
console.log(`Classrooms: ${Object.keys(classroomMap).length}`)
console.log(`Subjects: ${Object.keys(subjectMap).length}`)
if (Object.keys(classroomMap).length === 0) {
  console.error('No classrooms found for current year. Run onboarding first.')
  process.exit(1)
}

// ─── CLASS→SUBJECT→TEACHER ASSIGNMENTS ──────────────────────────────────────
// h = hours/week, block = preferred session length in hours

const RATE = 1500 // XOF/hour default

const ASSIGNMENTS = {
  '6eme A': [
    { sub: 'Mathématiques',      t: 'ADJOVI Kossi Marcel',       h: 4, block: 2 },
    { sub: 'Anglais',            t: 'AHOUANSOU Judith Afi',      h: 3, block: 1 },
    { sub: 'Physic Chimie et Technology', t: 'SOGLO Hervé Dah',   h: 3, block: 1 },
    { sub: 'Sciences de la Vie et de la Terre', t: 'GNIMASSOU Éric Houéfa', h: 2, block: 1 },
    { sub: 'Histoire-Géographie',t: 'SOSSA Ignace Todjinou',     h: 2, block: 1 },
    { sub: 'Éducation Physique et Sportive', t: 'DAGAN Crespin Sèkpon', h: 2, block: 2 },
    { sub: 'Lecture',            t: 'QUENUM Florence Adjo',      h: 2, block: 1 },
    { sub: 'Communication Écrite',t:'GANDJI Solange Bômi',       h: 2, block: 1 },
  ],
  '6eme B': [
    { sub: 'Mathématiques',      t: 'ADJOVI Kossi Marcel',       h: 4, block: 2 },
    { sub: 'Anglais',            t: 'AHOUANSOU Judith Afi',      h: 3, block: 1 },
    { sub: 'Physic Chimie et Technology', t: 'SOGLO Hervé Dah',   h: 3, block: 1 },
    { sub: 'Sciences de la Vie et de la Terre', t: 'GNIMASSOU Éric Houéfa', h: 2, block: 1 },
    { sub: 'Histoire-Géographie',t: 'SOSSA Ignace Todjinou',     h: 2, block: 1 },
    { sub: 'Éducation Physique et Sportive', t: 'DAGAN Crespin Sèkpon', h: 2, block: 2 },
    { sub: 'Lecture',            t: 'QUENUM Florence Adjo',      h: 2, block: 1 },
    { sub: 'Communication Écrite',t:'GANDJI Solange Bômi',       h: 2, block: 1 },
  ],
  '5eme A': [
    { sub: 'Mathématiques',      t: 'ADJOVI Kossi Marcel',       h: 4, block: 2 },
    { sub: 'Anglais',            t: 'AHOUANSOU Judith Afi',      h: 3, block: 1 },
    { sub: 'Physic Chimie et Technology', t: 'SOGLO Hervé Dah',   h: 3, block: 1 },
    { sub: 'Sciences de la Vie et de la Terre', t: 'GNIMASSOU Éric Houéfa', h: 2, block: 1 },
    { sub: 'Histoire-Géographie',t: 'SOSSA Ignace Todjinou',     h: 2, block: 1 },
    { sub: 'Éducation Physique et Sportive', t: 'DAGAN Crespin Sèkpon', h: 2, block: 2 },
    { sub: 'Lecture',            t: 'QUENUM Florence Adjo',      h: 2, block: 1 },
    { sub: 'Communication Écrite',t:'GANDJI Solange Bômi',       h: 2, block: 1 },
  ],
  '5eme B': [
    { sub: 'Mathématiques',      t: 'ADJOVI Kossi Marcel',       h: 4, block: 2 },
    { sub: 'Anglais',            t: 'AHOUANSOU Judith Afi',      h: 3, block: 1 },
    { sub: 'Physic Chimie et Technology', t: 'SOGLO Hervé Dah',   h: 3, block: 1 },
    { sub: 'Sciences de la Vie et de la Terre', t: 'GNIMASSOU Éric Houéfa', h: 2, block: 1 },
    { sub: 'Histoire-Géographie',t: 'SOSSA Ignace Todjinou',     h: 2, block: 1 },
    { sub: 'Éducation Physique et Sportive', t: 'DAGAN Crespin Sèkpon', h: 2, block: 2 },
    { sub: 'Lecture',            t: 'QUENUM Florence Adjo',      h: 2, block: 1 },
    { sub: 'Communication Écrite',t:'GANDJI Solange Bômi',       h: 2, block: 1 },
  ],
  // 5eme C not created in this school's onboarding
  '4eme A': [
    { sub: 'Mathématiques',      t: 'HOUNSA Fidèle Gérard',      h: 4, block: 2 },
    { sub: 'Anglais',            t: 'KIKI Arnaud Sègla',         h: 3, block: 1 },
    { sub: 'Physic Chimie et Technology', t: 'ZINSOU Carmelle Afiavi', h: 3, block: 1 },
    { sub: 'Sciences de la Vie et de la Terre', t: 'BEHANZIN Odile Hansi', h: 2, block: 1 },
    { sub: 'Histoire-Géographie',t: 'PADONOU Lucienne Sika',     h: 2, block: 1 },
    { sub: 'Éducation Physique et Sportive', t: 'DAGAN Crespin Sèkpon', h: 2, block: 2 },
    { sub: 'Lecture',            t: 'ZANNOU Hugues Jocelyn',     h: 2, block: 1 },
    { sub: 'Communication Écrite',t:'AMOUSSOU Victor Hounsè',    h: 2, block: 1 },
    { sub: 'Allemand',           t: 'BOKO Théodore Dansi',       h: 2, block: 1 },
  ],
  '4eme B': [
    { sub: 'Mathématiques',      t: 'HOUNSA Fidèle Gérard',      h: 4, block: 2 },
    { sub: 'Anglais',            t: 'KIKI Arnaud Sègla',         h: 3, block: 1 },
    { sub: 'Physic Chimie et Technology', t: 'ZINSOU Carmelle Afiavi', h: 3, block: 1 },
    { sub: 'Sciences de la Vie et de la Terre', t: 'BEHANZIN Odile Hansi', h: 2, block: 1 },
    { sub: 'Histoire-Géographie',t: 'PADONOU Lucienne Sika',     h: 2, block: 1 },
    { sub: 'Éducation Physique et Sportive', t: 'DAGAN Crespin Sèkpon', h: 2, block: 2 },
    { sub: 'Lecture',            t: 'ZANNOU Hugues Jocelyn',     h: 2, block: 1 },
    { sub: 'Communication Écrite',t:'AMOUSSOU Victor Hounsè',    h: 2, block: 1 },
    { sub: 'Espagnol',           t: 'MONTCHO Carmen Ayélé',      h: 2, block: 1 },
  ],
  '3eme A': [
    { sub: 'Mathématiques',      t: 'HOUNSA Fidèle Gérard',      h: 4, block: 2 },
    { sub: 'Anglais',            t: 'KIKI Arnaud Sègla',         h: 3, block: 1 },
    { sub: 'Physic Chimie et Technology', t: 'ZINSOU Carmelle Afiavi', h: 3, block: 1 },
    { sub: 'Sciences de la Vie et de la Terre', t: 'BEHANZIN Odile Hansi', h: 2, block: 1 },
    { sub: 'Histoire-Géographie',t: 'PADONOU Lucienne Sika',     h: 2, block: 1 },
    { sub: 'Éducation Physique et Sportive', t: 'HOUSSOU Prisca Alaba', h: 2, block: 2 },
    { sub: 'Lecture',            t: 'ZANNOU Hugues Jocelyn',     h: 2, block: 1 },
    { sub: 'Communication Écrite',t:'AMOUSSOU Victor Hounsè',    h: 2, block: 1 },
    { sub: 'Allemand',           t: 'BOKO Théodore Dansi',       h: 2, block: 1 },
  ],
  '3eme B': [
    { sub: 'Mathématiques',      t: 'HOUNSA Fidèle Gérard',      h: 4, block: 2 },
    { sub: 'Anglais',            t: 'KIKI Arnaud Sègla',         h: 3, block: 1 },
    { sub: 'Physic Chimie et Technology', t: 'ZINSOU Carmelle Afiavi', h: 3, block: 1 },
    { sub: 'Sciences de la Vie et de la Terre', t: 'BEHANZIN Odile Hansi', h: 2, block: 1 },
    { sub: 'Histoire-Géographie',t: 'PADONOU Lucienne Sika',     h: 2, block: 1 },
    { sub: 'Éducation Physique et Sportive', t: 'HOUSSOU Prisca Alaba', h: 2, block: 2 },
    { sub: 'Lecture',            t: 'ZANNOU Hugues Jocelyn',     h: 2, block: 1 },
    { sub: 'Communication Écrite',t:'AMOUSSOU Victor Hounsè',    h: 2, block: 1 },
    { sub: 'Espagnol',           t: 'MONTCHO Carmen Ayélé',      h: 2, block: 1 },
  ],
  '2nde C1': [
    { sub: 'Mathématiques',      t: 'DOSSOU Aimé Patrick',       h: 5, block: 2 },
    { sub: 'Physic Chimie et Technology', t: 'HOUNKPATIN David Ayéna', h: 4, block: 2 },
    { sub: 'Sciences de la Vie et de la Terre', t: 'ADJAKOU Serge Mensah', h: 3, block: 1 },
    { sub: 'Français',           t: 'AÏSSI Roland Gbètoho',      h: 3, block: 1 },
    { sub: 'Anglais',            t: 'GBAGUIDI Estelle Nayo',     h: 2, block: 1 },
    { sub: 'Histoire-Géographie',t: 'HOUNYONOU Abel Coffi',      h: 2, block: 1 },
    { sub: 'Éducation Physique et Sportive', t: 'HOUSSOU Prisca Alaba', h: 2, block: 2 },
    { sub: 'Philosophie',        t: 'AGOSSOU Félicien Djifa',    h: 2, block: 1 },
  ],
  '2nde C2': [
    { sub: 'Mathématiques',      t: 'DOSSOU Aimé Patrick',       h: 5, block: 2 },
    { sub: 'Physic Chimie et Technology', t: 'HOUNKPATIN David Ayéna', h: 4, block: 2 },
    { sub: 'Sciences de la Vie et de la Terre', t: 'ADJAKOU Serge Mensah', h: 3, block: 1 },
    { sub: 'Français',           t: 'AÏSSI Roland Gbètoho',      h: 3, block: 1 },
    { sub: 'Anglais',            t: 'GBAGUIDI Estelle Nayo',     h: 2, block: 1 },
    { sub: 'Histoire-Géographie',t: 'HOUNYONOU Abel Coffi',      h: 2, block: 1 },
    { sub: 'Éducation Physique et Sportive', t: 'HOUSSOU Prisca Alaba', h: 2, block: 2 },
    { sub: 'Philosophie',        t: 'AGOSSOU Félicien Djifa',    h: 2, block: 1 },
  ],
  '2nde D1': [
    { sub: 'Mathématiques',      t: 'DOSSOU Aimé Patrick',       h: 5, block: 2 },
    { sub: 'Physic Chimie et Technology', t: 'HOUNKPATIN David Ayéna', h: 4, block: 2 },
    { sub: 'Sciences de la Vie et de la Terre', t: 'ADJAKOU Serge Mensah', h: 3, block: 1 },
    { sub: 'Français',           t: 'AÏSSI Roland Gbètoho',      h: 3, block: 1 },
    { sub: 'Anglais',            t: 'GBAGUIDI Estelle Nayo',     h: 2, block: 1 },
    { sub: 'Histoire-Géographie',t: 'HOUNYONOU Abel Coffi',      h: 2, block: 1 },
    { sub: 'Éducation Physique et Sportive', t: 'HOUSSOU Prisca Alaba', h: 2, block: 2 },
    { sub: 'Philosophie',        t: 'AGOSSOU Félicien Djifa',    h: 2, block: 1 },
  ],
  '2nde D2': [
    { sub: 'Mathématiques',      t: 'DOSSOU Aimé Patrick',       h: 5, block: 2 },
    { sub: 'Physic Chimie et Technology', t: 'HOUNKPATIN David Ayéna', h: 4, block: 2 },
    { sub: 'Sciences de la Vie et de la Terre', t: 'ADJAKOU Serge Mensah', h: 3, block: 1 },
    { sub: 'Français',           t: 'AÏSSI Roland Gbètoho',      h: 3, block: 1 },
    { sub: 'Anglais',            t: 'GBAGUIDI Estelle Nayo',     h: 2, block: 1 },
    { sub: 'Histoire-Géographie',t: 'HOUNYONOU Abel Coffi',      h: 2, block: 1 },
    { sub: 'Éducation Physique et Sportive', t: 'HOUSSOU Prisca Alaba', h: 2, block: 2 },
    { sub: 'Philosophie',        t: 'AGOSSOU Félicien Djifa',    h: 2, block: 1 },
  ],
  '1ere C1': [
    { sub: 'Mathématiques',      t: 'AGBANGLA Raoul Sènou',      h: 5, block: 2 },
    { sub: 'Physic Chimie et Technology', t: 'HOUNKPATIN David Ayéna', h: 4, block: 2 },
    { sub: 'Sciences de la Vie et de la Terre', t: 'ADJAKOU Serge Mensah', h: 3, block: 1 },
    { sub: 'Français',           t: 'DJENONTIN Grâce Nonvide',   h: 3, block: 1 },
    { sub: 'Anglais',            t: 'GBAGUIDI Estelle Nayo',     h: 2, block: 1 },
    { sub: 'Histoire-Géographie',t: 'HOUNYONOU Abel Coffi',      h: 2, block: 1 },
    { sub: 'Éducation Physique et Sportive', t: 'HOUSSOU Prisca Alaba', h: 2, block: 2 },
    { sub: 'Philosophie',        t: 'AGOSSOU Félicien Djifa',    h: 2, block: 1 },
  ],
  '1ere C2': [
    { sub: 'Mathématiques',      t: 'AGBANGLA Raoul Sènou',      h: 5, block: 2 },
    { sub: 'Physic Chimie et Technology', t: 'HOUNKPATIN David Ayéna', h: 4, block: 2 },
    { sub: 'Sciences de la Vie et de la Terre', t: 'ADJAKOU Serge Mensah', h: 3, block: 1 },
    { sub: 'Français',           t: 'DJENONTIN Grâce Nonvide',   h: 3, block: 1 },
    { sub: 'Anglais',            t: 'TOSSOU Parfait Djidjo',     h: 2, block: 1 },
    { sub: 'Histoire-Géographie',t: 'KPOSSOU Rachelle Ahui',     h: 2, block: 1 },
    { sub: 'Éducation Physique et Sportive', t: 'VIEYRA Blaise Ahonon', h: 2, block: 2 },
    { sub: 'Philosophie',        t: 'AGOSSOU Félicien Djifa',    h: 2, block: 1 },
  ],
  '1ere D1': [
    { sub: 'Mathématiques',      t: 'AGBANGLA Raoul Sènou',      h: 5, block: 2 },
    { sub: 'Physic Chimie et Technology', t: 'AKPLOGAN Nestor Comlan', h: 4, block: 2 },
    { sub: 'Sciences de la Vie et de la Terre', t: 'ASSOGBA Martine Yawa', h: 3, block: 1 },
    { sub: 'Français',           t: 'DJENONTIN Grâce Nonvide',   h: 3, block: 1 },
    { sub: 'Anglais',            t: 'GBAGUIDI Estelle Nayo',     h: 2, block: 1 },
    { sub: 'Histoire-Géographie',t: 'HOUNYONOU Abel Coffi',      h: 2, block: 1 },
    { sub: 'Éducation Physique et Sportive', t: 'VIEYRA Blaise Ahonon', h: 2, block: 2 },
    { sub: 'Philosophie',        t: 'FASSINOU Rosine Nansi',     h: 2, block: 1 },
  ],
  '1ere D2': [
    { sub: 'Mathématiques',      t: 'AGBANGLA Raoul Sènou',      h: 5, block: 2 },
    { sub: 'Physic Chimie et Technology', t: 'AKPLOGAN Nestor Comlan', h: 4, block: 2 },
    { sub: 'Sciences de la Vie et de la Terre', t: 'ASSOGBA Martine Yawa', h: 3, block: 1 },
    { sub: 'Français',           t: 'DJENONTIN Grâce Nonvide',   h: 3, block: 1 },
    { sub: 'Anglais',            t: 'TOSSOU Parfait Djidjo',     h: 2, block: 1 },
    { sub: 'Histoire-Géographie',t: 'KPOSSOU Rachelle Ahui',     h: 2, block: 1 },
    { sub: 'Éducation Physique et Sportive', t: 'VIEYRA Blaise Ahonon', h: 2, block: 2 },
    { sub: 'Philosophie',        t: 'FASSINOU Rosine Nansi',     h: 2, block: 1 },
  ],
  'Terminale C': [
    { sub: 'Mathématiques',      t: 'TOKPO Bienvenu Codjo',      h: 5, block: 2 },
    { sub: 'Physic Chimie et Technology', t: 'AKPLOGAN Nestor Comlan', h: 4, block: 2 },
    { sub: 'Sciences de la Vie et de la Terre', t: 'ASSOGBA Martine Yawa', h: 3, block: 1 },
    { sub: 'Français',           t: 'HOUÉTO Clément Togbé',      h: 3, block: 1 },
    { sub: 'Anglais',            t: 'TOSSOU Parfait Djidjo',     h: 2, block: 1 },
    { sub: 'Histoire-Géographie',t: 'KPOSSOU Rachelle Ahui',     h: 2, block: 1 },
    { sub: 'Éducation Physique et Sportive', t: 'VIEYRA Blaise Ahonon', h: 2, block: 2 },
    { sub: 'Philosophie',        t: 'FASSINOU Rosine Nansi',     h: 2, block: 1 },
  ],
  'Terminale D1': [
    { sub: 'Mathématiques',      t: 'TOKPO Bienvenu Codjo',      h: 5, block: 2 },
    { sub: 'Physic Chimie et Technology', t: 'AKPLOGAN Nestor Comlan', h: 4, block: 2 },
    { sub: 'Sciences de la Vie et de la Terre', t: 'ASSOGBA Martine Yawa', h: 3, block: 1 },
    { sub: 'Français',           t: 'HOUÉTO Clément Togbé',      h: 3, block: 1 },
    { sub: 'Anglais',            t: 'TOSSOU Parfait Djidjo',     h: 2, block: 1 },
    { sub: 'Histoire-Géographie',t: 'KPOSSOU Rachelle Ahui',     h: 2, block: 1 },
    { sub: 'Éducation Physique et Sportive', t: 'VIEYRA Blaise Ahonon', h: 2, block: 2 },
    { sub: 'Philosophie',        t: 'FASSINOU Rosine Nansi',     h: 2, block: 1 },
  ],
  'Terminale D2': [
    { sub: 'Mathématiques',      t: 'TOKPO Bienvenu Codjo',      h: 5, block: 2 },
    { sub: 'Physic Chimie et Technology', t: 'AKPLOGAN Nestor Comlan', h: 4, block: 2 },
    { sub: 'Sciences de la Vie et de la Terre', t: 'ASSOGBA Martine Yawa', h: 3, block: 1 },
    { sub: 'Français',           t: 'HOUÉTO Clément Togbé',      h: 3, block: 1 },
    { sub: 'Anglais',            t: 'TOSSOU Parfait Djidjo',     h: 2, block: 1 },
    { sub: 'Histoire-Géographie',t: 'KPOSSOU Rachelle Ahui',     h: 2, block: 1 },
    { sub: 'Éducation Physique et Sportive', t: 'VIEYRA Blaise Ahonon', h: 2, block: 2 },
    { sub: 'Philosophie',        t: 'FASSINOU Rosine Nansi',     h: 2, block: 1 },
  ],
}

// ─── GREEDY SCHEDULER ────────────────────────────────────────────────────────

// Per level code: { dayStart, dayEnd } (hour integers, lunch at 12 always skipped)
function levelWindow(code) {
  if (code <= 9)  return { start: 8, end: 17 }   // 6è, 5è: 8h-17h
  if (code <= 11) return { start: 7, end: 18 }   // 4è, 3è: 7h-18h
  return           { start: 7, end: 19 }          // 2nde+: 7h-19h
}

const teacherBusy  = new Set()
const classBusy    = new Set()
const classDayLoad = {}   // classId → { day → hoursAssigned }

function key(id, day, h) { return `${id}|${day}|${h}` }

function isFree(classId, teacherId, day, startH, span) {
  for (let i = 0; i < span; i++) {
    if (classBusy.has(key(classId, day, startH + i)))     return false
    if (teacherBusy.has(key(teacherId, day, startH + i))) return false
  }
  return true
}

function markBusy(classId, teacherId, day, startH, span) {
  for (let i = 0; i < span; i++) {
    classBusy.add(key(classId, day, startH + i))
    teacherBusy.add(key(teacherId, day, startH + i))
  }
  if (!classDayLoad[classId]) classDayLoad[classId] = {}
  classDayLoad[classId][day] = (classDayLoad[classId][day] || 0) + span
}

// Find a free slot of `span` hours. Sorts candidate days by how few hours
// this class already has on each day, so slots spread evenly across Mon-Fri.
function findSlot(classId, teacherId, levelCode, span) {
  const { start, end } = levelWindow(levelCode)
  const load = (d) => classDayLoad[classId]?.[d] || 0
  const days = [1, 2, 3, 4, 5].sort((a, b) => load(a) - load(b))

  for (const day of days) {
    for (let h = start; h + span <= end; h++) {
      let crossesLunch = false
      for (let i = 0; i < span; i++) { if (h + i === 12) { crossesLunch = true; break } }
      if (crossesLunch) continue
      if (isFree(classId, teacherId, day, h, span)) return { day, h }
    }
  }
  return null
}

// Schedule `totalH` hours for one subject, preferring `blockSize`-hour sessions.
// Returns array of timetable_entry objects.
function scheduleSubject(classId, teacherId, subjectId, totalH, blockSize, levelCode) {
  const entries = []
  let rem = totalH

  // Fill with preferred block size first, then 1h sessions for remainder
  for (const sz of blockSize > 1 ? [blockSize, 1] : [1]) {
    while (rem >= sz) {
      const slot = findSlot(classId, teacherId, levelCode, sz)
      if (!slot) break
      markBusy(classId, teacherId, slot.day, slot.h, sz)
      entries.push({ classId, teacherId, subjectId, day: slot.day, start: fromHour(slot.h), end: fromHour(slot.h + sz) })
      rem -= sz
    }
  }

  if (rem > 0) {
    console.warn(`  ⚠ Could not schedule ${rem}h for class=${classId} sub=${subjectId} teacher=${teacherId}`)
  }
  return entries
}

// ─── GENERATE DATA ───────────────────────────────────────────────────────────

const scheduleRows   = []
const timetableRows  = []
const warnings       = []

for (const [label, subs] of Object.entries(ASSIGNMENTS)) {
  const cls = classroomMap[label]
  if (!cls) { warnings.push(`Classroom not found: "${label}" — skipped`); continue }

  // Sort: EPS first (needs a 2h block, most constrained), then by hours desc
  const sorted = [...subs].sort((a, b) => {
    if (a.sub === 'Éducation Physique et Sportive') return -1
    if (b.sub === 'Éducation Physique et Sportive') return  1
    return b.h - a.h
  })

  for (const { sub, t, h, block } of sorted) {
    const teacherId  = teacherMap[t]
    const subjectId  = subjectMap[sub]

    if (!teacherId) { warnings.push(`Teacher not found: "${t}" for class "${label}"`) ; continue }
    if (!subjectId) { warnings.push(`Subject not found: "${sub}" for class "${label}"`); continue }

    scheduleRows.push({ teacherId, classId: cls.id, subjectId, hoursPerWeek: h })

    const slots = scheduleSubject(cls.id, teacherId, subjectId, h, block, cls.levelCode)
    timetableRows.push(...slots)
  }
}

// ─── COMMIT ──────────────────────────────────────────────────────────────────

const run = db.transaction(() => {
  db.prepare('DELETE FROM timetable_entries WHERE academic_year_id = ?').run(YEAR_ID)
  db.prepare('DELETE FROM teacher_schedule  WHERE academic_year_id = ?').run(YEAR_ID)

  const insSched = db.prepare(`
    INSERT OR IGNORE INTO teacher_schedule
      (teacher_id, classroom_id, subject_id, academic_year_id, hours_per_week, hourly_rate)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  const insTT = db.prepare(`
    INSERT INTO timetable_entries
      (academic_year_id, classroom_id, day_of_week, start_time, end_time, subject_id, teacher_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  for (const s of scheduleRows)
    insSched.run(s.teacherId, s.classId, s.subjectId, YEAR_ID, s.hoursPerWeek, RATE)

  for (const e of timetableRows)
    insTT.run(YEAR_ID, e.classId, e.day, e.start, e.end, e.subjectId, e.teacherId)
})

try {
  run()
  console.log(`\n✓ teacher_schedule: ${scheduleRows.length} rows`)
  console.log(`✓ timetable_entries: ${timetableRows.length} rows`)
  if (warnings.length) {
    console.log(`\n⚠ Warnings (${warnings.length}):`)
    warnings.forEach(w => console.log(' ', w))
  } else {
    console.log('✓ No warnings')
  }
} catch (err) {
  console.error('\n✗ Failed:', err.message)
  process.exit(1)
}

db.close()
console.log('\nDone. Restart the app to see the emploi du temps.')
