# Phase 7 — Sync Engine: Design + Build Steps

> **Author:** designed 2026-07-08, approved by owner. Execute as written — the
> design decisions below were already made; do not re-litigate them.
> **Read first:** HANDOFF.md, phases_completion.md.
> Apps: `scola_desk_v1.0` (sender) | `scola_desk_CAP` (receiver — `/api/sync` route exists, will be extended).

---

## 1. Design Decisions (LOCKED)

| Decision | Choice | Why |
|----------|--------|-----|
| Trigger | Manual only, **admin** button. No automatic/scheduled sync. | Locked V1 constraint. |
| Direction | Upload only (local → CAP). No download/restore in V1. | Backup + telemetry purpose. |
| Strategy | **Full snapshot per sync**, chunked + resumable. NO delta detection in V1. | Delta adds watermark complexity for a few MB of data; year-end sync is full anyway. Delta can come later without contract changes. |
| Chunking | Dynamic task list: one task per (table, page). Page size 500 rows (200 for `assessment_scores` and `report_card_snapshots`). | Resumability granularity + keeps each HTTP request small on slow connections. |
| Resume | `sync_log.checkpoint` stores last completed task index. Re-running resumes from there with the SAME `sync_uid`. | "Reprendre depuis l'étape X/N" UI. |
| Who uploads | The **Express server** does the HTTP calls to CAP (axios, like activation.js). Frontend just starts + polls progress. | Server has the DB; survives UI navigation. |
| CAP storage | New `sync_chunks` table (JSONB payload per task). NOT a relational mirror. | Full relational mirror of 37 tables in Supabase is V2 (ScolaDesk+). JSONB chunks = cloud backup + queryable later. |
| Retention | On successful completion, CAP deletes all chunk sets for that school EXCEPT the 2 most recent `sync_uid`s. | Bounds free-tier storage. |
| Telemetry | Completion call carries `student_count` (live count, `is_deleted = 0`) → CAP updates `licenses.student_count_sync` + `last_sync_at`. | Drives year-end billing reconciliation. |
| Excluded tables | `users` (NEVER send password hashes), `roles`, `permissions`, `role_permissions` (static), `audit_logs` (V1 skip, big/low value), `sync_log` itself, `schema_migrations`. | Security + noise. |
| Auth | `X-ScolaDesk-Secret` header + `school_id` + `hardware_fingerprint` validated by CAP on every call (already implemented in the receiver). | Same as activation. |
| Year-end gate | Helper `hasSuccessfulFullSync(db, withinDays)` reading `sync_log`. Promotion (Phase 5) will call it. | Mandatory checkpoint before promotion. |
| Errors | Any failed task → `sync_log.status = 'partial'`, checkpoint kept, execution stops. UI offers resume. | Rural internet drops mid-sync. |

---

## 2. Data Contract

### Local → CAP: `POST {CAP_URL}/api/sync`  (extends the existing route — keep old fields working)

Headers: `X-ScolaDesk-Secret: {LICENSE_PAYLOAD_SECRET}`

**Chunk upload** (one per task):
```json
{
  "action": "chunk",
  "school_id": "BJ-2026-A4P3",
  "hardware_fingerprint": "sha256...",
  "sync_uid": "uuid-of-this-attempt",
  "sync_type": "full",
  "chunk_index": 12,
  "total_chunks": 41,
  "table_name": "students",
  "page": 0,
  "rows": [ { ...row }, ... ]
}
```

**Completion**:
```json
{
  "action": "complete",
  "school_id": "...", "hardware_fingerprint": "...",
  "sync_uid": "...", "sync_type": "full",
  "total_chunks": 41, "records_sent": 8342,
  "student_count": 612
}
```

**Failure report** (optional, best-effort):
```json
{ "action": "fail", "school_id": "...", "hardware_fingerprint": "...", "sync_uid": "...", "sync_type": "full", "error_message": "..." }
```

