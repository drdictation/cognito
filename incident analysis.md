Incident Analysis: Task Reappearance and Scheduling Issues
Executive Summary
A recent change intended to fix "stuck" tasks (tasks approved but not on the calendar) inadvertently triggered the re-execution of all historical tasks in that state. This caused old, likely dismissed tasks to reappear. Because these tasks had deadlines in the past, the scheduling logic "clamped" them to the current time, resulting in a massive pile-up of tasks scheduled for "this afternoon and evening".

Root Cause Analysis
1. The Trigger: Unbounded Query in 
fix-stuck.ts
The new 
fixStuckTasks
 function queries the database for any task where: status = 'approved' AND execution_status = 'pending'

// lib/actions/fix-stuck.ts
const { data: stuckTasks, error } = await (supabase
    .from('inbox_queue') as any)
    .select('id, subject, trello_card_id')
    .eq('status', 'approved')
    .eq('execution_status', 'pending')
The Flaw: This query has no date limit. It picked up every task from the beginning of the project that failed to complete execution or was manually abandoned without updating the status in the inbox_queue table.

2. The Mechanism: "Clamp to Now" Logic in 
execution.ts
When these old tasks were re-executed, the system checked their deadlines. Since they are old tasks, their deadlines were likely in the past.

The 
executeTask
 function has a safeguard to prevent scheduling in the past:

// lib/services/execution.ts (Line 407)
if (targetDate < checkNow) {
    console.log(`  Adjusting target date from ${targetDate.toISOString()} to NOW (preventing past scheduling)`)
    targetDate = new Date(checkNow) // <--- CLAMPS TO CURRENT MOMENT
    targetDate.setMinutes(Math.ceil(checkNow.getMinutes() / 30) * 30 + 30)
}
The Result:

The system grabbed (e.g.) 50 old tasks.
It saw they were "due" last month/year.
It decided the best time to do them is RIGHT NOW.
It tried to schedule all 50 tasks for the next available slot today.
This caused the "million overlapping tasks" for this afternoon/evening.
3. Chunked Tasks Moving
For multi-session tasks that were re-executed:

The system perceived them as "new" requests to be scheduled.
It recalculated their schedule based on "NOW".
If a task was meant to be distributed over weeks but the deadline passed (or was clamped), the "Adaptive Cadence" logic would squeeze them all into the remaining time (i.e., immediately), stripping them of their original future dates.
Recommended Fixes (Uncertain/Proposed)
To resolve this without risking further data loss, I suggest the following approach:

1. Immediate: Disable the Auto-Fix
Modify 
RefreshButton.tsx
 to remove the automatic call to 
fixStuckTasks
. This stops the bleeding.

2. Update the Query
Modify 
fix-stuck.ts
 to only look for recent stuck tasks (e.g., created in the last 24-48 hours).

.gt('created_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
3. Add "Dry Run" Capability
The fix tool should probably report what it would do before doing it, or limit itself to fixing 1 task at a time.

4. Cleanup Strategy (For the User)
To clean up the mess:

A script could be written to identify events created today (since the incident started) that are linked to old Inbox Tasks (created > 7 days ago).
These specific calendar events could be bulk-deleted.
Why did this happen now?
The 
RefreshButton
 changes made the 
fixStuckTasks
 run automatically when you refreshed the dashboard. This executed the unsafe query immediately, processing the backlog of historical data all at once.