# Cognito Deep Audit (2026-01-30)

## Scope
Focused audit of core ingestion, LLM, scheduling, execution, calendar/time tracking, and incident-related safeguards in `dashboard/` plus relevant migrations/docs. This report assumes the app is single-user unless noted.

## High-impact findings

1) **LLM model mismatch vs documented strict rule**
- **Where**: `dashboard/lib/services/llm.ts:120`, `dashboard/lib/services/ingestion.ts:226-238`
- **Issue**: Code uses `gemini-2.0-flash-lite` but docs and prompt say “2.5+ only.” `model_used` is hardcoded to 2.0. Learning uses 2.5, so telemetry is inconsistent.
- **Impact**: Lower quality assessments than expected; inconsistent analytics and debugging.
- **Fix**: Centralize model name (env var), update both model call and `model_used` to match.
- **Alternative**: Update docs/strict rule if 2.0 is intentional.

2) **Calendar view query returns all scheduled tasks (date filter removed)**
- **Where**: `dashboard/lib/actions/time-tracking.ts:266-291`
- **Issue**: `scheduled_start` date filters are commented out; duplicate `.not()` call. Calendar page can show tasks from any day and scales poorly.
- **Impact**: Incorrect calendar view, heavy DB load.
- **Fix**: Re-enable date filtering with correct timezone handling, or use `v_today_calendar`.
- **Alternative**: Filter in SQL using `DATE(scheduled_start)` with timezone conversion.

3) **Timezone errors in scheduling and No‑Fly Zone**
- **Where**: `dashboard/lib/services/ingestion.ts:152-187`, `dashboard/lib/services/calendar-intelligence.ts:312-334, 494-525`
- **Issue**: No‑Fly Zone uses server local time (UTC on Vercel). Scheduler uses `current.getDay()` (server tz) and in double‑book fallback uses `setHours` in server tz, not Melbourne.
- **Impact**: No‑Fly Zone triggers at wrong times; scheduling windows/weekday logic can drift.
- **Fix**: Compute Melbourne day/hour with `Intl.DateTimeFormat` or `date-fns-tz`/`luxon` and use it consistently.
- **Alternative**: Store no‑fly windows and scheduling windows in DB and evaluate in SQL with `AT TIME ZONE`.

4) **Bumped events don’t update `inbox_queue`**
- **Where**: `dashboard/lib/services/calendar-intelligence.ts:549-600`, `dashboard/lib/services/execution.ts:421-477`
- **Issue**: `bumpEvent` updates Google + `cognito_events`, but not the corresponding `inbox_queue.scheduled_start/scheduled_end`.
- **Impact**: UI can show stale times; future scheduling decisions based on `inbox_queue` can drift.
- **Fix**: Update `inbox_queue` for the bumped task(s) after each bump.
- **Alternative**: Make `cognito_events` the single source of truth for scheduled times.

5) **Detected all‑day events are created with same start/end date**
- **Where**: `dashboard/lib/actions/calendar-events.ts:63-87`
- **Issue**: For all‑day events, `end.date` should be the next day (exclusive). Currently uses same date for start and end.
- **Impact**: Zero‑length all‑day events or incorrect rendering.
- **Fix**: Set end date to start date + 1 day.

## Medium findings

6) **AIAssessment schema mismatch for drafting**
- **Where**: `dashboard/lib/services/llm.ts`, `dashboard/lib/types/database.ts`, `dashboard/lib/services/ingestion.ts:233-236`
- **Issue**: `is_simple_response` and `draft_response` are used but not specified in the LLM JSON schema or `AIAssessment` type.
- **Impact**: Drafting features may silently degrade; fields likely always null.
- **Fix**: Add fields to prompt + `AIAssessment`, parse and validate them.
- **Alternative**: Remove usage if feature is intentionally disabled.

7) **Type/schema drift for `deadline_source`**
- **Where**: `dashboard/lib/types/database.ts:78`, `dashboard/lib/actions/tasks.ts:86-95`, `supabase/migration_phase11b_deadline_constraint.sql`
- **Issue**: Code sets `deadline_source = 'ai_inferred'`, but TS type omits it (migration allows it).
- **Impact**: Type safety loss; potential runtime constraint issues if migration not applied.
- **Fix**: Add `'ai_inferred'` to type and verify migration is applied.

