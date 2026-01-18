-- =====================================================
-- COGNITO PHASE 7a: Domain Knowledge System
-- =====================================================

-- 1. Create domain_knowledge table
create table if not exists domain_knowledge (
  id uuid default gen_random_uuid() primary key,
  domain text unique not null references domains(name) on delete cascade,
  content text not null,       -- Raw markdown content
  expires_at timestamp with time zone,
  updated_at timestamp with time zone default now()
);

-- 2. Create contacts table
create table if not exists contacts (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  email text,
  role text,
  domain text not null references domains(name) on delete cascade,
  priority_boost text check (priority_boost in ('Critical', 'High', 'Normal', 'Low')),
  notes text,
  created_at timestamp with time zone default now()
);

-- 3. Create knowledge_suggestions table (AI Learning)
create table if not exists knowledge_suggestions (
  id uuid default gen_random_uuid() primary key,
  domain text not null references domains(name) on delete cascade,
  suggestion_type text check (suggestion_type in ('contact', 'priority_rule', 'general')),
  suggested_content text not null,
  source_task_id uuid references inbox_queue(id) on delete set null,
  status text default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamp with time zone default now()
);

-- 4. Enable RLS (Row Level Security)
-- For now, allowing all access as it's a single-user system, matching existing pattern
alter table domain_knowledge enable row level security;
alter table contacts enable row level security;
alter table knowledge_suggestions enable row level security;

create policy "User can manage domain knowledge" on domain_knowledge for all using (true);
create policy "User can manage contacts" on contacts for all using (true);
create policy "User can manage suggestions" on knowledge_suggestions for all using (true);

-- 5. Pre-seed Domain Knowledge
-- Clinical
insert into domain_knowledge (domain, content) values (
  'Clinical',
  E'# Clinical Domain Knowledge\n\n## Key Contacts\n- Pathology Dept — escalate "urgent" in subject line\n- Ward registrar — always high priority\n\n## Active Priorities\n- (Add current patient cases here)\n\n## Response Tone\n- Colleagues: informal, sign "Chamara"\n- Patients/External: formal, sign "Dr. Basnayake"\n- Keep replies under 3 sentences where possible\n\n## Calendar Preferences\n- Ward rounds: mornings preferred\n- Path review: 12-1pm slot\n\n## Automation Rules (Phase 8+)\n- (Future: auto-approve Low priority from @hospital.org.au)\n\n## Other\n- Currently on light clinical load'
) on conflict (domain) do nothing;

-- Research
insert into domain_knowledge (domain, content) values (
  'Research',
  E'# Research Domain Knowledge\n\n## Key Contacts\n- PhD Students (MIRO, AI in Endoscopy)\n- University of Melbourne admin staff\n\n## Active Priorities\n- Manuscript reviews\n- Grant applications\n\n## Response Tone\n- Academic and professional\n- Sign "Chamara" for close collaborators\n\n## Calendar Preferences\n- Deep work blocks: Afternoon (2pm-5pm)\n\n## Other\n- Prioritize deadlines for PhD students'
) on conflict (domain) do nothing;

-- Admin
insert into domain_knowledge (domain, content) values (
  'Admin',
  E'# Admin Domain Knowledge\n\n## Key Priorities\n- GESA Luminal Faculty tasks\n- Committee meetings\n- Rostering and leave requests\n\n## Response Tone\n- Professional and concise\n\n## Automation Rules\n- Auto-snooze newsletters to weekend if possible\n\n## Other\n- Check "No-Fly Zone" settings for routine admin'
) on conflict (domain) do nothing;

-- Home
insert into domain_knowledge (domain, content) values (
  'Home',
  E'# Home Domain Knowledge\n\n## Key Contacts\n- Family members\n- School notifications\n\n## Priorities\n- School pickups/drop-offs\n- Kids sport schedules\n\n## Response Tone\n- Casual and personal\n\n## Calendar Preferences\n- No work bookings after 5pm on weekdays\n- Weekends are protected time'
) on conflict (domain) do nothing;

-- Hobby
insert into domain_knowledge (domain, content) values (
  'Hobby',
  E'# Hobby (Micro-SaaS) Domain Knowledge\n\n## Projects\n- DrDictation\n- Cognito (this system)\n- Vibe Coding Tools\n\n## Key Contacts\n- GitHub notifications\n- Hosting providers (Vercel, Supabase)\n\n## Response Tone\n- Developer-focused, technical\n\n## Other\n- Server down alerts are CRITICAL'
) on conflict (domain) do nothing;
