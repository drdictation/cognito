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
    * **Event Triage UI:** Dedicated "Pending Schedule Items" list for decoupling event approval from task approval.
    * **Conflict Management:** "Create Anyway" functionality to override scheduling conflicts.
    * **Enhanced Triage Controls:** Refined Tweak UI with visual selection feedback and manual time overrides.
    * **Undo Logic:** One-click restoration of original schedule from the dashboard.
* **Production Readiness (Phase 8) [Completed]**
    * **Vercel Optimization:** Full migration of ingestion logic to TypeScript for serverless compatibility.
    * **Cloud Auth:** Transition to environment-variable-based Google OAuth (no filesystem dependencies).
    * **Centralized API:** Unified Google Auth and Gmail services for consistent cross-app access.
    * **Embedded Intelligence:** System prompt embedded in service code to eliminate file-read overhead.
* **Explicit Deadlines & Intelligent Scheduling (Phase 9a) [Completed]**
    * **User-Defined Deadlines:** Tasks can have explicit deadlines set by user or inferred by AI from email content.
    * **Database-Driven Scheduling Windows:** Flexible scheduling windows stored in Supabase, queryable by day and priority.
    * **Intelligent Bumping Logic:** Critical tasks can bump lower-priority events; bumped events automatically find new slots.
    * **All-Day Event Handling:** Family calendar all-day events are ignored; timed events are respected as conflicts.
    * **Critical Conflict Prevention:** System prevents double-booking of Critical tasks by checking existing Critical events.
    * **Extended Deadline for Bumped Events:** Bumped events use 2-week extended deadline to ensure they find new slots.
* **Multi-Session Task Chunking (Phase 9b) [Completed]**
    * **AI-Driven Chunking:** AI detects tasks requiring multiple sessions and suggests optimal breakdown.
    * **Configurable Parameters:** User can adjust session count, duration, and cadence (daily/weekly).
    * **Session Management:** Individual sessions tracked in database with status and scheduling.
    * **Integrated UI:** SessionsSuggestion component in TaskCard for reviewing and accepting chunking recommendations.



### H. Native Calendar & Time Tracking (Phase 10) [Completed]
* **Native Calendar Page:**
    * Dedicated `/calendar` route with 8am-10pm time grid.
    * Read-only overlay of Google Calendar events for context.
    * Interactive "Time Blocks" representing scheduled Cognito tasks.
* **Execution & Time Tracking:**
    * **Start/Stop Timer:** Users can start, pause, and resume tasks directly from the calendar.
    * **Live Timer:** Persistent "Active Task" timer visible across the dashboard.
    * **Actual vs. Estimated:** System records actual duration and calculates accuracy ratio for future learning.
    * **Visual States:** Blue (Scheduled), Yellow (Running), Orange (Paused), Green (Completed).
* **Analytics & Stats:**
    * **Weekly Focus Hours:** Tracks total deep work time.
    * **Task Completion Count:** Daily/Weekly velocity.
    * **AI Accuracy:** Feedback loop on how well the AI estimated the duration.
* **Trello Integration:**
    * "Open in Trello" deep link on every time block.
    * Automatic upload of email attachments to the Trello card upon task completion.

## 4. Success Metrics
* **Accuracy:** User accepts >80% of AI prioritization suggestions without editing.
* **Latency:** Daily Briefing generation takes <30 seconds.
* **Peace of Mind:** "No-Fly Zone" is strictly respected.
* **Friction:** "Reply Now" requires <2 clicks to send a response.