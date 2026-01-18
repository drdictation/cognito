# Product Requirements Document: Cognito v1

## 1. Executive Summary
**Product:** "Cognito" – A Bespoke AI Executive Assistant for a Consultant Gastroenterologist.
**Core Value:** Reduces cognitive load by triaging inputs (Email/Voice) into a "Daily Briefing" for user approval before execution.
**Philosophy:** "Decision Support First, Automation Later." The AI proposes; the user disposes.

## 2. User Persona
* **Role:** Gastroenterologist (Public/Private), Researcher (PhD supervisor), Committee Member, Micro-SaaS Developer.
* **Key Pain Point:** Context switching between deep clinical work and administrative "noise."
* **Workflow:**
    * **Input:** Forwarded emails (Work/Personal), Voice dictation while driving.
    * **Review:** A single "Daily Briefing" (Web UI) showing prioritized tasks.
    * **Action:** Approved tasks move to Trello; Schedule blocks move to Google Calendar.

## 3. Functional Requirements (v1 MVP - Completed ✅)

### A. Ingestion Layer [Completed]
* **Gmail:** Poll a dedicated `chamarabfwd@gmail.com` for new forwarded messages.
* **Filter:** Ignore known "spam" or "newsletter" senders based on a regex blocklist.

### B. The Intelligence Engine (LLM) [Completed]
* **Visual Triage:** Classify emails into Domains (Clinical, Research, Admin, Home, Hobby).
* **Hybrid Routing:**
    * **70% Fast:** Gemini 2.5 Flash Lite for routine triage.
    * **30% Thinking:** Groq (Llama-3-70b) for complex reasoning battles.
* **Scoring:** Assign Priority (Critical, High, Normal, Low) based on the "Eisenhower Matrix".
* **Drafting:** Generate a "Reasoning" summary for *why* a decision was made.

### C. The Constraints Engine [Completed]
* **"No-Fly Zone":** Friday 17:00 - Sunday 18:00.
    * *Behavior:* Ingests silently. No notifications. "Social/Home" items bypass the block.
* **"Math Alert":** (Planned for future release)

### D. User Interface (The Briefing) [Completed]
* **Format:** Mobile-responsive Next.js Dashboard.
* **Actions:** "Approve" (Execute), "Change Priority", "Snooze", "Reject".
* **Live Updates:** Real-time visibility of ingestion pipeline.

### E. Execution Engine [Completed]
* **Trello Integration:**
    * Approved tasks create cards in "Cognito Task Queue".
    * Lists map to deadlines: Today, Tomorrow, This Week.
    * Rich description includes full email context and AI summary.
* **Calendar Integration:**
    * AI estimates task duration (from 5 to 120 mins).
    * System finds next available slot in Google Calendar (8pm-9:30pm Sun-Thu).
    * Blocks time with a link back to the Trello card.

### F. Drafting Assistant (Phase 5) [Completed]
* **Simple Response Detection:**
    * AI identifies "Simple" emails (confirmations, thank yous, scheduling).
    * Automatically generates a draft reply signed "Chamara".
* **Draft Editor:**
    * UI to review, edit, or regenerate the draft.
    * "Regenerate" accepts user instructions (e.g. "Make it more formal").
* **Hybrid Reply Workflow:**
    * **"Reply Now" Button:** Opens user's local mail client (Outlook/Mail) with `mailto:` link.
    * Pre-fills To, Subject, and Body (Draft).
    * Avoids "Forwarding Loop" issues by sending directly from user's client.

### G. Manual Task Addition (Phase 6) [Completed]
* **Free-form Writing:**
    * User can type a task in plain text.
    * AI analyzes content and determines Domain, Priority, Summary, and Suggested Action.
* **Voice Dictation:**
    * Integrated voice recording via `whisper-large-v3` (Groq API).
    * Real-time transcription and AI classification.
* **Entry Point:** Floating Action Button (FAB) on the Daily Briefing dashboard.
* **Domain Knowledge System (Phase 7a) [Completed]**
    * **Dynamic Context:** AI references domain-specific markdown "cheat sheets" for better decision making.
    * **Contacts Database:** Key contacts with linked priorities and roles.
    * **Learning Suggestions:** AI identifies new patterns from approved tasks and suggests knowledge updates.
    * **Two-Pass Drafting:** Context-aware email drafting using domain-specific rules and tone.
* **Smart Calendar Features (Phase 7b) [Completed]**
    * **Event Detection:** AI extracts `Meeting`, `Deadline`, `Appointment`, and `Reminder` types from content.
    * **Default Durations:** Automatic 45-minute booking for meetings/appointments if not specified.
    * **Priority-Based Bumping:** Critical tasks automatically reschedule lower-priority "Focus Time" blocks.
    * **Protected Calendars:** Any event on a calendar named "ICLOUD" is immune to bumping.
    * **Scheduling Windows:** Expanded availability (9am-12pm Tuesdays) and critical overflow windows (7:30pm-10pm).
    * **Undo Logic:** One-click restoration of original schedule from the dashboard.

## 4. Success Metrics
* **Accuracy:** User accepts >80% of AI prioritization suggestions without editing.
* **Latency:** Daily Briefing generation takes <30 seconds.
* **Peace of Mind:** "No-Fly Zone" is strictly respected.
* **Friction:** "Reply Now" requires <2 clicks to send a response.