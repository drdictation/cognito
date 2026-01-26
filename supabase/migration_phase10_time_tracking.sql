-- =====================================================
-- PHASE 10: NATIVE CALENDAR & TIME TRACKING
-- Adds time tracking for learning and optimization
-- =====================================================

-- Time Logs Table: Track actual vs estimated time for ML
CREATE TABLE IF NOT EXISTS time_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID REFERENCES inbox_queue(id) ON DELETE CASCADE,
  session_id UUID REFERENCES task_sessions(id) ON DELETE CASCADE,
  
  -- Timing data
  started_at TIMESTAMPTZ NOT NULL,
  paused_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  elapsed_seconds INT DEFAULT 0,
  
  -- Learning features
  ai_estimated_minutes INT,
  actual_minutes INT,
  accuracy_ratio DECIMAL(5,2),  -- actual/estimated for ML
  
  -- Context for ML
  domain TEXT,
  priority TEXT,
  day_of_week INT,              -- 0-6 (Sunday-Saturday)
  time_of_day TEXT,             -- 'morning', 'afternoon', 'evening'
  
  -- State
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'paused', 'completed')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance and learning queries
CREATE INDEX IF NOT EXISTS idx_time_logs_task ON time_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_session ON time_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_status ON time_logs(status);
CREATE INDEX IF NOT EXISTS idx_time_logs_domain ON time_logs(domain);
CREATE INDEX IF NOT EXISTS idx_time_logs_completed ON time_logs(completed_at);
CREATE INDEX IF NOT EXISTS idx_time_logs_accuracy ON time_logs(accuracy_ratio) WHERE accuracy_ratio IS NOT NULL;

-- Add columns to inbox_queue for completion tracking
ALTER TABLE inbox_queue 
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS actual_duration_minutes INT,
  ADD COLUMN IF NOT EXISTS time_accuracy_ratio DECIMAL(5,2);

-- View for weekly stats
CREATE OR REPLACE VIEW v_weekly_stats AS
SELECT 
  DATE_TRUNC('week', completed_at) as week_start,
  COUNT(*) as tasks_completed,
  SUM(actual_minutes) as total_minutes,
  AVG(accuracy_ratio) as avg_accuracy,
  domain,
  priority
FROM time_logs
WHERE status = 'completed'
  AND completed_at >= NOW() - INTERVAL '4 weeks'
GROUP BY DATE_TRUNC('week', completed_at), domain, priority
ORDER BY week_start DESC;

-- View for today's calendar
CREATE OR REPLACE VIEW v_today_calendar AS
SELECT 
  iq.id,
  iq.subject,
  iq.ai_domain,
  iq.ai_priority,
  iq.ai_estimated_minutes,
  iq.scheduled_start,
  iq.scheduled_end,
  iq.trello_card_url,
  iq.calendar_event_id,
  tl.id as active_time_log_id,
  tl.status as tracking_status,
  tl.started_at,
  tl.elapsed_seconds,
  CASE 
    WHEN tl.status = 'completed' THEN 'completed'
    WHEN tl.status = 'running' THEN 'running'
    WHEN tl.status = 'paused' THEN 'paused'
    ELSE 'scheduled'
  END as block_status
FROM inbox_queue iq
LEFT JOIN time_logs tl ON iq.id = tl.task_id AND tl.status IN ('running', 'paused', 'completed')
WHERE iq.scheduled_start IS NOT NULL
  AND DATE(iq.scheduled_start) = CURRENT_DATE
ORDER BY iq.scheduled_start;

COMMENT ON TABLE time_logs IS 'Phase 10: Tracks actual time spent on tasks for AI learning and optimization';
COMMENT ON COLUMN time_logs.accuracy_ratio IS 'Actual/Estimated ratio - used for ML to improve future estimates';
COMMENT ON COLUMN time_logs.day_of_week IS '0=Sunday, 6=Saturday - for time-of-day pattern learning';
