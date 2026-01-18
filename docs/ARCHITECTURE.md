# Cognito Architecture - Complete System (Phases 1-8)

## System Overview

Cognito is a "Decision Support First" AI Executive Assistant. It aggregates emails, analyzes them with a hybrid AI engine, presents a briefing for user approval, and then **executes** actions (Trello, Calendar, Email Drafting).

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    6 EMAIL SOURCES                          │
│  (Gmail, M365 Hospital, M365 Uni, etc.)                     │
└───────┼─────────────────────────────────────────────────────┘
        │ Auto-Forwarding
        ▼
┌────────────────────────────────────────┐
│   CENTRAL HUB: chamarabfwd@gmail.com   │
└───────────────┬────────────────────────┘
                │
                ▼
┌────────────────────────────────────────┐
│     TYPESCRIPT INGESTION SERVICE       │
│  (lib/services/ingestion.ts)           │
│  ┌──────────────────────────────────┐  │
│  │ 1. Fetch & Parse (Gmail API)     │  │
│  │ 2. Blocklist / No-Fly Zone       │  │
│  │ 3. LLM ENGINE (Gemini 2.0 Flash) │──┼──▶ Gemini 2.0 Flash Lite
│  │    - Triage & Priority           │  │
│  │    - Draft Generation            │  │
│  │ 4. Save to Supabase              │  │
│  └──────────────────────────────────┘  │
└───────────────┬────────────────────────┘
                │
                ▼
┌────────────────────────────────────────┐
│      SUPABASE (PostgreSQL)             │
│  (inbox_queue, decision_log)           │
└───────────────┬────────────────────────┘
                │
                ▼
┌────────────────────────────────────────┐
│    NEXT.JS DASHBOARD (The Briefing)    │
│  ┌──────────────────────────────────┐  │
│  │ - Approve / Reject / Snooze      │  │
│  │ - Draft Editor ("Reply Now")     │  │
│  │ - Manual Task Addition           ├──┼──▶ Groq Whisper (Voice)
│  │   (Write / Dictate)              │──┼──▶ Gemini (Analysis)
│  │ - Knowledge Base Editor          │──┼──▶ Two-Pass Prompting
│  │ - Tweak (Manual Override UI)      │  │
│  └────────────────┬─────────────────┘  │
└───────────────────┼────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────┐
│         EXECUTION ENGINE               │
│  ┌──────────────┐    ┌──────────────┐  │
│  │    TRELLO    │    │  CALENDAR    │  │
│  │ (Task Cards) │    │ (Time Block) │  │
│  └──────────────┘    └──────────────┘  │
└────────────────────────────────────────┘
```

---

## Component Details

### 1. Ingestion & Routing (TypeScript)

**Service:** `lib/services/ingestion.ts` handles the core ingestion logic, triggered via Next.js Server Actions.

#### Intelligence Engine (`llm.ts`)
Cognito uses **Gemini 2.0 Flash Lite** for speed, cost, and high-quality triage.

**System Prompt:**
The prompt (embedded in `llm.ts`) enforces the "Eisenhower Matrix" logic tailored to the user's specific roles (Clinician, Researcher, Admin).

#### Google Authentication (`google-auth.ts`)
Authentication is handled via environment variables (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`), enabling full serverless compatibility on Vercel without reliance on local JSON files.

---

### 2. The Dashboard (Next.js)

**Stack:** Next.js 14, Tailwind CSS, Lucide Icons, Sonner.

#### Key Features:
*   **Server Actions:** All data mutations (approve, reject, save draft) happen via secure Server Actions.
*   **Draft Editor:** specialized UI component for reviewing AI-generated email drafts.
*   **"Reply Now" Protocol:**
    *   To avoid "forwarding loops" (where the system sends an email that gets forwarded back to itself), Cognito uses a `mailto:` URI strategy.
    *   The "Reply Now" button opens the user's local mail client (Outlook/Mail) with the `To`, `Subject`, and `Body` pre-filled.
    *   This ensures the email is sent **from** the user's correct identity.
*   **Manual Task Ingestion (Phase 6):**
    *   **Write Flow:** Users can type free-form text.
    *   **Voice Flow:** Integrated voice dictation using Groq Whisper API (`whisper-large-v3`).
    *   **Analysis:** Immediate analysis using Gemini 2.0 Flash Lite to classify the task and upsert to Supabase.
