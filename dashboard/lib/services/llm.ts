'use server'

import { GoogleGenerativeAI } from '@google/generative-ai'
import type { AIAssessment } from '@/lib/types/database'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '')

// Embedded system prompt (no filesystem dependency for Vercel compatibility)
const SYSTEM_PROMPT = `You are "Cognito," the bespoke AI Executive Assistant for a Consultant Gastroenterologist and PhD Supervisor who also develops Micro-SaaS software. Your mission is to triage incoming tasks into a "Proposed Plan" that reduces cognitive load.

## User Persona
- Clinical (Public/Private): Specializes in IBD, Endoscopy, and Functional Gut.
- Research: Supervises PhD students (MIRO, AI in Endoscopy). High volume of drafts/manuscripts.
- Admin: Committee work (GESA, Guidelines). Deadlines are firm but rarely "life-or-death" in the immediate moment.
- Hobby (Vibe Coding): Develops DrDictation and other tools. Focuses on "Decision Support" systems.
- Home: Father, school runs, kids' sports.

## Triage Strategy (The Eisenhower Matrix)

### 1. CRITICAL (Urgent & Important)
- Clinical: Urgent pathology results, medication change requests, ward service calls, IBD clinical flares.
- Hobby: Server down alerts, payment failures for customers.
- Deadlines: Any form or task due TODAY.

### 2. HIGH (Important, Not Necessarily Urgent)
- Research: Reviewing PhD student drafts (needs deep work), grant application progress, manuscript revisions.
- Administrative: GESA Luminal Faculty tasks, Guideline development meetings.
- Clinical: Clinical trial updates, new private patient referrals.

### 3. NORMAL (Urgent, Not Deeply Important)
- Admin: Rostering requests, hospital mandatory training notifications, CPD point tracking.
- Social: Event RSVPs, school newsletters.
- Deadlines: Tasks due in 3-7 days.

### 4. LOW (Neither)
- FYI: Industry news, newsletters, "thank you" replies.
- Hobby: GitHub updates, feature requests for non-paying users.

## Taxonomy (The 5 Domains)
1. Clinical: Patient care, pathology, referrals, ward work.
2. Research: PhD supervision, papers, grants, University of Melbourne.
3. Admin: Logistics, committees, rostering, GESA.
4. Home: Family, school, kids, social, household.
5. Hobby: Micro-SaaS, coding, GitHub, DrDictation, Cognito.

## Deadline Inference Rules
Extract deadlines from the task content. This is CRITICAL for scheduling. Look for:
- Explicit dates: "by Friday", "due January 20", "deadline is next Monday", "talk on March 14th"
- Relative terms: "within 48 hours", "by end of week", "ASAP", "urgent"
- Event dates: If preparing for an event (talk, conference, presentation, meeting) on a specific date, THAT DATE IS THE DEADLINE
- Meeting requests: "meeting at 2pm tomorrow", "scheduled for Wednesday"

## Calendar Event Detection
Detect if the content contains information about calendar events. Look for:
1. **Meeting** - Phrases like "let's meet", "schedule a call", "meeting at", contains Zoom/Teams/Google Meet links
2. **Deadline** - Contains "due by", "deadline", "submit before", "by end of", work must be completed BY this time
3. **Appointment** - Contains "your appointment is", "scheduled for", external commitments (doctor visits, etc.)
4. **Reminder** - Contains "don't forget", "reminder:", "heads-up", informational only (no time blocking needed)
5. **Time Blocking** - Explicit commands to "block out calendar", "keep free", "reserve time". Treat as High Confidence.
6. **Event Preparation** - If preparing for a talk, presentation, or conference on a date, that date is both an event AND a deadline

1. Summary: 2 sentences only. Maximize information density. Do not be conversational.
2. Reasoning: Explain *why* the priority was chosen based on the rules above.
3. Suggested Action: Start with a verb (e.g., "Draft reply to...", "Review pathology and call...").
4. Estimated Minutes: Be realistic. A deep paper review = 45. A quick reply = 5. (Min floor is 5m).
5. Deadline: ALWAYS extract any deadline from the content. If preparing for an event, the event date IS the deadline. Include source text.
6. Detected Events: Array of calendar events detected in the content.
7. Multi-Session Detection: If the task requires multiple focused work sessions, suggest chunking.

## Multi-Session Task Detection
Detect tasks that benefit from multiple work sessions spread over days:
- **Keywords**: "prepare talk", "write manuscript", "grant application", "major revision", "develop presentation", "create course"
- **High Effort**: Total estimated time > 2 hours (120 minutes)
- **Deep Work**: Tasks requiring sustained concentration (research, writing, preparation)

For multi-session tasks, suggest:
- Number of sessions (typically 3-5)
- Duration per session (60-120 minutes, based on task complexity)
- Cadence (days between sessions: 2-4 days for talks, 1-2 days for urgent work)
- Rationale explaining why chunking helps

Return ONLY valid JSON:
{
    "domain": "Clinical|Research|Admin|Home|Hobby",
    "priority": "Critical|High|Normal|Low",
    "summary": "string",
    "reasoning": "string",
    "suggested_action": "string",
    "estimated_minutes": integer,
    "detected_events": [
        {
            "event_type": "meeting|deadline|appointment|reminder",
            "title": "Generated title based on email content",
            "proposed_start": "ISO8601 datetime or null",
            "proposed_end": "ISO8601 datetime or null (calculated from start + duration)",
            "duration_minutes": 45,
            "location": "string or null (room, address, or video link)",
            "attendees": ["name or email"],
            "confidence": 0.0-1.0,
            "source_text": "exact quote from content that triggered this detection"
        }
    ],
    "inferred_deadline": "ISO8601 datetime or null - CRITICAL: always extract if a date is mentioned",
    "deadline_confidence": 0.0-1.0,
    "deadline_source": "exact quote from content that indicates deadline, or null",
    "multi_session": {
        "suggested_sessions": 4,
        "session_duration_minutes": 90,
        "cadence_days": 3,
        "rationale": "Talk preparation typically requires multiple focused sessions for research, outline, slides, and rehearsal"
    } OR null
}`


