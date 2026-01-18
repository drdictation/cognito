-- Add model_used column to inbox_queue
ALTER TABLE inbox_queue
ADD COLUMN IF NOT EXISTS model_used text;

-- Add index for analytics
CREATE INDEX IF NOT EXISTS idx_inbox_model_used ON inbox_queue(model_used);
