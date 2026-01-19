-- Phase 9b: Multi-Session Task Chunking
-- Create task_sessions table for linked work sessions

CREATE TABLE IF NOT EXISTS task_sessions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    parent_task_id uuid REFERENCES inbox_queue(id) ON DELETE CASCADE NOT NULL,
    session_number int NOT NULL,
    title text NOT NULL,
    duration_minutes int NOT NULL DEFAULT 90,
    scheduled_start timestamp with time zone,
    scheduled_end timestamp with time zone,
    google_event_id text,
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'completed', 'skipped')),
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Index for efficient parent task lookups
CREATE INDEX IF NOT EXISTS idx_task_sessions_parent ON task_sessions(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_task_sessions_status ON task_sessions(status);

-- Add comment for documentation
COMMENT ON TABLE task_sessions IS 'Stores linked work sessions for multi-session tasks (e.g., talk preparation split into 4 sessions)';
