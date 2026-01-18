-- Add missing columns for Execution Engine (Phase 3c)
ALTER TABLE inbox_queue ADD COLUMN IF NOT EXISTS calendar_event_id text;
ALTER TABLE inbox_queue ADD COLUMN IF NOT EXISTS scheduled_start timestamp with time zone;
ALTER TABLE inbox_queue ADD COLUMN IF NOT EXISTS scheduled_end timestamp with time zone;
ALTER TABLE inbox_queue ADD COLUMN IF NOT EXISTS execution_status text CHECK (execution_status IN ('pending', 'scheduled', 'failed', 'skipped'));
ALTER TABLE inbox_queue ADD COLUMN IF NOT EXISTS trello_card_id text;
ALTER TABLE inbox_queue ADD COLUMN IF NOT EXISTS trello_card_url text;
ALTER TABLE inbox_queue ADD COLUMN IF NOT EXISTS executed_at timestamp with time zone;

-- Index for execution status
CREATE INDEX IF NOT EXISTS idx_inbox_execution_status ON inbox_queue(execution_status);
