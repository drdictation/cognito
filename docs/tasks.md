# Cognito: Master Task List

## 🟢 Phase 1: Ingestion Pipeline [Completed]
- [x] **Gmail API Integration:** Fetch unread emails from central hub (`chamarabfwd@gmail.com`).
- [x] **Email Parsing:** Extract true sender from forwarded headers.
- [x] **Blocklist:** Regex-based filtering of spam/newsletters.
- [x] **No-Fly Zone:** Silent ingestion logic (Friday 17:00 - Sunday 18:00).
- [x] **Database:** Supabase schema (`inbox_queue`, `decision_log`).
- [x] **Initial Intelligence:** Gemini Flash Lite integration for Triage & Priority.

## 🟢 Phase 2: The Dashboard [Completed]
- [x] **Next.js Setup:** App Router, Tailwind, Lucide React.
- [x] **Daily Briefing UI:**
  - [x] Task Cards with "Glassmorphism" design.
  - [x] Collapsible "Original Email" view.
  - [x] Badges for Domain, Priority, and Model Used.
- [x] **Actions:**
  - [x] Approve (triggers execution).
  - [x] Reject (removes from view).
  - [x] Snooze (hides until tomorrow).
  - [x] Tweak (corrects AI assessment).

## 🟢 Phase 3: Execution Engine [Completed]
- [x] **Trello Integration:**
  - [x] Create cards in "Cognito Tasks" board.
  - [x] Map deadlines to Due Dates.
  - [x] Rich description injection (Summary + Context + Draft + Full Email Content with recursive parsing).
  - [x] Trello Guardrails (16k char truncation).
- [x] **Calendar Integration (Time Blocking):**
  - [x] AI estimates task duration (`estimated_minutes`).
  - [x] Algorithm finds next free slot (9am-5pm).
  - [x] Blocks time in Google Calendar with link to Trello.

## 🟢 Phase 4: Hybrid Intelligence [Completed]
- [x] **Multi-Model Router:**
  - [x] **Gemini 2.5 Flash Lite:** (70% traffic) - Fast, cheap, routine triage.
  - [x] **Groq (Llama-3-70b):** (30% traffic) - Deep thinking, complex reasoning.
- [x] **System Prompt Refinement:** Tailored to Consultant Gastroenterologist persona.
- [x] **Cost Tracking:** Logging model usage in database.

## 🟢 Phase 5: Agile Drafting Assistant [Completed]
- [x] **Simple Response Detection:** AI automatically identifies emails needing quick replies.
- [x] **Draft Generation:** Pre-writes polite responses signed "Chamara".
- [x] **Draft Editor:**
  - [x] Review and Edit UI within Task Card.
  - [x] "Regenerate" button with custom instructions.
- [x] **"Reply Now" Protocol:**
  - [x] `mailto:` integration to open local mail client.
  - [x] Bypasses forwarding loops by sending from user identity.

## 🟢 Phase 6: Manual Task Addition [Completed]
- [x] **Manual Input UI:** Floating action button (FAB) for quick access.
- [x] **Write Flow:** Free-form text input with real-time AI classification.
- [x] **Voice Flow:** Dictation via Groq Whisper (`whisper-large-v3`).
- [x] **AI Integration:** Direct call to Gemini 2.0 Flash Lite for manual input analysis.
- [x] **Database Integration:** Upserting manual tasks with `source='manual'`.

## 🟢 Phase 7: Learning Loop & Smart Calendar [Completed]
- [x] **Domain Knowledge System (7a):**
  - [x] **Schema:** `domain_knowledge`, `contacts`, and `knowledge_suggestions` tables.
  - [x] **Knowledge Editor UI:** New `/knowledge` page with domain-specific markdown editing.
  - [x] **Contacts Management:** Dedicated UI for managing key people and their priority boosts.
  - [x] **Two-Pass Prompting:** Draft generation now injects relevant domain knowledge context.
  - [x] **Proactive AI Learning:** AI analyzes approved tasks to suggest new knowledge/contacts.
- [x] **Smart Calendar & Bumping (7b):**
  - [x] **Calendar Intelligence Service:** `findSlotWithBumping`, conflict detection, and protected calendars.
  - [x] **Event Detection:** AI extraction of Meetings, Deadlines, Appointments, and Reminders from emails.
  - [x] **Priority Bumping:** Automatic rescheduling of lower-priority Cognito tasks for Critical arrivals.
  - [x] **Dynamic Scheduling:** Added 9am-12pm Tue slots and Critical overflow (7:30pm-10pm).
  - [x] **Dashboard Integration:** Calendar event cards, bump notifications, and undo/redo logic.
  - [x] **Decoupled Approval:** Added "Pending Schedule Items" list at the top of the dashboard for visibility after task approval.
  - [x] **Conflict Override:** Implemented "Force Approve" (Create Anyway) for calendar events with conflicts.
  - [x] **Enhanced Tweak UI:** Refined visual selection feedback and manual adjustment of estimated task duration.
  - [x] **Database Schema:** `detected_events`, `cognito_events`, `scheduling_windows`, `protected_calendars`.


