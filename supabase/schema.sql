-- =====================================================
-- COGNITO v1 DATABASE SCHEMA
-- Phase 1: Ingestion Pipeline with Decision Support
-- =====================================================

-- Users (Single user initially, expandable later)
create table if not exists users (
  id uuid references auth.users not null primary key,
  email text unique not null,
  created_at timestamp with time zone default now()
);

-- =====================================================
-- DOMAIN TAXONOMY
-- Maps to domain_map.md categories
-- =====================================================
create table if not exists domains (
  id uuid default gen_random_uuid() primary key,
  name text not null unique, -- "Clinical", "Research", "Admin", "Home", "Hobby"
  parent_domain text, -- For hierarchical categorization
  is_weekend_allowed boolean default false,
  description text
);

-- Insert default domains from PRD
insert into domains (name, is_weekend_allowed, description) values
  ('Clinical', true, 'Patient care, IBD clinic, ward service, endoscopy'),
  ('Research', false, 'PhD supervision, studies, publications'),
  ('Admin', false, 'Committees, forms, rostering'),
  ('Home', true, 'School, kids sport, social events'),
  ('Hobby', true, 'Micro-SaaS projects, coding, DrDictation')
on conflict (name) do nothing;

-- =====================================================
-- BLOCKLIST - Spam/Newsletter Filtering (PRD Req)
-- =====================================================
create table if not exists blocklist (
  id uuid default gen_random_uuid() primary key,
  email_pattern text not null unique, -- e.g., 'noreply@', '%newsletter%'
  reason text,
  created_at timestamp with time zone default now(),
  is_active boolean default true
);

-- Common blocklist patterns
insert into blocklist (email_pattern, reason) values
  ('%noreply%', 'Automated no-reply addresses'),
  ('%newsletter%', 'Newsletter subscriptions'),
  ('%notifications%', 'Service notifications'),
  ('%do-not-reply%', 'Automated messages')
on conflict (email_pattern) do nothing;

-- =====================================================
-- CONSTRAINTS - No-Fly Zone & Rules (PRD Req)
-- =====================================================
create table if not exists constraints (
  id uuid default gen_random_uuid() primary key,
  constraint_type text not null, -- 'no_fly_zone', 'capacity_limit'
  start_time time, -- e.g., '17:00' for Friday evening
  end_time time, -- e.g., '18:00' for Sunday evening
  days_of_week text[], -- ['friday', 'saturday', 'sunday']
  bypass_domains text[], -- Domains exempt from constraint: ['Home', 'Social']
  is_active boolean default true,
  description text
);

-- Insert No-Fly Zone from PRD: Friday 17:00 - Sunday 18:00
insert into constraints (constraint_type, start_time, end_time, days_of_week, bypass_domains, description) values
  ('no_fly_zone', '17:00', '23:59', ARRAY['friday'], ARRAY['Home', 'Hobby'], 'Friday evening quiet time'),
  ('no_fly_zone', '00:00', '23:59', ARRAY['saturday', 'sunday'], ARRAY['Home', 'Hobby'], 'Weekend quiet time (until Sunday 18:00)'),
  ('no_fly_zone', '00:00', '18:00', ARRAY['sunday'], ARRAY['Home', 'Hobby'], 'Sunday quiet time ends at 18:00')
on conflict do nothing;

