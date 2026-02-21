# Incident Log: Calendar Scheduling (Jan 2026)

## Incident 1: The "Flood" (Jan 27)

### Symptom
Hundreds of historical tasks suddenly appeared on the calendar, all scheduled for "Today", causing massive overlaps.

### Root Cause
1. **Unbounded Query:** A new helper function, `fixStuckTasks`, queried for `status='approved'` tasks that were `execution_status='pending'`. It lacked a date filter, so it picked up every abandoned task from project inception.
2. **Clamp-to-Now:** The scheduling logic (`execution.ts`) clamps past deadlines to "Now" to ensure tasks are actionable.
3. **Auto-Trigger:** The dashboard `RefreshButton` triggered this fix function automatically.

### Resolution
- **Code Fix:** Added `.gt('created_at', 48h)` filter to `fixStuckTasks`.
- **Cleanup:** Ran DB scripts to clear `scheduled_start` for these flooded sessions.

---

## Incident 2: The "Zombies / Ghosts" (Jan 28-29)

### Symptom
User deleted the flooded events from Google Calendar manually to clean up. However, the App continued to show them as active blue blocks.

### Root Cause
1. **State Drift:** Google Calendar marks deleted events as `status: 'cancelled'` (and hides them). The App's database still had `calendar_event_id` and `scheduled_start`.
2. **Naive Sync:** The App assumed "If I have an ID, the event exists." It did not check for `cancelled` status.
3. **Lack of Webhooks:** No real-time signal told the App the user had deleted the event.

### Resolution
- **Cleanup:** Ran a sync script for Jan 28, Jan 29, and the next 30 days.
- **Logic:** The script checked each task's Google Event status. If `cancelled` or `404`, it wiped the DB schedule.
- **Prevention:** Documentation updated (`CALENDAR_SCHEDULING.md`) to mandate status checks in future sync logic.
