-- Create blocklist table for tracking blocked senders
CREATE TABLE IF NOT EXISTS blocklist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_pattern TEXT NOT NULL, -- The specific email or domain to block
    reason TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- Prevent duplicate patterns
    CONSTRAINT blocklist_email_pattern_key UNIQUE (email_pattern)
);

-- Enable RLS
ALTER TABLE blocklist ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to manage blocklist (assuming admin access)
CREATE POLICY "Allow authenticated users to select blocklist" ON blocklist
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to insert blocklist" ON blocklist
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update blocklist" ON blocklist
    FOR UPDATE TO authenticated USING (true);

-- Add real_sender index if not exists (helpful for blocklist checks)
CREATE INDEX IF NOT EXISTS idx_inbox_queue_real_sender ON inbox_queue(real_sender);