## 🟢 Phase 8: Vercel Production Readiness [Completed]
- [x] **TypeScript Ingestion Port:** Rewrote Python ingestion logic into native TypeScript services (`gmail.ts`, `ingestion.ts`).
- [x] **Env-Based Auth:** Migrated from file-based `credentials.json`/`token.json` to secure environment variables (`GOOGLE_CLIENT_ID`, etc.).
- [x] **Shared Auth Utility:** Created a centralized `google-auth.ts` for authenticated Google clients.
- [x] **Vercel Compatibility:** Removed all filesystem and `child_process` dependencies (system prompt now embedded in `llm.ts`).
- [x] **Robust Extraction:** Increased token limits (2500) and added JSON repair logic for better event detection performance.
- [x] **Multipart Email Support:** Implemented recursive MIME parsing in `gmail.ts` to capture full body content from forwarded and nested emails.
- [x] **Trello Guardrails:** Added automatic description truncation (16,384 char limit) to prevent Trello API errors on massive emails.
- [x] **Successful Build:** Verified local and production builds with full feature parity.


## 🔵 Phase 9: Expansion [Future]
- [ ] **Mobile App:** React Native wrapper for on-the-go triage.
- [ ] **Math Alert:** Conflict detection logic.


---

## 📋 Setup Tasks

### 1. Google Gemini API
- [ ] Create Google AI Studio account at https://aistudio.google.com/
- [ ] Generate API key
- [ ] Add `GOOGLE_AI_API_KEY` to `.env`
- [ ] Test with `curl` or Python script
- [ ] Verify free tier quota (1M tokens/month)
- [ ] **STRICT RULE:** Ensure `gemini-2.5-flash-lite` is used. NO MODEL BEFORE 2.5 ALLOWED.

### 2. Gmail API Setup
- [ ] Create GCP project at https://console.cloud.google.com/
- [ ] Enable Gmail API
- [ ] Create OAuth2 credentials (Desktop Application)
- [ ] Download `credentials.json`
- [ ] Run OAuth flow to generate `token.json`
- [ ] Add both files to `.gitignore`
- [ ] Test authentication with Python script

### 3. Supabase Project Setup
- [ ] Create Supabase project at https://supabase.com/
- [ ] Copy project URL to `.env` as `SUPABASE_URL`
- [ ] Copy service role key to `.env` as `SUPABASE_SERVICE_KEY`
- [ ] Run `schema.sql` in Supabase SQL Editor
- [ ] Verify tables created: `inbox_queue`, `blocklist`, `constraints`, `domains`
- [ ] Check default data inserted (domains, blocklist patterns, no-fly zone)

### 4. Central Hub Email Configuration
- [ ] Set up auto-forwarding rules from 6 source accounts:
  - [ ] Gmail A (Personal) → chamarabfwd@gmail.com
  - [ ] Gmail B (Project/Dev) → chamarabfwd@gmail.com
  - [ ] Gmail C (Private Practice) → chamarabfwd@gmail.com
  - [ ] Hotmail (Legacy) → chamarabfwd@gmail.com
  - [ ] M365 A (Hospital) → chamarabfwd@gmail.com
  - [ ] M365 B (University) → chamarabfwd@gmail.com
- [ ] Test each forwarding rule with a test email
- [ ] Verify headers preserve original sender info

---

## 💻 Development Tasks

### 5. Python Environment Setup
- [ ] Create virtual environment: `python3 -m venv venv`
- [ ] Activate: `source venv/bin/activate`
- [ ] Install dependencies: `pip install -r requirements.txt`
- [ ] Create `requirements.txt` with:
  ```
  google-generativeai>=0.8.0
  google-auth>=2.0.0
  google-auth-oauthlib>=1.0.0
  google-api-python-client>=2.0.0
  supabase>=2.0.0
  python-dotenv>=1.0.0
  ```

### 6. Ingestion Script (`ingest_hub.py`)
- [ ] Create file structure in `src/scripts/`
- [ ] Implement Gmail API connection
- [ ] Implement `fetch_unread_emails()` function
- [ ] Implement `extract_original_sender()` - parse forwarded headers
- [ ] Implement `check_blocklist()` - query Supabase
- [ ] Implement `is_no_fly_zone()` - time-based logic
- [ ] Implement `analyze_with_gemini()` - AI analysis
- [ ] Implement `save_to_inbox_queue()` - Supabase upsert
- [ ] Implement `mark_email_as_read()` - Gmail API
- [ ] Add error handling and retry logic
- [ ] Add logging (DEBUG level for development)

