// The very first migration seeded a real "Salaires" expense_categories row
// alongside Fournitures/Maintenance/Services/Autre, but salary payments
// have always lived in their own salary_payments table and are surfaced on
// the Dépenses page via a separate synthetic "Salaires" aggregation, not
// through this category. Nobody ever files a misc expense under it, so it
// just sits there empty and confusingly duplicates the synthetic one in
// the category picker (owner report 2026-07-26). Deactivate rather than
// delete -- if a school somehow already logged a real expense under it,
// that row (and its category_id) stays intact, it just stops being
// offered for new ones.
function migration022(db) {
  db.exec(`
    UPDATE expense_categories SET is_active = 0
    WHERE name = 'Salaires' AND is_system = 0
  `)
}
module.exports = { migration022 }