*   **Domain Knowledge System (Phase 7a):**
    *   **Knowledge Base:** Persistent markdown-based context stored in Supabase for each of the 5 domains.
    *   **Two-Pass Prompting:** When generating drafts, the system first identifies the domain, then fetches the relevant knowledge file to inject into the final draft generation prompt.
    *   **Proactive Learning:** On task approval, a background AI process analyzes the task (sender, content, domain) to identify new recurring knowledge or contacts, presenting them as suggestions in the dashboard.
* **Smart Calendar Intelligence (Phase 7b):**
    * **Event Detection:** AI extracts structured event data (title, time, duration, location, attendees) from email content.
    * **Conflict Detection:** Real-time checking against Google Calendar for overlapping events.
    * **Priority Bumping:** High-priority tasks can automatically displace lower-priority "Cognito-managed" events.
    * **Protected Calendars:** Logic to ensure ICLOUD and other personal calendars are never touched.
    * **Scheduling Windows:** Database-driven availability slots including recurring Tuesday blocks and critical overflow windows.

---

### 3. Execution Engine (`execution.ts`)

When a user clicks **"Approve"**, the system orchestrates multiple APIs API calls:

1.  **Trello Card Creation:**
    *   Creates a card in "Cognito Tasks" board.
    *   **Context Injection:** Appends the full original email content + AI summary + Draft text to the card description.
    *   **deadline mapping:** Maps AI-inferred deadline to Trello due date.

2.  **Calendar Time Blocking:**
    * **Duration Estimation:** Uses AI's `estimated_minutes` (Min: 5m, Max: 120m).
    * **Slot Finder:** Scans Google Calendar for available slots within `scheduling_windows`.
    * **Priority Bumping:** For Critical tasks, the system can "bump" existing Cognito-managed Focus Time blocks to future slots within their respective deadlines.
    * **Booking:** Creates a private "Focus Time" event with extended properties tracking `task_id`, `priority`, and `deadline`.
    * **Event Approval:** AI-detected events are presented in a dedicated "Pending Schedule Items" list at the top of the dashboard. This allows for approval/edit/rejection even after the main task has been moved to Trello.
    * **Conflict Management:** Users can "Force Approve" (Create Anyway) events if they choose to overlap with existing appointments.


---

## Data Schema (Supabase)

### `inbox_queue` Table
Updated schema includes fields for all phases:

| Column | Type | Purpose |
|--------|------|---------|
| `original_content` | TEXT | Full body of the email (kept for context). |
| `model_used` | TEXT | Tracks which LLM (Gemini/Groq) made the decision. |
| `is_simple_response` | BOOL | Flag if AI detected a quick reply scenario. |
| `draft_response` | TEXT | The AI-generated draft text. |
| `deadline` | TIMESTAMP | Inferred task deadline. |
| `deadline_source` | TEXT | Source of deadline (AI, manual, or default). |
| `trello_card_id` | TEXT | ID of created Trello card. |
| `calendar_event_id` | TEXT | ID of created Calendar block. |
| `scheduled_start` | TIMESTAMP | Start time of scheduled work block. |
| `scheduled_end` | TIMESTAMP | End time of scheduled work block. |
| `execution_status` | TEXT | pending, scheduled, failed, skipped. |
| `executed_at` | TIMESTAMP | When the task was last actioned. |


### `detected_events` Table (Phase 7b)
Stores AI-extracted calendar events linked to inbox tasks.

| Column | Type | Purpose |
|--------|------|---------|
| `task_id` | UUID | Reference to inbox_queue item. |
| `event_type` | TEXT | Meeting, Deadline, Appointment, Reminder. |
| `proposed_start` | TIMESTAMP | AI-extracted start time. |
| `status` | TEXT | pending, approved, rejected, conflict. |

### `cognito_events` Table (Phase 7b)
Tracks events created by Cognito for bumping purposes.

| Column | Type | Purpose |
|--------|------|---------|
| `google_event_id` | TEXT | Google Calendar Event ID. |
| `priority` | TEXT | Priority for bumping logic. |
| `deadline` | TIMESTAMP | Latest point this task can be completed. |
| `bump_count` | INT | Number of times this task was moved. |


---

## Security

