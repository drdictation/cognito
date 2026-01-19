# Cognito Calendar Scheduling Logic Documentation

## Overview

The Cognito scheduler manages task scheduling and calendar event creation using intelligent rules for finding available time slots, handling conflicts, and bumping lower-priority events when necessary.

---

## Core Concepts

### Scheduling Windows

Scheduling windows are defined in the `scheduling_windows` Supabase table and determine when tasks can be scheduled.

| Column | Description |
|--------|-------------|
| `day_of_week` | 0=Sunday, 1=Monday, ..., 6=Saturday |
| `start_time` | Window start (e.g., "09:00:00") |
| `end_time` | Window end (e.g., "12:00:00") |
| `priority_level` | `'all'` or `'critical_only'` |
| `is_active` | Whether this window is enabled |
| `name` | Human-readable name |

**Current Windows:**
- **Morning windows** (9am-12pm): Available for all priorities
- **Evening windows** (8pm-9:30pm): Available for all priorities  
- **Critical Overflow windows** (7:30pm-8pm, 9:30pm-10pm): Only for Critical tasks

### Priority Levels

| Priority | Value | Bump Order | Default Deadline |
|----------|-------|------------|------------------|
| Critical | 4 | Cannot be bumped | Today 5pm |
| High | 3 | Bumped by Critical | +3 days |
| Normal | 2 | Bumped by Critical, High | +7 days |
| Low | 1 | Bumped by all | +14 days |

---

## Calendar Types & Conflict Rules

### Protected Calendars (ICLOUD)
- **Cannot be scheduled over** under any circumstances
- Typically clinical sessions that are immovable
- Detected by calendar name containing "ICLOUD"

### Non-Protected Calendars (Google, Family, etc.)

| Event Type | Treatment |
|------------|-----------|
| **All-day events** | IGNORED - Can schedule over them |
| **Timed events** | CONFLICT - Cannot schedule over them |

### Cognito-Managed Events
Events created by Cognito are stored in the `cognito_events` table and can be **bumped** to make room for higher-priority tasks.

---

## Slot Finding Algorithm

The `findSlotWithBumping()` function searches for available slots:

```
1. Start from current time, round to next 30-min boundary
2. Search up to deadline (max 14 days)
3. For each day:
   a. Get scheduling windows for that day + priority
   b. Windows are sorted by start_time (morning before evening)
   c. For each window:
      - Skip if current time is past window end
      - Skip if task duration exceeds window size
      - Check for conflicts with Google Calendar
      - Apply conflict resolution rules (see below)
4. If no slot found within deadline, return null
```

---

## Conflict Resolution Rules

### For CRITICAL Tasks

```
IF slot has conflicts:
  1. Check if any conflict is another Critical Cognito event
     → If YES: Skip this slot, try next window
     → If NO: Force-schedule into this slot
  
  2. If force-scheduling:
     - Find any lower-priority Cognito events in the slot
     - Bump them to new slots (with 2-week extended deadline)
     - Create the Critical task's calendar event
```

**Key Behavior:** Critical tasks force-schedule even with personal calendar conflicts (timed family events), but will NOT double-book over other Critical tasks.

### For Non-Critical Tasks (High/Normal/Low)

```
IF slot has conflicts:
  1. Get list of bumpable Cognito events (lower priority)
  2. Check if ALL conflicts are bumpable
     → If YES: Bump them and use this slot
     → If NO: Skip this slot, try next window
```

**Key Behavior:** Non-Critical tasks require ALL conflicts to be bumpable. If any conflict is a personal calendar event or a higher-priority Cognito event, the slot is skipped.

---

## Bumping Logic

When an event needs to be bumped:

1. **Find new slot** for the bumped event using `findSlotWithBumping()`
   - Uses 2-week extended deadline (so it always finds a home)
   - Respects the bumped event's priority for window access
   
2. **Update Google Calendar** via API
   - Move the event to the new time
   
3. **Update Cognito database**
   - Record new `scheduled_start` and `scheduled_end`
   - Store `original_start` and `original_end` for undo
   - Record who bumped it (`bumped_by`)

---

## Why Bumped Events Go Far Into the Future

Looking at the logs, bumped events ended up on Sunday/Monday next week because:

1. **Tuesday Evening** - "Kiran summer school" is a **timed** family event (not all-day), so it's treated as a real conflict
2. **Wednesday Evening** - Same issue plus other Cognito events
3. **Thursday Evening** - Another Critical event already scheduled there
4. **Friday/Saturday** - No scheduling windows defined
5. **Sunday/Monday** - Finally found empty slots

**Root Issue:** If "Kiran summer school" spans multiple days as an all-day event, it should be skipped. But if it appears as a timed event each day, it's treated as a conflict.

---

## Database Tables

### `scheduling_windows`
Defines when tasks can be scheduled.

### `cognito_events`
Tracks Cognito-managed calendar events.

| Column | Description |
|--------|-------------|
| `id` | UUID primary key |
| `task_id` | Reference to inbox_queue |
| `google_event_id` | Google Calendar event ID |
| `title` | Event title |
| `scheduled_start` | Current scheduled start |
| `scheduled_end` | Current scheduled end |
| `original_start` | Original scheduled start (before any bumps) |
| `original_end` | Original scheduled end |
| `priority` | Task priority |
| `deadline` | Task deadline |
| `is_active` | Whether event is still active |
| `bumped_by` | Task ID that caused the bump |
| `bump_count` | Number of times bumped |

---

## Key Functions

| Function | File | Purpose |
|----------|------|---------|
| `scheduleTaskIntelligent()` | calendar-intelligence.ts | Main scheduler entry point |
| `findSlotWithBumping()` | calendar-intelligence.ts | Finds available slot with bump support |
| `getSchedulingWindows()` | calendar-intelligence.ts | Fetches windows from database |
| `getConflicts()` | calendar-intelligence.ts | Gets calendar conflicts for a time range |
| `getBumpableEvents()` | calendar-intelligence.ts | Gets Cognito events that can be bumped |
| `bumpEvent()` | calendar-intelligence.ts | Moves an event to a new slot |
| `getDefaultDeadline()` | calendar-intelligence.ts | Calculates default deadline by priority |

---

## Common Issues & Solutions

### Task not getting calendar event
- Check terminal logs for "No available slot found"
- Verify scheduling windows exist for that day
- Check if deadline is too soon

### Double-booking Critical tasks
- System now checks for existing Critical events before scheduling
- Uses `cognito_events` table with priority='Critical' query

### Bumped events going too far into future
- Check if recurring all-day events are appearing as timed events
- Verify Friday/Saturday/Sunday windows exist if needed

### Events scheduled on wrong days
- Windows are queried fresh for each day
- Check `day_of_week` values in `scheduling_windows` table
