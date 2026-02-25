-- =====================================================
-- COGNITO PHASE 12 MIGRATION
-- Ingestion logging for visibility into manual runs
-- =====================================================

create table if not exists ingestion_log (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default now(),
  source text not null default 'manual_sync', -- e.g., 'manual_sync', 'script'
  
  -- Stats
  emails_found int default 0,
  processed int default 0,
  blocked int default 0,
  errors int default 0,
  
  -- Detailed errors: [{subject: '...', error: '...'}, ...]
  error_details jsonb,
  
  -- Performance
  duration_ms int,
  
  -- Overall Status
  status text default 'success' check (status in ('success', 'partial', 'failed'))
);

-- Index for dashboard fetching
create index if not exists idx_ingestion_log_created on ingestion_log(created_at desc);

-- Grant permissions if necessary (adjusting based on standard Supabase setup)
alter table ingestion_log enable row level security;

-- Create policy to allow all operations for service role (which the app uses)
drop policy if exists "Enable all for service role" on ingestion_log;
create policy "Enable all for service role" on ingestion_log
  using (true)
  with check (true);
