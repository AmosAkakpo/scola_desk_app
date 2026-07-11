# Phase 5 — Promotion Engine: Design + Build Steps

> **Status:** DRAFT — awaiting owner "y" before any code is written.
> **Read first:** HANDOFF.md, phases_completion.md (Phase 5 section has prior locked decisions this spec supersedes/extends), sync_build_steps.md (same format).
> App: `scola_desk_v1.0` only. Admin-only feature, both tiers (not requirePro).

---

## 1. Design Decisions (LOCKED, pending final "y")

| Decision | Choice | Why |
|----------|--------|-----|
| Scope | Single "Fin d'année" admin page, 5-step wizard (Vérifications → Notes examens → Aperçu → Exécution → [Rollback available for 30j]). | Matches sync_build_steps.md-style locked flow from 2026-07-10. |
| Trigger | Manual only, admin-only, once per year. | Same convention as sync. |
| Gates (Étape 1, blocking unless noted) — **automated** | (1) final-period grades computed for every classroom [blocking]; (2) bulletins générés [advisory]; (3) exam results recorded for every cohort student [blocking **only if** that exam's mode ≠ `moyenne_only`]; (4) Résumé des effectifs PDF downloaded in-flow + "envoyez-le à ScolaDesk" prompt, timestamp in `app_settings` [blocking]; (5) successful sync from today [blocking, reuses `hasSuccessfulFullSync()` from Phase 7]. | Prevents promoting on stale/incomplete data — these are DB-verified, not self-reported. |
| Gates (Étape 1) — **manual checklist toggles** | Additional self-declared checkboxes, unenforced by the system, that must ALL be ON (alongside the automated gates all being "ok") before "Commencer la promotion" activates: "Les notes ont été vérifiées par les élèves/parents", "Les bulletins ont été remis", "Tous les salaires du personnel ont été payés". Stored per-run (not globally) — reset each time the flow is opened, so a stale toggle from last year can't silently carry forward. | Owner: these can't be verified from data (a paid salary or a parent's review isn't tracked in a boolean anywhere), so they're trust-based confirmations, not blocking DB checks — but the button should still require them, same as the automated gates. |
| Double confirmation before entering the flow | Clicking "Commencer la promotion" (only enabled once every automated gate is "ok" AND every manual toggle is on) shows a plain yes/no `ConfirmModal` — "Êtes-vous sûr de vouloir terminer l'année scolaire ?" — before advancing to Étape 2. | A first, cheap confirmation the admin isn't mid-year by mistake, separate from and in addition to the type-to-confirm at actual execution (Étape 4) which is the real point of no return. |
| Verdict — non-cohort levels | `moy_cumulative ≥ promotion_pass_average` (app_settings key, already seeded = `'10'`). | Existing setting, no new config needed. |
| Verdict — exam-cohort levels (CM2/CEP, 3ème/BEPC, Terminale/BAC) | Per-exam-type configurable via new `exam_passing_rules` table: `mode` = `moyenne_only` \| `exam_only` \| `both`, `min_moyenne` (defaults to `promotion_pass_average`, independently overridable per exam). | Owner: schools differ on whether the national exam counts toward promotion. Default `moyenne_only` = today's exact behavior, zero forced setup. |
| Which levels are exam cohorts | Admin-editable, not hardcoded — new Paramètres page lets the admin toggle `levels.is_exam_cohort` + edit `levels.exam_name` per level, in addition to the mode/min_moyenne rule editor. Today's CM2/CEP, 3ème/BEPC, Terminale/BAC seed stays the default, editable if a school's reality differs. | Owner request — the seed shouldn't be the only source of truth long-term. |
| Levels the school doesn't currently use | `levels` are globally pre-seeded (Maternelle→Terminale, migration 001/002) — never school-specific — so a school offering only 6ème/2nde/1ère/Terminale today has no "missing level" gap: the target level definition already exists, it just may have zero classrooms yet and `is_active = 0`. Promotion creates that level's classroom fresh (mirroring source structure/série) the first time a student is promoted into it, and flips `levels.is_active = 1` automatically. | Handles new/growing schools without special-casing — the classroom-creation step in Étape 4 already does "create if absent," this just confirms it also covers a level with zero prior classrooms. |
| Excluded students | `students.status IN ('excluded','transferred')` OR `enrollments.is_expelled = 1` → no verdict computed, no new enrollment. Preview shows "N élèves exclus du calcul (renvoyés/transférés)" note only — not listed individually. | Matches `is_expelled = 0` convention already used in grades.js:519, reportcards.js:112. Owner-confirmed 2026-07-11. |
| Borderline handling | Verdicts within ±0.5 of the applicable threshold are visually flagged (amber) in the preview — informational, does not change the verdict. | Gives admin a nudge to double-check close cases before executing. |
| Manual override | Any single student's verdict can be flipped in the preview, with a mandatory free-text reason stored in `promotion_details.override_reason`. | Real-world exceptions (conseil de discipline, special cases) always exist. |
| Class mapping | Same-letter match first (`4ème A` → `3ème A`); if no same-letter target exists, least-full classroom of the target level/série. **Capacity never blocks** — doublants stay in their own level+série, admis join target even over capacity (warning-only, school splits classes later if needed). | Owner-confirmed 2026-07-10. |
| Doublants (verdict = doublant) | Re-enrolled in the SAME level/série for the new year, in a new classroom there (same mapping logic, target = same level). `students.is_redoublant = 1` set. | Column already exists (migration 006), unused until now. |
| Graduates (Terminale admis, or any terminal level with no next level) | `students.status = 'graduated'`, no new enrollment, `promotion_details.new_classroom_id = NULL`. | First route to ever set `status = 'graduated'`. |
| Excluded/transferred (pre-existing, not part of this run's verdict) | Already handled — skipped entirely, per "Excluded students" row above. | — |
| Fees | `fee_types` + `fee_type_amounts` (incl. the locked system fee) copied into the new academic year automatically; mandatory fees auto-assigned to every re-enrolled student via new `student_fee_selections` rows (mirrors existing enrollment-time auto-assign logic). | Owner-confirmed 2026-07-10. |
| Teachers/timetable | Toggle "Reporter les affectations et l'emploi du temps ?" at Étape 4, **default OFF**. If ON: copy `teacher_schedule` + `timetable_entries` via the same old→new classroom mapping used for students. | Owner-confirmed 2026-07-11 (default OFF — admin opts in explicitly each year). |
| New academic year | Label is free text (no fixed format enforced anywhere) — Étape 4 shows a pre-filled suggestion (parse `YYYY-YYYY` pattern from the old label and +1 both years if it matches; otherwise leave blank) in an editable text field the admin confirms or changes before executing. `is_active` flips from old year to new year atomically. | Owner-confirmed 2026-07-11: prefill + confirm, never silently auto-generate un-editable. |
| Execution | Type-to-confirm (`ConfirmModal requireMatch`, type school name or "PROMOTION" — reuse existing component). Entire operation (new year + classrooms + templates + enrollments + fee copy + promotion_runs/details + year switch) wrapped in ONE `db.transaction()`. | All-or-nothing; matches restore.js's transactional pattern. |
| Rollback | 30-day window, keyed off `promotion_runs.executed_at`. Reverses: deletes new-year enrollments created by this run, restores old year as active, sets `promotion_runs.is_rolled_back = 1`. Does NOT delete the new academic_year/classrooms themselves (could have real data by then — e.g. late re-syncs) unless they're provably empty of activity beyond this run; exact guard rails defined in Step 5 below. | Matches "rollback 30 jours" lock; needs care since this is destructive-adjacent. |
| Old-year lock | Deferred to Phase 8 (read-only enforcement on non-current years). | Already noted as deferred 2026-07-10. |
| Routes | All in new `server/routes/promotion.js`, `requireAuth` + admin-only (`role_name !== 'admin'` → 403), mounted at `/api/promotion`. NOT `requirePro` — core feature both tiers. | Matches sync.js's admin-gating pattern. |

---

## 2. Schema Changes

### Migration 018 — `exam_passing_rules` + drop CHECK on `national_exam_results.exam_type`

File: `server/db/migration/018_promotion_engine.js` (+ register in `server/db/init.js` after 017).

```sql
CREATE TABLE IF NOT EXISTS exam_passing_rules (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_type     TEXT NOT NULL UNIQUE,              -- 'CEP' | 'BEPC' | 'BAC' (free text now, see rebuild below)
  mode          TEXT NOT NULL DEFAULT 'moyenne_only'
                  CHECK(mode IN ('moyenne_only','exam_only','both')),
  min_moyenne   REAL NOT NULL DEFAULT 10,
  updated_at    TEXT DEFAULT (datetime('now'))
);
-- Seed one row per exam_name already present on is_exam_cohort levels (CEP/BEPC/BAC today),
-- all defaulting to moyenne_only/10 -- zero behavior change until the admin visits the new
-- settings page and deliberately changes a mode.
```

`national_exam_results.exam_type` CHECK constraint removal (SQLite can't ALTER off a CHECK — table rebuild, same pattern as migration 009's `teacher_daily_log` rebuild):
```sql
CREATE TABLE national_exam_results_new ( ... same columns, exam_type TEXT NOT NULL /* no CHECK */ ... );
INSERT INTO national_exam_results_new SELECT * FROM national_exam_results;
DROP TABLE national_exam_results;
ALTER TABLE national_exam_results_new RENAME TO national_exam_results;
-- recreate the UNIQUE(student_id, academic_year_id, exam_type) and any indexes
```
(This was already agreed during the V2/bilingual planning discussion — doing it now piggybacks on a migration we need anyway, avoids a second future migration touching the same table.)

`promotion_runs` / `promotion_details`: **no schema changes** — both already fully defined since migration 001 with exactly the fields this feature needs (`verdict CHECK IN ('admis','doublant','exclu')`, `national_exam_cleared`, `override_reason`, rollback fields). Confirmed already present in `sync.js`'s `SYNC_TABLES`/`TABLE_LABELS` — no sync changes needed either.

New `promotion_uid` values generated via `generateShortUID('PROMO')` (existing helper in `server/utils/uid.js`, no new generator needed).

---

## 3. Build Steps

### Step 1 — Migration 018 + `promotion.js` skeleton + exam-results endpoints + exam rules CRUD
- `server/db/migration/018_promotion_engine.js` as above, registered in `init.js`.
- `server/routes/promotion.js` (new), mounted `/api/promotion` in `server/index.js`. Admin-only guard.
- `GET /exam-rules` — list current rules (one row per exam type actually in use, derived from `levels WHERE is_exam_cohort = 1`, left-joined to `exam_passing_rules`, defaulting in-memory if a row is somehow missing).
- `PUT /exam-rules/:exam_type` — update `mode` + `min_moyenne`.
- `GET /exam-cohort-levels` — list all levels with `is_exam_cohort`, `exam_name`.
- `PUT /exam-cohort-levels/:level_id` — toggle `is_exam_cohort` + set/clear `exam_name`; if turning ON with no existing `exam_passing_rules` row for that `exam_name`, create one with the default (`moyenne_only`, 10). If turning OFF, leave the `exam_passing_rules` row in place (harmless, just unused) rather than deleting historical config.
- `GET /exam-results/:academic_year_id/:exam_type` — list cohort students + their `national_exam_results` row (or null) for entry-grid rendering.
- `POST /exam-results` — upsert one result (`student_id, academic_year_id, exam_type, result, score, serie, notes`), same UPSERT convention as `assessment_scores`.

### Step 2 — Checklist / gates endpoint
- `GET /checklist/:academic_year_id`: runs the 5 automated gates from §1, returns `{ gates: [{ key, label, status: 'ok'|'blocked'|'warning', detail }], can_proceed: bool }`.
- Gate 3 (exam results) queries `exam_passing_rules` first; skipped entirely (status 'ok', detail "Non requis pour ce mode") for any exam type in `moyenne_only` mode.
- Gate 4 checks an `app_settings` timestamp key (e.g. `effectifs_pdf_downloaded_at`) — needs `StudentsPage.jsx`'s existing "Résumé des effectifs" button/route to also stamp this key when downloaded within the promotion flow (small addition to an existing route, called out explicitly here so it isn't missed).
- Gate 5 calls the existing `hasSuccessfulFullSync(db, withinDays)` helper exported from `sync.js` (Phase 7).
- **Manual toggles are frontend-only state** (not persisted server-side, not part of this endpoint's response) — reset every time Étape 1 is opened, per §1's "reset each time" rule. `can_proceed` in the UI = `checklist.can_proceed && all manual toggles on`, computed client-side.

### Step 3 — Preview endpoint
- `GET /preview/:academic_year_id`: for every active, non-excluded/transferred enrollment in that year — compute verdict per §1 rules (reading `semester_summaries`/`subject_averages` for moyenne, `national_exam_results` for cohort levels), resolve target classroom via the mapping algorithm, flag borderline (±0.5), return per-student rows + summary counts (admis/doublant/exclu/graduated/excluded-from-calc).
- Pure read — computes but does not persist anything. Manual overrides submitted as a `{ student_id, verdict, reason }[]` array in the request body, merged into the response before returning (not stored yet — storage happens at execute time).

### Step 4 — Execute endpoint
- `POST /execute/:academic_year_id` body: `{ overrides: [...], carry_forward_assignments: bool, new_year_label: string, confirm_text: string }`.
- Re-validates all 5 gates server-side (never trust a stale client-side checklist).
- One `db.transaction()`: create new `academic_years` row with the admin-confirmed `new_year_label` → flip `is_active` old→new → for each target level+série, create classrooms (mirroring source structure; if the target level has zero existing classrooms because the school never used it before, create it fresh and flip `levels.is_active = 1`) → copy `assessment_templates` → for each verdict: create new enrollment (or `status='graduated'`/skip for exclus) → copy mandatory `fee_types`/`fee_type_amounts` into new year + auto-assign `student_fee_selections` → if `carry_forward_assignments`, copy `teacher_schedule`+`timetable_entries` via the mapping → insert `promotion_runs` row + one `promotion_details` row per student.
- Returns `{ promotion_uid, summary counts }`.

### Step 5 — Rollback endpoint
- `POST /rollback/:promotion_uid`: guard — `executed_at` within 30 days, not already rolled back.
- Reverses inside one transaction: delete the enrollments created by this run's `promotion_details` (only if still `is_deleted=0` and no payments/grades/attendance recorded against them yet — abort with a clear error listing affected students if any exist, rather than silently orphaning data), revert `academic_years.is_active` to the old year, revert any `status='graduated'` back to `'active'`, mark `promotion_runs.is_rolled_back=1` + `rolled_back_at`/`rolled_back_by`.
- Deliberately does NOT delete the new academic_year/classrooms/fee_types rows themselves — only the promotion's enrollment effects — since by the time a rollback is requested other legitimate activity may already reference the new year.

### Step 6 — Fin d'année page, part 1
File: `src/pages/general/FinAnneePage.jsx` (new), route `/fin-annee`, top-level nav item "Fin d'année" (admin-only, both tiers) in `Layout.jsx`, alongside Synchronisation and Utilisateurs — not buried in Paramètres, since it's a major yearly operation.
- Étape 1: automated checklist cards (from Step 2 endpoint), each gate ok/blocked/warning; PLUS a manual toggles section (3 checkboxes: notes vérifiées, bulletins remis, salaires payés — local component state, reset on mount). "Commencer la promotion" stays disabled until every automated gate is "ok" AND every manual toggle is checked. Clicking it opens a plain yes/no `ConfirmModal` ("Êtes-vous sûr de vouloir terminer l'année scolaire ?") before advancing to Étape 2.
- New tab "Examens nationaux" inside the existing `StructureSettingsPage.jsx` (alongside Niveaux/Classes/Matières/Coefficients/Évaluations): per-level `is_exam_cohort` + `exam_name` editor (Step 1's `exam-cohort-levels` endpoints), and the `exam_passing_rules` mode/min_moyenne editor for whichever levels are currently marked as cohorts. Structural config, not a per-run choice — but Étape 1 links to it directly if any exam gate is blocked, so the admin doesn't have to hunt for it.
- Étape 2: exam-results entry grid, one tab per cohort exam type that's NOT `moyenne_only` (skipped entirely if all cohort exams are `moyenne_only`).

### Step 7 — Fin d'année page, part 2
- Étape 3 (Aperçu): table of verdicts, summary counts, excluded-count note, borderline highlighting, inline override (verdict dropdown + mandatory reason field per row).
- Étape 4 (Exécution): recap, "Reporter affectations" toggle (default OFF), type-to-confirm `ConfirmModal`, calls execute, shows result summary.
- Étape 5: post-execution, a "Promotions" history list (past `promotion_runs`) with a rollback button on any within 30 days.

### Step 8 — Smoke test + docs
1. Fresh test data: one classroom per level type (regular + cohort), a mix of admis/doublant/exclu-worthy averages, one excluded and one transferred student (must not appear in preview verdicts), and a level with zero existing classrooms this year (simulates a new/growing school) as a promotion target.
2. Run checklist with sync/PDF/exam-results deliberately missing → confirm each gate blocks correctly; fix each → gate clears. Confirm "Commencer" stays disabled until the 3 manual toggles are also checked, and that reopening Étape 1 resets them. Confirm the double-confirm popup appears before Étape 2.
3. Set one exam type to `exam_only`, one to `both`, leave one `moyenne_only` → confirm Étape 2 only shows entry grids for the non-`moyenne_only` two, and verdicts respect the configured mode. Toggle a level's `is_exam_cohort` on/off in the new Paramètres page and confirm it's reflected in Étape 1/2.
4. Execute → verify new academic_year created+active, classrooms/enrollments/fees correct, doublants stayed in same level, graduates got `status='graduated'` with no new enrollment, excluded/transferred untouched, the zero-classroom target level got its classroom created and `is_active` flipped to 1.
5. Rollback within window → confirm reversal is clean and old year is active again.
6. Non-admin login → no nav item, all `/api/promotion/*` routes 403.
7. Update `phases_completion.md` (Phase 5 → 100%) and `HANDOFF.md`. One commit per step above.

---

## Notes for the executor
- Plan-first gate before each step (3-ish bullets, wait for "y"), one commit per step — same rhythm as Phase 7.
- Backend changes need full `npm run electron:dev` restart; verify with `node --check` (plain `node` can't boot the server — better-sqlite3 is Electron-compiled).
- French UI text, English code comments only where non-obvious.
- Never edit already-applied migrations — 018 is new, additive/rebuild only.
- End every response with `.orange.`
