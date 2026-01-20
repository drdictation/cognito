-- Phase 10: Double Booking Warning
-- Add column to store warning message when a Critical task is force-scheduled

ALTER TABLE inbox_queue ADD COLUMN IF NOT EXISTS double_book_warning text;

-- Add comment for documentation
COMMENT ON COLUMN inbox_queue.double_book_warning IS 'Warning message if the task was double-booked due to lack of available slots';