*   **OAuth Scopes:** Minimal scopes used for Gmail (modify) and Calendar (events).
*   **Environment Variables:** All API keys (`GOOGLE_AI_API_KEY`, `TRELLO_API_KEY`, `SUPABASE_SERVICE_KEY`) are stored in `.env` and never committed.
*   **Row Level Security (RLS):** Enabled on Supabase to prevent unauthorized access.

---

## Deploying

### Production
The system is fully optimized for Vercel deployment:
1.  **Backend/Frontend:** Next.js Hosted on Vercel. Ingestion triggered via the "Refresh" button (Server Action).
2.  **Database:** Supabase Managed.
3.  **Auth:** Environment-variable-only Google OAuth.


---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    6 EMAIL SOURCES                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │ Gmail A  │ │ Gmail B  │ │ Gmail C  │ │ Hotmail  │      │
│  │ Personal │ │ Project  │ │ Private  │ │ Legacy   │      │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘      │
│       │            │            │            │             │
│  ┌────┴─────┐ ┌───┴──────┐                                │
│  │ M365 A   │ │ M365 B   │                                │
│  │ Hospital │ │ Uni Melb │                                │
│  └────┬─────┘ └────┬─────┘                                │
└───────┼────────────┼──────────────────────────────────────┘
        │            │
        │  AUTO-FORWARDING RULES
        │            │
        ▼            ▼
┌────────────────────────────────────────┐
│   CENTRAL HUB: chamarabfwd@gmail.com   │
└───────────────┬────────────────────────┘
                │
                ▼
┌────────────────────────────────────────┐
│     TYPESCRIPT INGESTION SERVICE       │
│  ┌──────────────────────────────────┐  │
│  │ 1. Fetch Unread (Gmail API)      │  │
│  │ 2. Extract Original Sender         │  │
│  │ 3. Check Blocklist                 │  │
│  │ 4. Check No-Fly Zone               │  │
│  │ 5. Analyze with Gemini Flash       │  │
│  │ 6. Save to Supabase                │  │
│  └──────────────────────────────────┘  │
└───────────────┬────────────────────────┘
                │
                ▼
┌────────────────────────────────────────┐
│      SUPABASE (PostgreSQL)             │
│  ┌──────────────────────────────────┐  │
│  │ inbox_queue (staging area)       │  │
│  │ blocklist (spam filter)          │  │
│  │ constraints (no-fly zone rules)  │  │
│  │ decision_log (learning v2)       │  │
│  └──────────────────────────────────┘  │
└───────────────┬────────────────────────┘
                │
                ▼
┌────────────────────────────────────────┐
│    NEXT.JS FRONTEND (Future Phase)     │
│   Daily Briefing UI for User Approval  │
└────────────────────────────────────────┘
```

---

## Component Details

### 1. Email Funnel (Auto-Forwarding)

**Problem:** Managing 6 different email API connections (2x Graph API, 1x Gmail API, 3x IMAP) is complex and fragile.

**Solution:** Configure auto-forwarding rules at the source to send all relevant emails to a single **Central Hub Gmail** account.

#### Source Account Mapping

| Source | Email Domain | Auto-Forward To | Default Category |
|--------|--------------|-----------------|------------------|
| M365 A (Hospital) | `@hospital.org.au` | chamarabfwd@gmail.com | Clinical |
| M365 B (University) | `@unimelb.edu.au` | chamarabfwd@gmail.com | Research |
| Gmail C (Private Practice) | `@practice.com.au` | chamarabfwd@gmail.com | Clinical |
| Gmail B (Project/Dev) | `@project.com` | chamarabfwd@gmail.com | Hobby |
| Gmail A (Personal) | `@gmail.com` | chamarabfwd@gmail.com | Home |
| Hotmail (Legacy) | `@hotmail.com` | chamarabfwd@gmail.com | Home |

**Header Preservation:**
Gmail preserves the original sender in forwarded emails:
- `X-Forwarded-For` header
- Body text pattern: `---------- Forwarded message ---------\nFrom: Original Sender <email@domain.com>`

---

### 2. Python Ingestion Script

**Technology:** Python 3.11+ with:
- `google-api-python-client` for Gmail API
- `google-generativeai` for Gemini Flash
- `supabase-py` for database operations

#### Processing Pipeline

```python
# Simplified flow
def main():
    emails = fetch_unread_from_gmail()
    for email in emails:
        # 1. Extract original sender
        sender = extract_original_sender(email)
        
        # 2. Check blocklist
        if is_blocked(sender):
            mark_as_spam(email)
            continue
        
        # 3. Check No-Fly Zone
        if is_no_fly_zone() and not is_home_domain(email):
            # Ingest silently (no notifications)
            pass
        
        # 4. AI Analysis
        assessment = analyze_with_gemini(email.content, sender)
        
        # 5. Save to DB
        save_to_inbox_queue(email, assessment)
        
        # 6. Mark as read
        mark_as_read(email)