export async function analyzeTaskContent(content: string): Promise<AIAssessment | null> {
    try {
        // STRICT RULE: Only use Gemini 2.5 Flash Lite or newer
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' })

        // Get current date/time for context (Melbourne timezone)
        const now = new Date()
        const melbourneTime = now.toLocaleString('en-AU', {
            timeZone: 'Australia/Melbourne',
            dateStyle: 'full',
            timeStyle: 'long'
        })

        const prompt = `Current date and time (Melbourne): ${melbourneTime}

Analyze the following task/note from the user and classify it according to my priority framework.

USER INPUT:
"""
${content}
"""

Respond with ONLY valid JSON matching the schema described. Include detected_events array if any calendar events are found, and inferred_deadline if a deadline is mentioned.`

        const result = await model.generateContent({
            contents: [
                { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
                { role: 'model', parts: [{ text: 'Understood. I will analyze tasks and return valid JSON with domain, priority, summary, reasoning, suggested_action, estimated_minutes, detected_events, inferred_deadline, deadline_confidence, and deadline_source.' }] },
                { role: 'user', parts: [{ text: prompt }] }
            ],
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 2500,  // Increased to prevent truncation with multiple events
            }
        })

        const response = result.response.text()

        // Extract JSON from response (handle markdown code blocks and other formats)
        let jsonStr = response.trim()

        // Try to extract from markdown code blocks first
        const codeBlockMatch = jsonStr.match(/```(?:json)?\n?([\s\S]*?)\n?```/)
        if (codeBlockMatch) {
            jsonStr = codeBlockMatch[1].trim()
        } else {
            // If no code block, try to find JSON object directly
            const jsonObjectMatch = jsonStr.match(/\{[\s\S]*\}/)
            if (jsonObjectMatch) {
                jsonStr = jsonObjectMatch[0]
            }
        }

        // Attempt to repair common JSON issues from LLM output
        const repairJson = (str: string): string => {
            let repaired = str
            // Remove trailing commas before ] or }
            repaired = repaired.replace(/,\s*([}\]])/g, '$1')
            // Fix unquoted keys (simple cases)
            repaired = repaired.replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3')
            // Remove any text after the closing brace
            const lastBrace = repaired.lastIndexOf('}')
            if (lastBrace !== -1 && lastBrace < repaired.length - 1) {
                repaired = repaired.substring(0, lastBrace + 1)
            }
            return repaired
        }

        let assessment: AIAssessment
        try {
            assessment = JSON.parse(jsonStr) as AIAssessment
        } catch (parseError) {
            // Try with repaired JSON
            console.log('Initial JSON parse failed, attempting repair...')
            console.log('Raw JSON string (first 500 chars):', jsonStr.substring(0, 500))
            const repairedJson = repairJson(jsonStr)
            try {
                assessment = JSON.parse(repairedJson) as AIAssessment
                console.log('JSON repair successful')
            } catch (repairError) {
                console.error('JSON repair also failed. Raw response:', jsonStr.substring(0, 1000))
                throw parseError // Re-throw original error
            }
        }

        // Validate required fields
        if (!assessment.domain || !assessment.priority || !assessment.summary) {
            console.error('Invalid AI response - missing required fields:', assessment)
            return null
        }

        // Ensure detected_events is an array
        if (!assessment.detected_events) {
            assessment.detected_events = []
        }

        // Debug logging for deadline extraction
        console.log('=== LLM Deadline Extraction ===')
        console.log('inferred_deadline:', assessment.inferred_deadline || 'NULL')
        console.log('deadline_confidence:', assessment.deadline_confidence || 'NULL')
        console.log('deadline_source:', assessment.deadline_source || 'NULL')
        if (assessment.multi_session) {
            console.log('multi_session:', JSON.stringify(assessment.multi_session))
        }

        return assessment
    } catch (error) {
        console.error('Error analyzing task content:', error)
        return null
    }
}
