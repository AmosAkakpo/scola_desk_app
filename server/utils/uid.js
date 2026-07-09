const { randomUUID, randomBytes } = require('crypto')

const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateUUID() {
    return randomUUID()
}

function randomChars(length) {
    const bytes = randomBytes(length)
    let result = ''
    for (let i = 0; i < length; i++) {
        result += CHARSET[bytes[i] % CHARSET.length]
    }
    return result
}

// Generates structured UIDs like T-202506-A3F1
function generateShortUID(prefix = '') {
    const now = new Date()
    const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
    const rand = randomChars(4)
    return prefix ? `${prefix}-${ym}-${rand}` : `${ym}-${rand}`
}

// Entity ID generators using school prefix
// Format: PREFIX-SCHOOLPREFIX-RAND4
// e.g. STU-A4P3-K8MN, TCH-A4P3-5RWE, USR-A4P3-P3DH
function generateStudentUID(schoolPrefix) {
    return `STU-${schoolPrefix}-${randomChars(4)}`
}

function generateTeacherUID(schoolPrefix) {
    return `TCH-${schoolPrefix}-${randomChars(4)}`
}

function generateUserUID(schoolPrefix) {
    return `USR-${schoolPrefix}-${randomChars(4)}`
}

// Student matricule: SCHOOLCODE-YEARSEQ (e.g. BJ-2026-A4P3-20260001)
// year+seq are concatenated (not multiplied) so the format stays a simple,
// collision-free 8-digit readable tail: 4-digit year + 4-digit zero-padded seq.
function generateStudentMatricule(schoolCode, year, seq) {
    return `${schoolCode}-${year}${String(seq).padStart(4, '0')}`
}

// Generates matricule from mask pattern (legacy)
function generateMatricule(mask, context = {}) {
    const { schoolCode = 'SCH', year = new Date().getFullYear(), seq = 1 } = context
    return mask
        .replace('SCH', schoolCode)
        .replace('YEAR', year)
        .replace('SEQ', String(seq).padStart(3, '0'))
        .replace('YYYYMM', `${year}${String(new Date().getMonth() + 1).padStart(2, '0')}`)
        .replace('XXXX', String(seq).padStart(4, '0'))
}

// Get school prefix from DB (cached per request)
function getSchoolPrefix(db) {
    const row = db.prepare('SELECT school_prefix FROM school_config LIMIT 1').get()
    return row?.school_prefix || 'XXXX'
}

module.exports = {
    generateUUID,
    generateShortUID,
    generateMatricule,
    generateStudentUID,
    generateTeacherUID,
    generateUserUID,
    generateStudentMatricule,
    getSchoolPrefix,
    CHARSET,
}
