-- Phase 10: Multi-Session Priority Escalation
-- Add priority column to task_sessions for protecting later sessions from bumping
-- Sessions in the last 50% are marked as Critical so they can't be bumped

-- Add priority column to task_sessions
ALTER TABLE task_sessions ADD COLUMN IF NOT EXISTS priority text DEFAULT 'Normal' 
    CHECK (priority IN ('Critical', 'High', 'Normal', 'Low'));

-- Add comment for documentation
COMMENT ON COLUMN task_sessions.priority IS 'Session priority - last 50% of sessions are marked Critical to prevent bumping';