Responses: `{ "ok": true }` on chunk; `{ "message": "Synchronisation reçue" }` on complete. Errors follow existing shape (`HARDWARE_MISMATCH` 403 etc.). **Backward compat:** requests WITHOUT `action` keep today's behavior (single sync_records row).

### Tables to sync, in order (each becomes ≥1 task):
```
school_config, license_state, app_settings, academic_years,
levels, series, subjects, level_subjects,
classrooms, classroom_teachers, teachers,
students, guardians, enrollments,
assessment_templates, assessment_scores*,
subject_averages, semester_summaries, semester_decisions,
national_exam_results, timetable_entries, teacher_daily_log,
fee_types, fee_type_amounts, student_fee_selections,
payments, payment_allocations, salary_payments, salary_entries,
expenses, expense_categories, other_revenues, revenue_categories,
ledger_transactions, report_card_snapshots*,
promotion_runs, promotion_details
```
`*` = page size 200; all others 500. Every table: `SELECT * FROM {table}` (no WHERE — full snapshot; soft-deleted rows included on purpose, they're part of the backup).

---

## 3. Build Steps

### Step 1 — Local migration 015 (sync checkpoint fields)
File: `server/db/migration/015_sync_checkpoint.js` (+ register in `server/db/init.js` after 014).
```sql
ALTER TABLE sync_log ADD COLUMN checkpoint INTEGER DEFAULT 0;      -- last completed task index + 1
ALTER TABLE sync_log ADD COLUMN total_chunks INTEGER DEFAULT 0;
ALTER TABLE sync_log ADD COLUMN student_count INTEGER DEFAULT 0;
```
(Use the PRAGMA-guarded ALTER pattern from migration 009. `sync_log` already has sync_uid/status/records_sent/error_message/triggered_by.)

### Step 2 — CAP Supabase migration
File: `scola_desk_CAP/supabase/migrations/009_sync_chunks.sql` (run in Supabase SQL editor):
```sql
CREATE TABLE sync_chunks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    TEXT NOT NULL REFERENCES schools(id),
  sync_uid     TEXT NOT NULL,
  chunk_index  INTEGER NOT NULL,
  table_name   TEXT NOT NULL,
  page         INTEGER NOT NULL DEFAULT 0,
  row_count    INTEGER NOT NULL DEFAULT 0,
  payload      JSONB NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(school_id, sync_uid, chunk_index)
);
CREATE INDEX idx_sync_chunks_school ON sync_chunks(school_id, sync_uid);
ALTER TABLE sync_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full access" ON sync_chunks FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

### Step 3 — CAP receiver extension
File: `scola_desk_CAP/src/app/api/sync/route.js`. Keep existing validation (secret, school lookup, ACTIVE license fingerprint match). Then branch on `body.action`:
- `'chunk'` → upsert into `sync_chunks` (`onConflict: 'school_id,sync_uid,chunk_index'`), return `{ ok: true }`. Do NOT write sync_records per chunk.
- `'complete'` → insert `sync_records` row (status 'success', records_sent, `actual_student_count`), update `licenses` (`student_count_sync`, `last_sync_at`), then retention: `SELECT DISTINCT sync_uid FROM sync_chunks WHERE school_id = ...` ordered by max(created_at) desc → delete chunks of all but the 2 newest sync_uids.
- `'fail'` → insert `sync_records` row status 'failed' with error_message.
- no `action` → existing behavior unchanged.

### Step 4 — Local sync engine
File: `server/routes/sync.js` (new), registered in `server/index.js` as `app.use('/api/sync', ...)`.
All routes `requireAuth` + admin-only (`req.user.role_name !== 'admin'` → 403). NOT requirePro — sync is a core feature for both tiers.

Module-level in-memory run state (single school PC, one sync at a time):
```js
let running = null // { syncUid, currentTask, totalTasks, currentLabel, error }
```

- **`buildTaskList(db)`**: for each table in §2 order → `SELECT COUNT(*)`, split into pages → `[{ table, page, offset, limit, label }]`. Label in French for the UI (e.g. "Élèves (2/3)").
- **`GET /status`**: last `sync_log` rows (5 most recent), last success date, whether a resumable partial exists (latest row status 'partial'), `running` snapshot if active.
- **`POST /start`** body `{ resume: boolean }`:
  - refuse if `running` (409).
  - resume=true and latest sync_log is 'partial' → reuse its sync_uid + checkpoint; else create new sync_log row (sync_uid = generateUUID(), sync_type 'full', status 'pending', triggered_by).
  - kick off async runner (do NOT await; respond `{ started: true, sync_uid }` immediately).
- **Runner** (async function): builds task list, iterates from checkpoint; for each task: `SELECT * FROM {table} LIMIT ? OFFSET ?` → axios POST chunk to `${CAP_URL}/api/sync` (CAP_URL + PAYLOAD_SECRET read like activation.js; school_id from license_state, fingerprint from license_state.hardware_fingerprint); on success update sync_log checkpoint/records_sent and `running.currentTask`. On error: sync_log status 'partial', error_message, best-effort 'fail' POST, clear `running`. After last task: POST 'complete' with live student_count → sync_log status 'success', completed_at, and `UPDATE license_state SET last_sync_at = datetime('now')`. Clear `running`.
  - Table name whitelist = the hardcoded §2 array. Never interpolate user input into SQL.
- **`GET /progress`**: `{ running: bool, current, total, label, last_result }` — UI polls every 1s while running.
- **Helper export** `hasSuccessfulFullSync(db, withinDays)` for Phase 5.

### Step 5 — Sync UI
File: `src/pages/settings/SyncPage.jsx` (new), route `/sync` in App.jsx, nav item "Synchronisation" next to Paramètres in `Layout.jsx` (admin-only, all tiers), cloud icon.
- Card: "Dernière synchronisation réussie : {date}" (or "Jamais").
- Button "Synchroniser maintenant" (disabled while running). If latest is partial: amber box "Synchronisation interrompue à l'étape X/N" + button "Reprendre".
- While running: progress bar `current/total` + label ("Envoi : Élèves (2/3)..."), poll `/api/sync/progress` every 1s.
- On failure: red message with error + Reprendre. On success: green "Synchronisation terminée — N enregistrements envoyés".
- Info note: "Nécessite une connexion internet. Recommandé chaque samedi. Obligatoire avant la promotion de fin d'année."

### Step 6 — Smoke test (manual)
1. Run CAP locally (`npm run dev`, port 3001) with same LICENSE_PAYLOAD_SECRET.
2. Admin → Synchronisation → Synchroniser → progress advances through all tasks → success.
3. Supabase: `sync_chunks` has rows for this sync_uid; `sync_records` has one success row; `licenses.student_count_sync` = current count; CAP school detail page shows last sync.
4. Kill CAP mid-sync → status partial at step X → restart CAP → Reprendre → completes, no duplicate chunks (upsert).
5. Verify NO `users` rows anywhere in sync_chunks payloads.
6. Non-admin login → no Synchronisation nav; POST /api/sync/start → 403.
7. Sync twice more → oldest sync_uid's chunks deleted (retention = 2).

### Step 7 — Docs
Update `phases_completion.md` (Phase 7 section → items done) and `HANDOFF.md` §3/§5. One git commit per step above.

---

## Notes for the executor
- Follow SYSTEM_ARCHITECTURE.md: plan-first gate with the user, no new npm packages (axios already installed), never edit applied migrations.
- Backend changes need full `npm run electron:dev` restart; verify syntax with `node --check` / esbuild (plain `node` cannot boot the server — better-sqlite3 is Electron-compiled).
- French UI text, English code. End every response with `.orange.`