```

---

### 3. Blocklist Filtering (PRD Requirement)

Before AI processing, check sender against `blocklist` table:

```sql
SELECT EXISTS (
    SELECT 1 FROM blocklist 
    WHERE email_pattern LIKE '%' || $sender || '%'
      AND is_active = true
)
```

**Common Patterns:**
- `%noreply%`
- `%newsletter%`
- `%notifications%`

**Rationale:** Save Gemini API costs by filtering obvious noise before LLM processing.

---

### 4. Gemini AI Analysis

**Model:** `gemini-2.5-flash-lite` (Chosen for speed, ultra-low cost, and thinking capabilities)

> [!IMPORTANT]
> **STRICT MODEL RULE:** NO GEMINI MODEL BEFORE 2.5 SHOULD EVER BE CODED IN THIS PROJECT.

**System Prompt:**
```
You are an Executive Assistant for a Consultant Gastroenterologist.

PRIORITY RULES (Eisenhower Matrix):
- CRITICAL: Clinical Patient Care (ward calls, urgent pathology), Hard deadlines today
- HIGH: Research work (PhD students), Meaningful + Time-sensitive
- NORMAL: Admin forms, Committee emails, Deadline-driven but not urgent
- LOW: FYI emails, Optional events

DOMAINS: Clinical, Research, Admin, Home, Hobby

CONTEXT:
- User supervises PhD students in IBD and AI in Endoscopy
- Works in public hospital + private practice
- Develops micro-SaaS tools (DrDictation, Cognito)

Return JSON:
{
    "domain": "Clinical|Research|Admin|Home|Hobby",
    "priority": "Critical|High|Normal|Low",
    "summary": "2-sentence summary",
    "reasoning": "Why this priority/domain?",
    "suggested_action": "What should user do?",
    "estimated_minutes": <int>
}
```

**Cost:** ~$0.000001 per email (based on Gemini Flash pricing)

---

### 5. No-Fly Zone Logic (PRD Requirement)

**Rule:** Friday 17:00 - Sunday 18:00 → Silent ingestion (no notifications)

**Exception:** Home/Hobby domain emails bypass the block.

**Implementation:**
```python
def is_no_fly_zone() -> bool:
    now = datetime.now()
    if now.weekday() == 4 and now.hour >= 17:  # Friday after 5pm
        return True
    if now.weekday() in [5, 6]:  # Saturday, Sunday
        if now.weekday() == 6 and now.hour >= 18:  # Sunday after 6pm
            return False
        return True
    return False
```

**Database Storage:**
The `constraints` table allows runtime configuration without code changes.

---

### 6. Database Schema Highlights

#### inbox_queue Table

| Column | Type | Purpose |
|--------|------|---------|
| `message_id` | TEXT UNIQUE | Gmail message ID (deduplication) |
| `original_source_email` | TEXT | Which of 6 accounts |
| `real_sender` | TEXT | Actual sender (not forwarding address) |
| `ai_assessment` | JSONB | Full AI analysis (structured) |
| `ai_domain` | TEXT | Denormalized for fast queries |
| `status` | TEXT | 'pending', 'approved', 'rejected', 'snoozed' |

**Why JSONB + Denormalized Fields?**
- JSONB for flexibility and future expansion
- Denormalized fields (`ai_domain`, `ai_priority`) for fast filtering without JSON extraction

#### Views for Daily Briefing

```sql
-- v_pending_tasks: Priority-sorted task list
-- v_daily_briefing: Grouped by domain with time estimates
```

---

## Data Flow Example

### Input: Forwarded Hospital Email

```
From: chamarabfwd@gmail.com
Subject: Fwd: Urgent Pathology - Patient XYZ
Date: Friday, Jan 15, 2026, 16:00

