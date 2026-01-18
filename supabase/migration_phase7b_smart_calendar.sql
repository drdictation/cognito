-- =====================================================
-- COGNITO PHASE 7b: Smart Calendar System
-- =====================================================
-- Features:
-- 1. Smart calendar event detection from emails
-- 2. Priority-based calendar bumping
-- 3. Configurable scheduling windows
-- 4. Protected calendar management

-- 1. Add deadline and calendar event detection columns to inbox_queue
ALTER TABLE inbox_queue ADD COLUMN IF NOT EXISTS deadline timestamp with time zone;
ALTER TABLE inbox_queue ADD COLUMN IF NOT EXISTS deadline_source text CHECK (deadline_source IN ('extracted', 'default'));

-- 2. Create detected_events table for AI-detected calendar events
CREATE TABLE IF NOT EXISTS detected_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid REFERENCES inbox_queue(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('meeting', 'deadline', 'appointment', 'reminder')),
  title text NOT NULL,
  proposed_start timestamp with time zone,
  proposed_end timestamp with time zone,
  duration_minutes int DEFAULT 45,
  location text,
  attendees text[],
  is_all_day boolean DEFAULT false,
  confidence decimal(3,2) DEFAULT 0.5,
  source_text text,  -- Quote from email that triggered detection
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'conflict')),
  conflict_event_id text,  -- Google Calendar event ID of conflicting event
  conflict_summary text,   -- Summary of conflicting event for display
  google_event_id text,    -- Set after creation in Google Calendar
  created_at timestamp with time zone DEFAULT now()
);

-- 3. Create cognito_events table to track bumpable Focus Time blocks
CREATE TABLE IF NOT EXISTS cognito_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid REFERENCES inbox_queue(id) ON DELETE SET NULL,
  google_event_id text NOT NULL UNIQUE,
  title text NOT NULL,
  scheduled_start timestamp with time zone NOT NULL,
  scheduled_end timestamp with time zone NOT NULL,
  priority text NOT NULL CHECK (priority IN ('Critical', 'High', 'Normal', 'Low')),
  deadline timestamp with time zone,
  original_start timestamp with time zone,  -- For undo functionality
  original_end timestamp with time zone,
  bumped_by uuid REFERENCES cognito_events(id) ON DELETE SET NULL,  -- What event bumped this
  bump_count int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- 4. Create scheduling_windows table for configurable availability
CREATE TABLE IF NOT EXISTS scheduling_windows (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  day_of_week int NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),  -- 0=Sunday, 6=Saturday
  start_time time NOT NULL,
  end_time time NOT NULL,
  priority_level text DEFAULT 'all' CHECK (priority_level IN ('all', 'critical_only')),
  is_active boolean DEFAULT true,
  description text
);

-- Pre-populate scheduling windows
INSERT INTO scheduling_windows (name, day_of_week, start_time, end_time, priority_level, description) VALUES
  -- Primary windows (8pm-9:30pm Sun-Thu)
  ('Sunday Evening', 0, '20:00', '21:30', 'all', 'Standard Sunday evening slot'),
  ('Monday Evening', 1, '20:00', '21:30', 'all', 'Standard Monday evening slot'),
  ('Tuesday Morning', 2, '09:00', '12:00', 'all', 'Tuesday manometry reports time'),
  ('Tuesday Evening', 2, '20:00', '21:30', 'all', 'Standard Tuesday evening slot'),
  ('Wednesday Evening', 3, '20:00', '21:30', 'all', 'Standard Wednesday evening slot'),
  ('Thursday Evening', 4, '20:00', '21:30', 'all', 'Standard Thursday evening slot'),
  
  -- Critical overflow windows (7:30pm-10pm, only when primary full)
  ('Sunday Critical Overflow Early', 0, '19:30', '20:00', 'critical_only', 'Critical tasks only - before primary'),
  ('Sunday Critical Overflow Late', 0, '21:30', '22:00', 'critical_only', 'Critical tasks only - after primary'),
  ('Monday Critical Overflow Early', 1, '19:30', '20:00', 'critical_only', 'Critical tasks only - before primary'),
  ('Monday Critical Overflow Late', 1, '21:30', '22:00', 'critical_only', 'Critical tasks only - after primary'),
  ('Tuesday Critical Overflow Early', 2, '19:30', '20:00', 'critical_only', 'Critical tasks only - before primary'),
  ('Tuesday Critical Overflow Late', 2, '21:30', '22:00', 'critical_only', 'Critical tasks only - after primary'),
  ('Wednesday Critical Overflow Early', 3, '19:30', '20:00', 'critical_only', 'Critical tasks only - before primary'),
  ('Wednesday Critical Overflow Late', 3, '21:30', '22:00', 'critical_only', 'Critical tasks only - after primary'),
  ('Thursday Critical Overflow Early', 4, '19:30', '20:00', 'critical_only', 'Critical tasks only - before primary'),
  ('Thursday Critical Overflow Late', 4, '21:30', '22:00', 'critical_only', 'Critical tasks only - after primary')
ON CONFLICT DO NOTHING;

-- 5. Create protected_calendars table
CREATE TABLE IF NOT EXISTS protected_calendars (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  calendar_name text NOT NULL UNIQUE,
  description text,
  created_at timestamp with time zone DEFAULT now()
);

-- Insert ICLOUD as protected calendar
INSERT INTO protected_calendars (calendar_name, description) VALUES
  ('ICLOUD', 'Clinical sessions - protected from bumping')
ON CONFLICT (calendar_name) DO NOTHING;

-- 6. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_detected_events_task_id ON detected_events(task_id);
CREATE INDEX IF NOT EXISTS idx_detected_events_status ON detected_events(status);
CREATE INDEX IF NOT EXISTS idx_cognito_events_task_id ON cognito_events(task_id);
CREATE INDEX IF NOT EXISTS idx_cognito_events_google_id ON cognito_events(google_event_id);
CREATE INDEX IF NOT EXISTS idx_cognito_events_active ON cognito_events(is_active);
CREATE INDEX IF NOT EXISTS idx_scheduling_windows_day ON scheduling_windows(day_of_week, is_active);
CREATE INDEX IF NOT EXISTS idx_inbox_deadline ON inbox_queue(deadline);

-- 7. Enable RLS (Row Level Security)
ALTER TABLE detected_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cognito_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduling_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE protected_calendars ENABLE ROW LEVEL SECURITY;

-- Create policies (single-user system, allow all)
CREATE POLICY "User can manage detected events" ON detected_events FOR ALL USING (true);
CREATE POLICY "User can manage cognito events" ON cognito_events FOR ALL USING (true);
CREATE POLICY "User can manage scheduling windows" ON scheduling_windows FOR ALL USING (true);
CREATE POLICY "User can manage protected calendars" ON protected_calendars FOR ALL USING (true);

-- 8. Create helpful views
CREATE OR REPLACE VIEW v_active_cognito_events AS
SELECT 
  ce.*,
  iq.subject,
  iq.ai_domain
FROM cognito_events ce
LEFT JOIN inbox_queue iq ON ce.task_id = iq.id
WHERE ce.is_active = true
ORDER BY ce.scheduled_start;

CREATE OR REPLACE VIEW v_pending_detected_events AS
SELECT 
  de.*,
  iq.subject,
  iq.real_sender
FROM detected_events de
JOIN inbox_queue iq ON de.task_id = iq.id
WHERE de.status = 'pending'
ORDER BY de.proposed_start;
