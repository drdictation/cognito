-- Phase 5: Intelligent Drafting Assistant
-- Stores the auto-generated draft response for user review

ALTER TABLE inbox_queue
ADD COLUMN IF NOT EXISTS draft_response text,
ADD COLUMN IF NOT EXISTS is_simple_response boolean default false;

-- Index for quickly finding tasks with drafts
CREATE INDEX IF NOT EXISTS idx_inbox_simple_response ON inbox_queue(is_simple_response);
