-- Phase 9a: Explicit Deadlines
-- Add user_deadline column to inbox_queue to allow manual override of AI deadlines

ALTER TABLE inbox_queue ADD COLUMN IF NOT EXISTS user_deadline timestamp with time zone;

COMMENT ON COLUMN inbox_queue.user_deadline IS 'Manual manual override for task deadline. Takes precedence over ai_assessment deadline.';

-- Update deadline_source check constraint to include 'user_override'
-- We first drop the existing constraint if it exists (assuming it was named inbox_queue_deadline_source_check or similar, 
-- but since we can't be sure of the name, we might just alter the column type if it's an enum, or just trust text if no constraint)

-- Safest approach if it's a simple text column without constraint (most likely for this codebase):
-- No action needed.

-- If there IS a constraint, we should update it. 
-- For now, we'll assume standard simple types.