---------- Forwarded message ---------
From: pathology@hospital.org.au
Subject: Urgent Pathology - Patient XYZ
Date: Friday, Jan 15, 2026, 15:30

Pathology results for Patient XYZ show elevated CRP...
```

### Processing Steps

1. **Extract Original Sender:** `pathology@hospital.org.au`
2. **Blocklist Check:** ✅ Pass (not in blocklist)
3. **Source Mapping:** `@hospital.org.au` → `ms365_hospital` → Clinical
4. **No-Fly Zone:** ❌ Not active (Friday 16:00, before 17:00)
5. **Gemini Analysis:**
   ```json
   {
     "domain": "Clinical",
     "priority": "Critical",
     "summary": "Urgent pathology for Patient XYZ - elevated CRP. Requires review.",
     "reasoning": "Clinical patient care with urgent pathology flag",
     "suggested_action": "Review results and contact patient",
     "estimated_minutes": 10
   }
   ```
6. **Save to DB:**
   ```sql
   INSERT INTO inbox_queue (
     message_id, original_source_email, real_sender, 
     subject, ai_assessment, ai_domain, ai_priority, status
   ) VALUES (
     'msg_12345', 'ms365_hospital', 'pathology@hospital.org.au',
     'Urgent Pathology - Patient XYZ', '{"domain":"Clinical",...}',
     'Clinical', 'Critical', 'pending'
   )
   ```

---

## Security Considerations

### Gmail API Authentication

**OAuth2 Flow:**
1. Create GCP project
2. Enable Gmail API
3. Create OAuth2 credentials (Desktop App)
4. Run authentication flow to generate `token.json`
5. Store `token.json` securely (gitignored)

**Scopes Required:**
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/gmail.modify` (for marking as read)

### Supabase Security

**Row-Level Security (RLS):**
```sql
-- Only authenticated user can read their inbox
CREATE POLICY "Users can read own inbox" ON inbox_queue
  FOR SELECT USING (auth.uid() = user_id);
```

**Service Role Key:**
- Used by Python script for unrestricted access
- Stored in `.env` (gitignored)
- Never exposed to frontend

---

## Deployment Strategy (Phase 1)

### Local Development
1. Run Python script manually: `python src/scripts/ingest_hub.py`
2. View results in Supabase dashboard

### Production (Future)
1. **Cron Job:** Run script every 15 minutes via `cron` or Vercel Cron
2. **Serverless:** Migrate to Cloudflare Worker or Vercel Serverless Function
3. **Monitoring:** Log errors to Sentry, track costs in Google Cloud Console

---

## Cost Analysis

### Per Email Processed

| Service | Cost | Notes |
|---------|------|-------|
| Gmail API | Free | 1B quota/day |
| Gemini Flash | ~$0.000001 | 1M free tokens/month |
| Supabase | Free | 500MB database (free tier) |

**Estimated Monthly Cost for 1000 emails:** ~$0.001

---

## Future Enhancements (Out of Scope for Phase 1)

1. **Voice Ingestion:** Transcribe voice memos (Whisper API) and run same AI analysis
2. **Action Execution:** Integrate with Trello API, Google Calendar API
3. **Learning Loop:** Use `decision_log` to improve Gemini prompts
4. **Mobile App:** React Native app for on-the-go briefing review
5. **Smart Scheduling:** "Math Alert" for time conflicts

---

## Testing Strategy

### Unit Tests
- `test_extract_original_sender()` - Parse forwarded email headers
- `test_blocklist_matching()` - Pattern matching logic
- `test_no_fly_zone()` - Time-based logic

### Integration Tests
- End-to-end: Send test email → Verify DB entry
- Gemini API: Mock responses for consistent testing

### Manual Testing
1. Forward emails from each of 6 sources
2. Verify correct `original_source_email` detection
3. Confirm AI domain/priority assignments
4. Test No-Fly Zone on Friday evening

---

## Glossary

- **Central Hub:** Single Gmail account receiving all forwarded emails (`chamarabfwd@gmail.com`)
- **Original Source:** The actual email account (Hospital, University, etc.) that received the email first
- **No-Fly Zone:** Friday 17:00 - Sunday 18:00 quiet period (PRD requirement)
- **Eisenhower Matrix:** Priority framework (Urgent+Important = Critical)
- **Decision Support:** AI proposes, user approves (no autonomous actions)
