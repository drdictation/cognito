-- =====================================================
-- COGNITO PHASE 10: Enhanced Calendar Protection
-- =====================================================
-- Features:
-- 1. Add SVHA, UNIMELB, and Family to protected calendars
-- 2. These calendars cannot be bumped or scheduled over

-- Add protected calendars (case-insensitive matching used in code)
INSERT INTO protected_calendars (calendar_name, description) VALUES
  ('SVHA', 'St Vincent''s Hospital calendar - protected'),
  ('UNIMELB', 'University of Melbourne calendar - protected'),
  ('FAMILY', 'Family calendar (iCloud shared) - protected')
ON CONFLICT (calendar_name) DO NOTHING;

-- Verify the insert
SELECT * FROM protected_calendars;
