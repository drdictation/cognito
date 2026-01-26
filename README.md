# Cognito - AI Executive Assistant

> **"The AI proposes; the user disposes."**

Cognito is a bespoke AI Executive Assistant designed to reduce cognitive load for a Consultant Gastroenterologist. It processes emails from multiple sources, analyzes them with Google Gemini Flash, and presents a "Daily Briefing" for user approval—**without taking autonomous actions**.

---

## 🎯 Core Philosophy

**Decision Support First, Automation Later**

- ✅ AI analyzes and proposes
- ✅ User reviews and approves
- ❌ No autonomous execution (Phase 1)

## 🏗️ Architecture Overview

```
6 Email Sources → Central Gmail Hub → TypeScript Ingestion Service → Gemini AI → Supabase
```

### The Email Funnel

Instead of managing 6 different API connections, all emails are auto-forwarded to a **Central Hub Gmail** account (`chamarabfwd@gmail.com`):

1. **M365 A** (Hospital) - Clinical
2. **M365 B** (University) - Research
3. **Gmail A** (Personal) - Home
4. **Gmail B** (Project/Dev) - Hobby
5. **Gmail C** (Private Practice) - Clinical
6. **Hotmail** (Legacy) - Home

The TypeScript service parses forwarded email headers to identify the **original sender** and source account.

---

## 🚀 Phase 1-10: Complete System (Current)

### Features

#### 🧠 Intelligence Layer
- **Multi-Model Routing:** 
    - **Gemini 2.0 Flash Lite** (Speed/Cost/Reasoning)
- **Email Analysis:** Domain classification, Priority scoring (Eisenhower Matrix), Summary generation.
- **Draft Generation:** Auto-drafts responses for "Simple" emails (signed as "Chamara").
- **Manual Task Analysis:** Real-time classification of hand-written or dictated notes.
- **Smart Calendar Detection:** AI extracts calendar events (meetings, deadlines, appointments) directly from email content.
- **Dynamic Deadline Inference:** Priority-based deadline assignments with task-specific logic (e.g., "invited talks").
- **Multi-Session Detection:** AI identifies tasks requiring multiple sessions and suggests optimal chunking parameters.

#### 🖥️ Dashboard (Next.js)
- **Daily Briefing:** Approve/Reject/Snooze/Tweak tasks.
- **Draft Editor:** Review, edit, and regenerate AI drafts.
- **Calendar Event Cards:** AI-detected event suggestions with conflict warnings and one-click approval.
- **Deadline Editor:** Set explicit deadlines with date/time picker or let AI infer from content.
- **Session Chunking UI:** Review and configure multi-session task breakdowns.
- **"Reply Now":** One-click opening of local email client.
- **Manual Add:** Floating action button for quick text/voice ingestion.
- **Knowledge Base:** Editable domain-specific "cheat sheets" to train the AI's judgment and tone.
- **Proactive Learning:** AI proposes new rules and contacts based on your approval patterns.
- **Bump Notifications:** Visual alerts for rescheduled tasks with "Undo" capabilities.
- **Pending Schedule Items:** Decoupled list for triaging extracted calendar events independently of task approval.
- **Conflict Override:** "Force Approve" capability for overlapping calendar events.
- **Enhanced Tweak Capability:** Refined UI with visual selection feedback and manual adjustment of estimated task duration.
- **Native Calendar (Phase 10):** Dedicated view with time-blocking, Google Calendar overlay, and interactive task execution.
- **Time Tracking:** Live start/pause/resume timer to capture actual task duration for future AI learning.
- **Live Updates:** Real-time task management.

#### ⚡ Execution Engine
- **Trello Integration:** Approved tasks automatically create Trello cards with rich context (Summary, Suggestions, and full email content via recursive MIME extraction).
- **Trello Guardrails:** Built-in protection against API limits with automatic 16,384-character description truncation.
- **Intelligent Calendar Scheduling:**
    - **Database-Driven Windows:** Flexible scheduling windows stored in Supabase (morning, evening, critical overflow).
    - **Smart Conflict Detection:** All-day family events ignored; timed events respected.
    - **Priority Bumping:** Critical tasks can bump High/Normal/Low events; Critical tasks never double-book.
    - **Extended Deadline for Bumped Events:** Bumped tasks use 2-week window to find new slots.
    - **Protected Events:** Events on "ICLOUD" calendars are automatically shielded from being bumped.
- **Multi-Session Scheduling:** Individual sessions tracked and scheduled separately with configurable cadence.

#### 🛡️ Ingestion Pipeline
- **Central Hub:** Aggregates 6 email sources.
- **TypeScript Core:** Native processing within Next.js (Vercel-ready).
- **Blocklist:** Filters spam/newsletters.
- **No-Fly Zone:** Silent ingestion during weekends (Friday 17:00 - Sunday 18:00).

---

## 📋 Prerequisites

- **Python 3.11+**
- **Node.js 18+** (for Dashboard)
- **Google AI Studio Key** (Gemini)
- **Groq API Key** (Llama-3)
- **Google Cloud Credentials** (Client ID, Secret, Refresh Token)
- **Supabase Account**
- **Trello API Key/Token**

---

## 🔧 Setup Instructions

### 1. Database Setup (Supabase)

1. Create a project at [Supabase](https://supabase.com).
2. Run the `schema.sql` (found in `supabase/`) in the SQL Editor.

### 2. Dashboard Setup (Next.js)

```bash
cd dashboard
npm install
npm run dev
```

### 3. Environment Variables (.env)

Create a `.env` file in the root directory:

```env
# AI Providers
GOOGLE_AI_API_KEY=AIzaSy...
GROQ_API_KEY=gsk_...

# Google Cloud (Gmail/Calendar)
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REFRESH_TOKEN=your_refresh_token

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key

# Trello
TRELLO_API_KEY=your_key
TRELLO_TOKEN=your_token

# Config
CENTRAL_HUB_EMAIL=chamarabfwd@gmail.com
```

### 4. Running the System

**Dashboard & Ingestion:**
```bash
cd dashboard
npm run dev
# Open http://localhost:3000
```
Ingestion is triggered via the **Refresh** button on the dashboard.

---

## 🏗️ Architecture

```
6 Email Sources
       │
       ▼
Central Gmail Hub
       │
       ▼
Ingestion Service ──▶ Blocklist / No-Fly Zone
       │
       ▼
LLM Engine (Gemini 2.0 Flash)
       │
       ▼
Supabase (Inbox Queue)
       │
       ▼
Next.js Dashboard ──▶ User Approval ──▶ Trello Card & Google Calendar Event
       │
       ├─▶ Draft Editor ──▶ "Reply Now" (mailto)
       │
       └─▶ Manual Add (Write/Dictate) ──▶ AI Analysis ──▶ Supabase
```

---

## 💰 Cost Estimate

- **Gmail/Calendar:** Free
- **Gemini Flash Lite:** ~$0.001/1k emails
- **Groq (Llama-3):** Low cost / Free tier
- **Supabase:** Free tier

---

## 📚 References

- **Docs:** See `docs/` folder for detailed PRD and Architecture.
- **Logs:** See `logs/` for ingestion logs.

**Built with ❤️ by a Gastroenterologist who codes**
