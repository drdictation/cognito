# Cognito Calendar Scheduling Logic Documentation

## Phase 10: Intelligent Scheduling (v2)

The Cognito scheduler manages task scheduling using advanced rules for bumping, conflict resolution, and deadline management.

---

## Core Concepts

### 1. Bumping Logic ("Deadline is King")

A task can bump an existing Cognito event if:
1. **Priority Rule:** The new task has higher priority (e.g., High bumps Normal).
2. **Deadline Rule:** The new task has a **sooner deadline** than the existing event, regardless of priority (e.g., Low priority due today bumps High priority due next week).

| Priority | Can Bump |
|----------|----------|
| **Critical** | Bumps ALL lower priorities + conflicts with sooner deadlines |
| **High** | Bumps Normal, Low + conflicts with sooner deadlines |
| **Normal** | Bumps Low + conflicts with sooner deadlines |
| **Low** | Bumps conflicts with sooner deadlines |

### 2. Protected Calendars

These calendars are **never** scheduled over or bumped. They represent hard constraints.

- **ICLOUD** (Clinical sessions)
- **SVHA** (St Vincent's Hospital)
- **UNIMELB** (University of Melbourne)
- **FAMILY** (Shared family calendar)

### 3. Conflict Resolution

#### For Critical Tasks
1. **Prefer Clear Slot:** Looks for a free slot first.
2. **Bump Lower Priority:** Bumps High/Normal/Low tasks if needed.
3. **Double-Booking Fallback:** If *no* slot is found (e.g., calendar full of other Critical tasks or Protected events):
   - **Force-schedules** into the earliest available window.
   - Triggers a **Double-Book Warning** on the dashboard.
   - Does *not* bump other Critical tasks.

#### For Non-Critical Tasks
- Must find a slot where **ALL** conflicts are either:
  - Non-protected (can be bumped) AND
  - Lower priority (or have later deadline)
- If any conflict is protected or higher priority/sooner deadline, the slot is skipped.

---

## Multi-Session Tasks

For tasks split into multiple sessions (e.g., 4 sessions for a presentation):
- **Phased Priority:** The last **50%** of sessions are automatically marked as **Critical**.
- **Reason:** Ensures the final preparation steps validly bump earlier work and are not displaced by incoming requests.

---

## Database Tables

### `protected_calendars`
Stores exact names of calendars that cannot be touched.

### `inbox_queue`
- `double_book_warning`: Stores the warning message if a Critical task had to force-schedule.

### `task_sessions`
- `priority`: Stores the session-specific priority (Critical for last 50%).

---

## Debugging

### "Double-Booked" Warning
- Means a Critical task could not find a clean slot or bumpable candidate.
- It was forced into a slot that likely overlaps with another Critical or Protected event.
- **Action:** User must manually resolve the specific conflict on Google Calendar.

### Bumped Events
- When an event is bumped, it is rescheduled with a **2-week extended deadline** to ensure it finds a new home without failing.
- It will likely move to the next available free day (e.g., next week) if the current week is packed.
