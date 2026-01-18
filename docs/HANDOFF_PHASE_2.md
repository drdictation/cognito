# Handoff: Cognito Phase 2 (The Daily Briefing Dashboard)

## Current Status: Phase 1 Complete
- **Ingestion Pipeline:** Fully operational Python script. Fetches from Gmail hub, filters via blocklist, analyzes with Gemini 2.5 Flash Lite, and upserts to Supabase.
- **Deduplication:** Robust handling via Gmail `message_id`.
- **Intelligence:** Refined prompt located in `prompts/system_prompt_v1.md`.
- **Database:** PostgreSQL schema fully deployed in Supabase.

## 🏗️ Architectural Hard Constraints
1. **Model Requirement:** **STRICTLY GEMINI 2.5 FLASH LITE** (or newer). No 1.x or 2.0 models.
2. **Philosophy:** "AI Proposes, User Disposes." The system is for **Decision Support**. It must never take autonomous actions (sending emails, etc.) without user click.
3. **No-Fly Zone:** Respect the quiet period (Fri 17:00 - Sun 18:00). The UI should reflect this status.

## 🎯 Phase 2 Goals: The "Daily Briefing" Web UI
Build a Next.js 14 (App Router) dashboard hosted on Vercel to allow the User to review and triage the `inbox_queue`.

### Functional Requirements:
1. **The Briefing View:**
   - Group tasks by **Domain** (Clinical, Research, Admin, Home, Hobby).
   - Show tasks sorted by **Priority** (Critical > High > Normal > Low).
   - Display AI-generated Summary, Reasoning, and Suggested Action.
2. **Decision Support Actions:**
   - **Approve:** Move status to `approved`.
   - **Tweak:** Allow user to override AI's `priority` or `domain`. (Update the `decision_log` table when this happens).
   - **Snooze/Reject:** Update status accordingly.
3. **Admin Controls:**
   - Manage the `blocklist` (add new email patterns).
   - View processing status (No-Fly Zone indicator).

### Visual Requirements:
- **Aesthetic:** High-premium, executive dashboard. Dark mode. "Glassmorphism" or sleek, clean cards.
- **Micro-animations:** Smooth transitions as tasks are reviewed/cleared.
- **Mobile First:** The user often reviews this while driving or between clinics.

## Technical Stack
- **Dashboard:** Next.js 14 (App Router).
- **Styling:** Tailwind CSS + Vanilla CSS for premium polish.
- **Backend/Auth:** Supabase.
- **Deployment:** Vercel.

## Knowledge Base
- `docs/ARCHITECTURE.md`: Pipeline details.
- `docs/PRD.md`: Vision and No-Fly Zone rules.
- `docs/DOMAIN_MAP.md`: Detailed sub-domain hierarchy.
- `supabase/schema.sql`: Current database structure.
