# Cognito - AI Executive Assistant

> **"The AI proposes; the user disposes."**

Cognito is a bespoke AI Executive Assistant designed to reduce cognitive load for a Consultant Gastroenterologist. It processes emails from multiple sources, analyzes them with Google Gemini Flash, and presents a "Daily Briefing" for user approval—**without taking autonomous actions**.

---

## 🎯 Core Philosophy

**Decision Support First, Automation Later**

- ✅ AI analyzes and proposes
- ✅ User reviews and approves
- ❌ No autonomous execution (Phase 1)

---

## 🏗️ Architecture Overview

```
6 Email Sources → Central Gmail Hub → Python Ingestion Script → Gemini AI → Supabase
```

### The Email Funnel

Instead of managing 6 different API connections, all emails are auto-forwarded to a **Central Hub Gmail** account (`chamarabfwd@gmail.com`):

1. **M365 A** (Hospital) - Clinical
2. **M365 B** (University) - Research
3. **Gmail A** (Personal) - Home
4. **Gmail B** (Project/Dev) - Hobby
5. **Gmail C** (Private Practice) - Clinical
6. **Hotmail** (Legacy) - Home

The Python script parses forwarded email headers to identify the **original sender** and source account.

---

## 🚀 Phase 1-7: Complete System (Current)

### Features

#### 🧠 Intelligence Layer
- **Multi-Model Routing:** 
    - 70% traffic: **Gemini 2.5 Flash Lite** (Speed/Cost)
    - 30% traffic: **Groq/Llama-4-Scout** (Deep Thinking/Reasoning)
- **Email Analysis:** Domain classification, Priority scoring (Eisenhower Matrix), Summary generation.
- **Draft Generation:** Auto-drafts responses for "Simple" emails (signed as "Chamara").
- **Manual Task Analysis:** Real-time classification of hand-written or dictated notes.
- **Smart Calendar Detection:** AI extracts calendar events (meetings, deadlines, appointments) directly from email content.
- **Dynamic Deadline Inference:** Priority-based deadline assignments with task-specific logic (e.g., "invited talks").

#### 🖥️ Dashboard (Next.js)
- **Daily Briefing:** Approve/Reject/Snooze/Tweak tasks.
- **Draft Editor:** Review, edit, and regenerate AI drafts.
- **Calendar Event Cards:** AI-detected event suggestions with conflict warnings and one-click approval.
- **"Reply Now":** One-click opening of local email client.
- **Manual Add:** Floating action button for quick text/voice ingestion.
- **Knowledge Base:** Editable domain-specific "cheat sheets" to train the AI's judgment and tone.
- **Proactive Learning:** AI proposes new rules and contacts based on your approval patterns.
- **Bump Notifications:** Visual alerts for rescheduled tasks with "Undo" capabilities.
- **Live Updates:** Real-time task management.

#### ⚡ Execution Engine
- **Trello Integration:** Approved tasks automatically create Trello cards with rich context.
- **Calendar Integration:** "Time Blocking" - AI estimates duration and finds free slots in Google Calendar.
- **Intelligent Scheduling:** Dynamic slots (8pm-9:30pm Sun-Thu, 9am-12pm Tue) and Critical task overflow windows.
- **Smart Bumping:** Critical tasks automatically push lower-priority "Focus Time" blocks to the next available slot.
- **Protected Events:** Events on "ICLOUD" calendars are automatically shielded from being bumped.

#### 🛡️ Ingestion Pipeline
- **Central Hub:** Aggregates 6 email sources.
- **Blocklist:** Filters spam/newsletters.
- **No-Fly Zone:** Silent ingestion during weekends (Friday 17:00 - Sunday 18:00).

---

## 📋 Prerequisites

- **Python 3.11+**
- **Node.js 18+** (for Dashboard)
- **Google AI Studio Key** (Gemini)
- **Groq API Key** (Llama-3)
- **Google Cloud Credentials** (Gmail/Calendar)
- **Supabase Account**
- **Trello API Key/Token**

---

## 🔧 Setup Instructions

### 1. Backend Setup (Python)

```bash
cd /path/to/cognito
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Frontend Setup (Next.js)

```bash
cd dashboard
npm install
```

### 3. Environment Variables (.env)

Create a `.env` file in the root directory:

```env
# AI Providers
GOOGLE_AI_API_KEY=AIzaSy...
GROQ_API_KEY=gsk_...

# Google Cloud (Gmail/Calendar)
GMAIL_CREDENTIALS_PATH=./credentials.json
GMAIL_TOKEN_PATH=./token.json

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

**1. Ingestion Engine (Backend):**
```bash
# Process new emails
python src/scripts/ingest_hub.py
```

**2. Dashboard (Frontend):**
```bash
cd dashboard
npm run dev
# Open http://localhost:3000
```

---

## 🏗️ Architecture

```
6 Email Sources
       │
       ▼
Central Gmail Hub
       │
       ▼
Ingestion Script ──▶ Blocklist / No-Fly Zone
       │
       ▼
LLM Router (Gemini / Groq)
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
