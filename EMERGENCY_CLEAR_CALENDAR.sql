-- EMERGENCY FIX: Clear all calendar data and start fresh
-- Run this in Supabase SQL Editor

-- Step 1: Clear all calendar scheduling data
UPDATE inbox_queue 
SET calendar_event_id = NULL, 
    scheduled_start = NULL, 
    scheduled_end = NULL,
    execution_status = 'pending'
WHERE calendar_event_id IS NOT NULL;

-- Step 2: Verify it worked
SELECT COUNT(*) as tasks_with_calendar_events
FROM inbox_queue 
WHERE calendar_event_id IS NOT NULL;
-- Should return 0

-- Step 3: Check what tasks you have
SELECT id, subject, execution_status, created_at
FROM inbox_queue
WHERE execution_status IN ('pending', 'approved')
ORDER BY created_at DESC
LIMIT 10;
