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

- **Paramètres page restructure** — The admin Paramètres page is cramped; split it into sectioned sub-pages (identité école / échelle d'appréciation / évaluations / coefficients / affectations / niveaux & classes). *(Deferred: 2026-07-08, reason: finish core phases first)*

- **Student photo upload** — Store a profile photo per student, displayed on the student detail page and optionally on report cards. Needs a storage strategy (local `data/photos/` directory like logos, served via a public route). Concerns: USB backup size, disk space on low-spec school machines. *(Deferred: 2026-07-05, reason: USB storage and disk space concerns on target hardware)*

- **V2 — Internationalization & multi-system schools (bilingual / Nigerian / American)** — Three layers, all deferred together: (1) UI language switching — every string is hardcoded French across ~40 pages + server messages; needs i18n extraction (react-i18next) and translation; (2) per-system document templates — an anglophone school needs a structurally different report card, not a translated Beninese bulletin (see "multiple bulletin templates"); (3) configurable academic model — letter grades/GPA, WAEC/NECO exams, terms vs trimestres, different promotion rules. Already V2-safe today: stored values are codes not French, school content stays in the school's language, grading engine configurable (max score, scales, custom subjects/levels), `periode_type` unconstrained. **⚠ One schema landmine with a deadline**: `national_exam_results.exam_type` has `CHECK IN ('CEP','BEPC','BAC')` — SQLite CHECKs require a full table rebuild to change. The table is EMPTY until Phase 5 ships exam entry; dropping the CHECK is trivial while it's empty and becomes a careful data-preserving rebuild on every school's machine afterwards. Do this migration BEFORE or WITH Phase 5 if V2 is at all likely. *(Deferred: 2026-07-10, reason: V1 stays focused on the Benin francophone market; disciplines that keep the V2 door open — codes not display text in DB, canonical numeric scores, no CHECKs on school-configurable domains — cost nothing and are already followed)*

- **National exam cohort feature (finish + rework)** — Built during Phase 5 (level-based: `levels.is_exam_cohort`/`exam_name`, `exam_passing_rules` table with mode + min_moyenne, entry grid in the promotion flow) but **hidden** behind `EXAM_COHORT_ENABLED = false` in `server/utils/promotionVerdicts.js`, `promotionChecklist.js`, `src/pages/general/FinAnneePage.jsx`, and `src/pages/settings/StructureSettingsPage.jsx` — code left in place, not deleted. Owner wants a rework before shipping: instead of deriving "which classrooms sit this exam" automatically from the level, a dedicated page to **manually assign specific classrooms to each national exam** — needed for bilingual/multi-curriculum schools later where a track doesn't map cleanly to a Beninese level. That page would also be where new exam types get added and grades entered, replacing the current settings-tab + wizard-step split. *(Deferred: 2026-07-12, reason: owner wants the classroom-assignment model before this is exposed to users; current level-based version was confusing — a level could be flagged as a cohort with zero students in it and still block the promotion flow)*

---

*Last updated: 2026-07-12*