-- =====================================================
-- INBOX QUEUE - The Staging Area (Enhanced)
-- Where AI proposals await user approval
-- =====================================================
create table if not exists inbox_queue (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default now(),
  
  -- Email Source Tracking
  message_id text unique not null, -- Gmail message ID for deduplication
  original_source_email text, -- Which of 6 accounts: 'gmail_a_personal', 'gmail_b_project', etc.
  real_sender text not null, -- Actual email sender (extracted from forwarded email)
  subject text,
  received_at timestamp with time zone, -- Original email timestamp
  
  -- Content
  source text not null, -- 'email', 'voice'
  original_content text not null, -- Full email body or voice transcript
  forwarded_from text, -- Header extraction: X-Forwarded-For
  
  -- AI Assessment (Structured JSONB)
  ai_assessment jsonb, -- {domain, priority, summary, reasoning, suggested_action, estimated_minutes}
  
  -- Individual fields for easy querying (denormalized from ai_assessment)
  ai_domain text, -- "Clinical", "Research", "Admin", "Home", "Hobby"
  ai_priority text, -- "Critical", "High", "Normal", "Low"
  ai_summary text,
  ai_suggested_action text,
  ai_estimated_minutes int,
  
  -- Workflow Status
  status text default 'pending' check (status in ('pending', 'approved', 'rejected', 'snoozed')),
  snoozed_until timestamp with time zone,
  
  -- Error Handling
  processing_error text,
  retry_count int default 0
);

-- Indexes for performance
create index if not exists idx_inbox_status on inbox_queue(status);
create index if not exists idx_inbox_domain on inbox_queue(ai_domain);
create index if not exists idx_inbox_priority on inbox_queue(ai_priority);
create index if not exists idx_inbox_created on inbox_queue(created_at desc);
create index if not exists idx_inbox_message_id on inbox_queue(message_id);

-- =====================================================
-- DECISION LOG - Learning from User Corrections
-- Tracks when user changes AI suggestions (for v2)
-- =====================================================
create table if not exists decision_log (
  id uuid default gen_random_uuid() primary key,
  task_id uuid references inbox_queue(id) on delete cascade,
  ai_prediction jsonb not null, -- What AI originally suggested
  user_correction jsonb, -- What user changed it to
  correction_type text, -- 'priority', 'domain', 'action'
  timestamp timestamp with time zone default now()
);

-- =====================================================
-- EMAIL SOURCE MAPPINGS
-- Maps sender domains to original source accounts
-- =====================================================
create table if not exists email_source_mappings (
  id uuid default gen_random_uuid() primary key,
  source_identifier text not null unique, -- 'gmail_a_personal', 'ms365_hospital', etc.
  domain_patterns text[], -- ['@gmail.com'], ['@hospital.org.au']
  default_category text, -- Default domain if AI can't determine
  description text,
  is_active boolean default true
);

-- Insert the 6 email sources from architecture
insert into email_source_mappings (source_identifier, domain_patterns, default_category, description) values
  ('ms365_hospital', ARRAY['@hospital.org.au', '@health.vic.gov.au'], 'Clinical', 'Public hospital email'),
  ('ms365_university', ARRAY['@unimelb.edu.au'], 'Research', 'University of Melbourne'),
  ('gmail_private_practice', ARRAY['@privatepractice.com.au'], 'Clinical', 'Private consulting'),
  ('gmail_project', ARRAY['@project-domain.com'], 'Hobby', 'Project/dev email'),
  ('gmail_personal', ARRAY['@gmail.com'], 'Home', 'Personal Gmail'),
  ('hotmail_legacy', ARRAY['@hotmail.com', '@outlook.com'], 'Home', 'Legacy personal email')
on conflict (source_identifier) do nothing;

-- =====================================================
-- VIEWS FOR QUERYING
-- =====================================================

-- Active tasks pending user review
create or replace view v_pending_tasks as
select 
  id,
  created_at,
  subject,
  real_sender,
  ai_domain,
  ai_priority,
  ai_summary,
  ai_suggested_action,
  ai_estimated_minutes
from inbox_queue
where status = 'pending'
order by 
  case ai_priority
    when 'Critical' then 1
    when 'High' then 2
    when 'Normal' then 3
    when 'Low' then 4
  end,
  created_at desc;

-- Daily briefing view (grouped by domain)
create or replace view v_daily_briefing as
select 
  ai_domain as domain,
  count(*) as task_count,
  sum(ai_estimated_minutes) as total_minutes,
  array_agg(json_build_object(
    'id', id,
    'subject', subject,
    'priority', ai_priority,
    'summary', ai_summary
  ) order by ai_priority) as tasks
from inbox_queue
where status = 'pending'
group by ai_domain;