8) **Time log selection is nondeterministic**
- **Where**: `dashboard/lib/actions/time-tracking.ts:266-319`
- **Issue**: `time_logs` join is unordered; `transformTask` uses the first element.
- **Impact**: Active/running log selection can be wrong.
- **Fix**: Order `time_logs` by `started_at desc` in the query.

9) **`getActiveTimeLog` can throw on 0 rows**
- **Where**: `dashboard/lib/actions/time-tracking.ts:217-229`
- **Issue**: `.single()` with no rows produces an error; no try/catch.
- **Impact**: Server action errors for users with no active log.
- **Fix**: Use `.maybeSingle()` or handle error path.

10) **Scheduling logic split across two systems**
- **Where**: `dashboard/lib/services/calendar.ts`, `dashboard/lib/services/calendar-intelligence.ts`, `dashboard/lib/actions/sessions.ts`
- **Issue**: Legacy scheduler (8–9:30pm) still used in `scheduleSession`; main flow uses intelligent scheduler.
- **Impact**: Inconsistent behavior and debugging complexity.
- **Fix**: Consolidate on `calendar-intelligence` or clearly separate use cases.

11) **Conflict checking is expensive and chatty**
- **Where**: `dashboard/lib/services/calendar-intelligence.ts:123-190`
- **Issue**: For each slot, it iterates all calendars and calls `events.list`. It also hits Supabase per event to check protected calendars.
- **Impact**: High latency and API quotas during scheduling; worse for multi-session tasks.
- **Fix**: Preload protected calendars into a `Set`, use Google `freebusy.query`, or cache calendar lists per run.

12) **Boundary overlap logic may bump adjacent events**
- **Where**: `dashboard/lib/services/calendar-intelligence.ts:204-214`
- **Issue**: `gte`/`lte` overlap filters include events that end exactly at `start` or start exactly at `end`.
- **Impact**: Unnecessary bumps for adjacent slots.
- **Fix**: Use strict comparisons or adjust overlap checks.

## Low/cleanup findings

13) **Duplicate return and unreachable line**
- **Where**: `dashboard/lib/actions/calendar-events.ts:232-249`
- **Issue**: `return data || []` appears twice.
- **Fix**: Remove duplicate.

14) **Duplicate `.not('scheduled_start', 'is', null)`**
- **Where**: `dashboard/lib/actions/time-tracking.ts:287-288`
- **Fix**: Remove one.

15) **No‑Fly Zone logging only (no enforcement)**
- **Where**: `dashboard/lib/services/ingestion.ts:331-340`
- **Issue**: Logs “silent ingestion” but still processes and can auto‑execute `COGNITO` tasks.
- **Impact**: Violates documented behavior if strict.
- **Fix**: Skip auto‑execution or defer notifications when in No‑Fly Zone.

16) **`skipSync` parameter unused**
- **Where**: `dashboard/components/CalendarView.tsx`, `dashboard/lib/actions/time-tracking.ts:260-270`
- **Issue**: UI passes `skipSync` but the server action ignores it.
- **Fix**: Remove param or implement conditional Google sync.

## Security / operational risks

- **Unauthenticated server actions**: Server actions use service-role keys (`SUPABASE_SERVICE_ROLE_KEY`) and are callable from the client. If this app is exposed beyond trusted users, actions like `clearAllScheduledTasks`, ingestion, or task updates could be abused.
  - **Fix**: Require auth/authorization checks before destructive actions.

- **Service role key usage in non-`use server` modules**: Several service modules hold service-role clients and could be accidentally imported into client bundles.
  - **Fix**: Keep service-role usage inside server actions or server-only modules.

## Quick wins (recommended order)

1) Fix LLM model + `model_used` consistency.
2) Restore date filtering for calendar view (and remove duplicate `.not`).
3) Normalize timezone handling across No‑Fly Zone and scheduler.
4) Update `deadline_source` type to include `'ai_inferred'`.
5) Update AIAssessment schema to include drafting fields or remove those code paths.
6) Update bump logic to sync `inbox_queue` after bumping.
7) Fix all‑day event end date.

## Suggested follow-up checks

- Confirm `migration_phase11b_deadline_constraint.sql` has run in production.
- Add a small regression test/fixture for time tracking: ensure only one active log per task.
- Profile scheduling of multi-session tasks to validate Google API rate behavior.

## Notes
- The file `incident analysis.md` referenced in your IDE tabs was not found in the repo at the time of this audit.
