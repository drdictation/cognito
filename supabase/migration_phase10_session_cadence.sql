-- Phase 10b: Store Cadence in Session Records
-- This allows the scheduler to read the user-specified spacing between sessions

ALTER TABLE task_sessions ADD COLUMN IF NOT EXISTS cadence_days int DEFAULT 3;

COMMENT ON COLUMN task_sessions.cadence_days IS 'Days between sessions (user configurable, used for backward scheduling from deadline)';
