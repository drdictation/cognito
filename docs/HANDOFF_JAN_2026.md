# Handoff Document - Jan 30, 2026

## Project Status
**Active Phase:** Phase 10 Post-Incident Stabilization
**Current Health:** ✅ Stable (Calendar Discrepancies Resolved)

## Critical Context: Calendar Scheduling Incident
We recently resolved a major incident where hundreds of historical tasks were re-scheduled for "Today", flooding the calendar.

**Root Causes (Fixed):**
1. `fixStuckTasks` (in `fix-stuck.ts`) ran an **unbounded query** on the `inbox_queue`, picking up ancient tasks.
2. `executeTask` (in `execution.ts`) had logic to **clamp past start dates to NOW**, effectively moving all ancient tasks to the present moment.
3. The Frontend triggered `fixStuckTasks` on every Refresh, causing a feedback loop.

**Sync Discrepancies (Fixed):**
We encountered "Ghost" tasks where the App showed events that were invisible in Google Calendar.
- **Cause:** Events were manually deleted in Google (resulting in `status: 'cancelled'`), but the App DB retained the `scheduled_start`.
- **Fix:** We ran manual cleanup scripts.
- **Lesson:** Any future calendar sync logic **MUST** check if `event.status === 'cancelled'` (Google hides them by default) and clear the local DB record if so.

## Key Files
- `lib/actions/fix-stuck.ts`: Contains the `gt('created_at', 48h)` safeguard. **DO NOT REMOVE THIS FILTER.**
- `lib/services/execution.ts`: Contains the scheduling logic.
- `lib/actions/calendar-overlay.ts`: Fetches Google Events.

## Known Limitations
- **No Two-Way Sync:** If a user deletes an event in Google Calendar, Cognito does not know until we look it up explicitly. We rely on "Overlay" fetching or manual sync scripts.
- **Timezones:** The Server Actions run in Vercel/Node environment (UTC), while User is in Melbourne. Be careful with `new Date()` comparisons.

## Next Steps
- Monitor for any recurrence of "Ghost" tasks.
- Consider implementing a Webhook listener for Google Calendar to handle deletions in real-time.
