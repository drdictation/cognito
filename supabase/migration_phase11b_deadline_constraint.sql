-- Phase 11b: Update deadline_source constraint to allow 'ai_inferred'
-- This is required because we now prioritize the AI inferred deadline if user didn't set one

ALTER TABLE inbox_queue DROP CONSTRAINT IF EXISTS inbox_queue_deadline_source_check;

ALTER TABLE inbox_queue ADD CONSTRAINT inbox_queue_deadline_source_check 
    CHECK (deadline_source IN ('extracted', 'default', 'user_override', 'ai_inferred'));
