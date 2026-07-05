# ScolaDesk School App — Future Features

> Features discussed and intentionally deferred. Revisit when the relevant phase or version is in scope.

---

- **Semester grade locking** — Admin can lock a semester's grades to prevent further edits. Requires lock/unlock flow, admin authorization, audit logging. V1 relies on report card snapshots as the immutable record instead. *(Deferred: 2026-06-21, reason: adds complexity without proportional value in V1 — snapshot immutability is sufficient)*

- **Absent handling rules** — What happens when a student is absent for all assessments in a subject? Currently computes as 0. Schools may want configurable rules (exclude from average, mark as N/A). *(Deferred: 2026-06-21, reason: edge case — gather school feedback first)*

- **Fiches de notes — bulk Excel download** — Page to bulk-download grade sheets (ZIP, one Excel per class×subject×trimestre), named `{année}_{classe}_{matière}_{enseignant}_T{sem}.xlsx`, each carrying a hidden `_meta` sheet (class/subject/semester/year) + columns Nom complet, Matricule, assessment columns. Backend (`/api/grades/sheet-options`, `/api/grades/bulk-sheets`) and the page (`FicheNotePage.jsx`) are built but **pulled from the active UI** pending the import side being production-safe. *(Deferred: 2026-06-23, reason: depends on a safe import path — see below)*

- **Importer fiche de note — Excel upload** — Upload filled grade sheets; server reads `_meta` to route grades, matches students by matricule→name, ABS/blank handling, range validation. Backend (`/api/grades/import-sheet`) and page (`ImportFichePage.jsx`) are built but **pulled from the active UI**. Must be hardened before shipping:
  - **Preview-before-commit**: show "X grades to set, Y to overwrite (old→new), Z students unmatched, W columns unrecognized" → confirm. (Kills silent overwrites + silent column skips.)
  - **Scoped + meta-optional**: pick class+semester; if `_meta` is missing/broken (CSV save, copy to fresh workbook, Google Sheets round-trip), fall back to the picker instead of failing.
  - **Strict columns**: report unrecognized columns as errors, never silently skip.
  - **Matricule-keyed matching**; treat name column as read-only reference (avoid same-name mis-assignment).
  - **Audit**: record source filename + importer + timestamp.
  *(Deferred: 2026-06-23, reason: in-app grade grid is the reliable primary path for now; Excel round-trip needs the safety work above before real report-card grades depend on it)*

- **Revenus divers page** — Separate page to record misc income (donations, subsidies, ad-hoc tuition not flowing through enrollment). DB table `other_revenues`, migration 013, and all backend routes (`GET/POST/DELETE /api/finance/other-revenues`, `/api/finance/revenue-categories`) are fully built. Frontend page `OtherRevenuesPage.jsx` is built but pulled from nav/routing. Re-enabling = add import + route in `App.jsx` and nav item in `Layout.jsx`. *(Deferred: 2026-07-05, reason: polish other finance flows first)*

- **Student photo upload** — Store a profile photo per student, displayed on the student detail page and optionally on report cards. Needs a storage strategy (local `data/photos/` directory like logos, served via a public route). Concerns: USB backup size, disk space on low-spec school machines. *(Deferred: 2026-07-05, reason: USB storage and disk space concerns on target hardware)*

---

*Last updated: 2026-07-05*
