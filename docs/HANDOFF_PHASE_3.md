# Handoff: Cognito Phase 3 (Intelligent Execution Engine)

## Current Status: Phase 2 Complete
- **Ingestion:** Emails are fetched, analyzed by Gemini, and stored in Supabase.
- **Triage Dashboard:** Tasks are reviewed in Next.js UI with Approve/Reject/Snooze.
- **Status Workflow:** Tasks move from `pending` → `approved` (or `rejected`/`snoozed`).

---

## 🎯 Phase 3 Goals: "Intelligent Time Blocking"

Take `approved` tasks and:
1. **Infer deadlines** from email content using AI
2. **Create Trello cards** organized by timing (Today, Tomorrow, This Week)
3. **Read calendar availability** to understand free time (Phase 3b)
4. **Propose time blocks** for tasks based on duration and availability (Phase 3c)

---

## 📅 User Decisions (Approved 2026-01-16)

| Decision | Choice |
|----------|--------|
| Calendar Consolidation | Option A - Subscribe all 6 calendars to central Gmail |
| Trello Board | New board: `Cognito Task Queue` |
| Calendar Event Visibility | Private (only user sees details) |
| Phased Approach | Start with 3a (Trello), then 3b (Calendar) |

---

## Phase 3a: Trello Integration (Current)

### Trello Board Structure

**Board:** `Cognito Task Queue`

| List | Routing Logic |
|------|---------------|
| 🔥 **Today** | `ai_deadline = today` OR `ai_priority = 'Critical'` |
| 📅 **Tomorrow** | `ai_deadline = tomorrow` |
| 📆 **This Week** | `ai_deadline` within 7 days |
| 🗓️ **Later** | No deadline / far future |
| ✅ **Completed** | Tasks marked done |

### Card Content
- **Title:** `[PRIORITY] Subject`
- **Labels:** Domain (Clinical=Red, Research=Purple, Admin=Blue, Home=Green, Hobby=Orange)
- **Due Date:** From `ai_inferred_deadline`
- **Description:** Summary + Suggested Action + Gmail link

### AI Enhancements
Update Gemini prompt to output:
```json
{
    "inferred_deadline": "2026-01-17T17:00:00",
    "deadline_confidence": 0.85,
    "deadline_source": "Email states 'due by Friday 5pm'"
}
```

### Database Schema Changes
```sql
ALTER TABLE inbox_queue ADD COLUMN ai_inferred_deadline timestamp with time zone;
ALTER TABLE inbox_queue ADD COLUMN ai_deadline_confidence decimal(3,2);
ALTER TABLE inbox_queue ADD COLUMN execution_status text DEFAULT 'pending';
ALTER TABLE inbox_queue ADD COLUMN trello_card_id text;
```

### Implementation
1. **Script:** `src/scripts/execute_tasks.py`
2. **Poll:** `status='approved'` AND `execution_status='pending'`
3. **Create:** Trello card in correct list
4. **Update:** `execution_status='scheduled'`, `trello_card_id='...'`

---

## Phase 3b: Calendar Integration (Future)

### Calendar Consolidation Strategy
```
6 Calendars → Subscribe/Share → Central Gmail Calendar (chamarabfwd@gmail.com)
```

**Setup (Manual, One-Time):**
1. M365 Calendars → Publish as .ics URL → Subscribe in Google Calendar
2. Other Gmail Calendars → Share with central Gmail
3. Create "Cognito Tasks" sub-calendar for Cognito events

### Capabilities
- Read free/busy for next 7 days
- Create private time block events
- Show availability in dashboard (optional)

---

## Phase 3c: Intelligent Scheduling (Future)

AI-powered slot finder:
1. Read calendar availability
2. Match task duration to available slots
3. Consider domain patterns (Research = afternoon deep work)
4. Propose optimal time slot with confidence score
5. User confirms or adjusts

---

## ⚠️ Safety Rules
- **Idempotency:** Store `trello_card_id` to prevent duplicates
- **Failures:** Log errors, keep `execution_status='pending'` for retry
- **Model Rule:** STRICTLY `gemini-2.5-flash-lite` or newer

---

## 📁 Key Files
- `src/scripts/execute_tasks.py` - Execution engine (to create)
- `prompts/system_prompt_v1.md` - Update for deadline inference
- `supabase/schema.sql` - Add new columns
- `dashboard/` - Optional: History tab for executed tasks
