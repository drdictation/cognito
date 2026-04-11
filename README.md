# Cognito - Trello Task Enrichment and Planning

> **"The AI proposes; the user disposes."**

Cognito is being refocused into a **Trello-centric task enrichment and planning layer**. Outlook remains the email client, Trello remains the durable task store, and Cognito improves Trello cards after capture instead of trying to become a second inbox.

---

## 🎯 Core Philosophy

**Capture Outside Cognito. Planning Inside Cognito.**

- ✅ Outlook stays the communication home
- ✅ Trello native email-to-board handles capture
- ✅ Cognito rewrites vague Trello cards into actionable work
- ✅ User confirms plans before cards move into `Today`
- ❌ Cognito is not on the critical path for capture
- ❌ Cognito does not silently auto-schedule work onto the calendar

## 🏗️ Architecture Overview

```
Outlook / Phone → Trello Email-to-Board → Trello Inbox → Cognito Enrichment → Proposed Plan → User Confirm → Today
```

### Current Default Flow

1. The user reads and clears email in Outlook.
2. If an email becomes work, it is forwarded into Trello using native email-to-board.
3. Trello creates a raw card in `Inbox` with the original body and attachments.
4. Cognito reads Trello `Inbox`, rewrites the title, and prepends an additive AI summary block.
5. Cognito generates an evening plan or “I have X minutes” shortlist.
6. The user confirms the selection, then Cognito moves those cards into `Today`.

### Trello Board Shape

- `Inbox`
- `Today`
- `This Week`
- `Waiting`
- `Later`
- `Done`

---

## 🚀 Current Product Shape

### Features

#### 🧠 Intelligence Layer
- **Trello Inbox Enrichment:** Rewrites vague card names into conservative action-oriented titles.
- **Additive AI Summary Block:** Prepends summary, next action, task type, effort, due date, and priority while preserving the original forwarded email below.
- **Processed-State Guardrail:** Uses an `AI Processed` label and embedded marker to avoid reprocessing the same card repeatedly.
- **Conservative Due Date Inference:** Only writes dates when explicit or high-confidence.
- **Planning Heuristics:** Generates evening plans and exact-time-window plans from open Trello cards.

#### 🖥️ Dashboard (Next.js)
- **Planning Home:** Trello-first dashboard with Inbox visibility, `Today` visibility, and plan generation controls.
- **Enrich Inbox:** One-click processing for raw cards in Trello `Inbox`.
- **Plan Confirmation:** Proposed cards stay reviewable until the user moves selected items into `Today`.
- **Time Window Filters:** Supports “I have X minutes”, low-energy, urgent-only, exclude-replies, and deep-work-only planning.

#### ⚡ Execution Model
- **Trello Is The Task Store:** Cognito edits cards in place instead of creating a second review queue.
- **Graceful Failure:** If Cognito is down, the raw Trello card and attachments still exist.
- **No Silent Calendar Writes:** Planning quality is prioritized ahead of autonomous scheduling.

#### 🧱 Legacy Surfaces
- The older Gmail/Supabase ingestion pipeline and calendar-heavy execution code still exist in the repo.
- The default dashboard now targets the Trello-centric workflow instead of the old email briefing model.

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

# Google Cloud (used by legacy Gmail/calendar flows and by Gemini)
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REFRESH_TOKEN=your_refresh_token

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key

# Trello
TRELLO_API_KEY=your_key
TRELLO_TOKEN=your_token
TRELLO_BOARD_NAME=Cognito Task Queue

# Config
CENTRAL_HUB_EMAIL=chamarabfwd@gmail.com
```

### 4. Running the System

**Dashboard:**
```bash
cd dashboard
npm run dev
# Open http://localhost:3000
```
The default home route loads the Trello planning workspace and can enrich `Inbox` cards in place.

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
