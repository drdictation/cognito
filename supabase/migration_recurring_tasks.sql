-- =====================================================
-- COGNITO RECURRING TASKS - Phase 3d
-- Stores recurring task templates that auto-generate
-- inbox_queue entries on schedule.
-- =====================================================

-- Table for recurring task templates
CREATE TABLE IF NOT EXISTS recurring_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Task definition
    title TEXT NOT NULL,
    description TEXT,
    domain TEXT DEFAULT 'Admin',  -- Clinical, Research, Admin, Home, Hobby
    priority TEXT DEFAULT 'Normal',  -- Critical, High, Normal, Low
    estimated_minutes INTEGER DEFAULT 30,
    
    -- Recurrence pattern
    recurrence_type TEXT NOT NULL,  -- 'weekly', 'monthly', 'biweekly'
    recurrence_day INTEGER,  -- For weekly: 0=Sun, 6=Sat. For monthly: 1-28 (day of month)
    recurrence_week INTEGER,  -- For monthly: 1=first, 2=second, -1=last week of month
    preferred_time TIME,  -- Preferred time of day (optional)
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    last_generated_at TIMESTAMP WITH TIME ZONE,
    next_due_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    notes TEXT,  -- For LLM context
    tags TEXT[]  -- For categorization
);

-- Index for finding tasks due for generation
CREATE INDEX IF NOT EXISTS idx_recurring_tasks_next_due 
ON recurring_tasks(next_due_at) 
WHERE is_active = TRUE;

-- =====================================================
-- SEED INITIAL RECURRING TASKS
-- Per user request: Manometry, Credit Card, Billings
-- =====================================================

-- 1. Manometry Reporting - 1 hour, weekly
INSERT INTO recurring_tasks (
    title,
    description,
    domain,
    priority,
    estimated_minutes,
    recurrence_type,
    recurrence_day,
    preferred_time,
    next_due_at,
    notes
) VALUES (
    'Manometry Reporting',
    'Complete weekly manometry study reports and documentation.',
    'Clinical',
    'Normal',
    60,
    'weekly',
    0,  -- Sunday
    '20:00:00',  -- 8pm
    (CURRENT_DATE + (7 - EXTRACT(DOW FROM CURRENT_DATE)::INTEGER) % 7 * INTERVAL '1 day')::DATE + TIME '20:00:00',
    'Weekly clinical reporting task. Usually done on Sunday evenings.'
);

-- 2. Pay 28 Degrees Credit Card - 5 mins, monthly
INSERT INTO recurring_tasks (
    title,
    description,
    domain,
    priority,
    estimated_minutes,
    recurrence_type,
    recurrence_day,
    preferred_time,
    next_due_at,
    notes
) VALUES (
    'Pay 28 Degrees Credit Card',
    'Pay monthly 28 Degrees credit card bill.',
    'Admin',
    'High',
    5,
    'monthly',
    28,  -- 28th of each month
    '20:00:00',
    (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '27 days')::DATE + TIME '20:00:00',
    'Monthly bill payment. Quick 5-minute task.'
);

-- 3. Submit Sydenham and Private Billings - 20 mins, monthly
INSERT INTO recurring_tasks (
    title,
    description,
    domain,
    priority,
    estimated_minutes,
    recurrence_type,
    recurrence_day,
    recurrence_week,
    preferred_time,
    next_due_at,
    notes
) VALUES (
    'Submit Sydenham & Private Billings',
    'Submit monthly billings for Sydenham clinic and private practice.',
    'Admin',
    'High',
    20,
    'monthly',
    0,  -- Sunday
    -1,  -- Last week of month
    '20:00:00',
    (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '7 days')::DATE + TIME '20:00:00',
    'Monthly billing submission. Do on last Sunday of each month.'
);

-- View for upcoming recurring tasks
CREATE OR REPLACE VIEW v_recurring_tasks_due AS
SELECT 
    id,
    title,
    description,
    domain,
    priority,
    estimated_minutes,
    recurrence_type,
    next_due_at,
    notes
FROM recurring_tasks
WHERE is_active = TRUE
  AND next_due_at <= NOW() + INTERVAL '7 days'
ORDER BY next_due_at ASC;

-- Function to calculate next due date for a recurring task
CREATE OR REPLACE FUNCTION calculate_next_due_date(
    p_recurrence_type TEXT,
    p_recurrence_day INTEGER,
    p_recurrence_week INTEGER,
    p_current_due TIMESTAMP WITH TIME ZONE
) RETURNS TIMESTAMP WITH TIME ZONE AS $$
DECLARE
    v_next_due TIMESTAMP WITH TIME ZONE;
BEGIN
    CASE p_recurrence_type
        WHEN 'weekly' THEN
            v_next_due := p_current_due + INTERVAL '7 days';
        WHEN 'biweekly' THEN
            v_next_due := p_current_due + INTERVAL '14 days';
        WHEN 'monthly' THEN
            IF p_recurrence_week IS NOT NULL THEN
                -- Nth weekday of month (e.g., last Sunday)
                -- Simplified: just add 4 weeks
                v_next_due := p_current_due + INTERVAL '4 weeks';
            ELSE
                -- Specific day of month
                v_next_due := p_current_due + INTERVAL '1 month';
            END IF;
        ELSE
            v_next_due := p_current_due + INTERVAL '7 days';
    END CASE;
    
    RETURN v_next_due;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on changes
CREATE OR REPLACE FUNCTION update_recurring_tasks_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS recurring_tasks_updated_at ON recurring_tasks;
CREATE TRIGGER recurring_tasks_updated_at
    BEFORE UPDATE ON recurring_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_recurring_tasks_timestamp();
