-- =====================================================
-- COGNITO PHASE 3a MIGRATION
-- Adds columns for deadline inference and Trello integration
-- Run this in Supabase SQL Editor
-- =====================================================

-- Add deadline inference columns
ALTER TABLE inbox_queue 
ADD COLUMN IF NOT EXISTS ai_inferred_deadline timestamp with time zone;

ALTER TABLE inbox_queue 
ADD COLUMN IF NOT EXISTS ai_deadline_confidence decimal(3,2);

ALTER TABLE inbox_queue 
ADD COLUMN IF NOT EXISTS ai_deadline_source text;

-- Add execution tracking columns
ALTER TABLE inbox_queue 
ADD COLUMN IF NOT EXISTS execution_status text DEFAULT 'pending'
CHECK (execution_status IN ('pending', 'scheduled', 'completed', 'failed'));

ALTER TABLE inbox_queue 
ADD COLUMN IF NOT EXISTS trello_card_id text;

ALTER TABLE inbox_queue 
ADD COLUMN IF NOT EXISTS trello_card_url text;

ALTER TABLE inbox_queue 
ADD COLUMN IF NOT EXISTS executed_at timestamp with time zone;

-- Future: Calendar integration columns (Phase 3b)
-- ALTER TABLE inbox_queue ADD COLUMN IF NOT EXISTS calendar_event_id text;
-- ALTER TABLE inbox_queue ADD COLUMN IF NOT EXISTS scheduled_start timestamp with time zone;
-- ALTER TABLE inbox_queue ADD COLUMN IF NOT EXISTS scheduled_end timestamp with time zone;

-- Create index for execution status queries
CREATE INDEX IF NOT EXISTS idx_inbox_execution_status ON inbox_queue(execution_status);

-- Create view for tasks ready to execute
CREATE OR REPLACE VIEW v_ready_to_execute AS
SELECT 
  id,
  created_at,
  subject,
  real_sender,
  ai_domain,
  ai_priority,
  ai_summary,
  ai_suggested_action,
  ai_estimated_minutes,
  ai_inferred_deadline,
  ai_deadline_confidence
FROM inbox_queue
WHERE status = 'approved' 
  AND execution_status = 'pending'
ORDER BY 
  CASE ai_priority
    WHEN 'Critical' THEN 1
    WHEN 'High' THEN 2
    WHEN 'Normal' THEN 3
    WHEN 'Low' THEN 4
  END,
  ai_inferred_deadline NULLS LAST,
  created_at DESC;

-- View for executed tasks (history)
CREATE OR REPLACE VIEW v_executed_tasks AS
SELECT 
  id,
  created_at,
  subject,
  ai_domain,
  ai_priority,
  ai_summary,
  trello_card_id,
  trello_card_url,
  executed_at
FROM inbox_queue
WHERE execution_status IN ('scheduled', 'completed')
ORDER BY executed_at DESC;