### 7. Gemini Prompt Engineering
- [ ] Create system prompt with Eisenhower Matrix rules
- [ ] Include domain taxonomy (Clinical, Research, Admin, Home, Hobby)
- [ ] Add user context (Gastroenterologist, PhD supervisor, etc.)
- [ ] Define JSON output schema
- [ ] Test with sample emails
- [ ] Refine based on accuracy

---

## 🧪 Testing Tasks

### 8. Unit Testing
- [ ] Test `extract_original_sender()` with sample forwarded emails
- [ ] Test `check_blocklist()` with various email patterns
- [ ] Test `is_no_fly_zone()` for different days/times:
  - [ ] Thursday 18:00 → False
  - [ ] Friday 16:00 → False
  - [ ] Friday 17:00 → True
  - [ ] Saturday 12:00 → True
  - [ ] Sunday 17:59 → True
  - [ ] Sunday 18:00 → False
- [ ] Test Gemini response parsing

### 9. Integration Testing
- [ ] Send test emails from each of 6 source accounts
- [ ] Run `ingest_hub.py` script
- [ ] Verify entries in Supabase `inbox_queue` table:
  - [ ] Correct `original_source_email` detected
  - [ ] Correct `real_sender` extracted
  - [ ] AI assessment populated
  - [ ] Status = 'pending'
- [ ] Test blocklist filtering (send from noreply@test.com)
- [ ] Test deduplication (send same email twice)

### 10. Manual Verification
- [ ] Review AI domain classifications - are they accurate?
- [ ] Review AI priority assignments - match Eisenhower Matrix?
- [ ] Check `ai_summary` quality - clear and concise?
- [ ] Verify `suggested_action` is actionable
- [ ] Confirm `estimated_minutes` is reasonable

---

## 📚 Documentation Tasks

### 11. Documentation Completion
- [x] Complete `docs/PRD.md` (already done)
- [x] Complete `docs/ARCHITECTURE.md`
- [x] Complete `docs/domain_map.md` (already done)
- [ ] Write comprehensive `README.md`
- [ ] Update `.env.example` with all variables

---

## 🚀 Deployment Preparation (Future)

### 12. Production Readiness
- [ ] Add error monitoring (consider Sentry)
- [ ] Set up cron job for automated runs (every 15 minutes)
- [ ] Create Supabase backup strategy
- [ ] Document manual run procedure
- [ ] Create troubleshooting guide

---

## 📊 Success Metrics (Phase 1)

- [ ] **Deduplication:** No duplicate entries in `inbox_queue` for same `message_id`
- [ ] **Blocklist:** 100% of emails matching blocklist patterns are filtered
- [ ] **No-Fly Zone:** Zero notifications Friday 17:00 - Sunday 18:00
- [ ] **AI Accuracy:** >80% of domain classifications correct (manual review)
- [ ] **Latency:** Email processing <10 seconds per email
- [ ] **Cost:** <$0.01 per 100 emails processed

---

## 🔜 Future Phases (Not in Scope)

- [ ] Next.js frontend for Daily Briefing UI
- [ ] Voice ingestion pipeline
- [ ] Action execution (Trello, Google Calendar integration)
- [ ] Learning loop from `decision_log`
- [ ] Mobile app (React Native)

---

## 🆘 Troubleshooting Checklist

### If emails aren't being fetched:
- [ ] Check Gmail API credentials are valid
- [ ] Verify `token.json` exists and not expired
- [ ] Confirm OAuth scopes include `gmail.readonly` and `gmail.modify`
- [ ] Test Gmail API connection with standalone script

### If Gemini API fails:
- [ ] Verify API key is valid
- [ ] Check quota hasn't been exceeded
- [ ] Test with simpler prompt
- [ ] Review error logs for rate limiting

### If Supabase writes fail:
- [ ] Confirm service role key is correct
- [ ] Check schema matches code expectations
- [ ] Verify `message_id` is unique
- [ ] Review Supabase logs for errors

---

## ✅ Definition of Done

Phase 1 is complete when:
1. All 6 email sources successfully forward to central hub
2. Python script runs without errors
3. Emails are deduplicated by `message_id`
4. Blocklist filtering works (verified with test emails)
5. No-Fly Zone logic is correct (verified with timestamp tests)
6. AI assessments are saved to `inbox_queue` table
7. At least 10 real emails processed successfully
8. Documentation is complete and accurate