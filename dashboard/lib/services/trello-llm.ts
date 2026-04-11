import { GoogleGenerativeAI } from '@google/generative-ai'
import { TrelloCardEnrichment } from '@/lib/types/trello-planner'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '')

const SYSTEM_PROMPT = `You are redesigning Cognito into a Trello-centric task enrichment layer.

You are given a Trello card created by forwarding an email into Trello. Your job is to enrich the card conservatively.

Rules:
- Outlook remains the email client. Do not act like an email assistant.
- Treat the card as a committed task-intent item.
- Default to ONE task per card.
- Preserve the original source material. Your output is additive, not destructive.
- Be conservative with inference. Especially due dates and urgency.
- Rewrite vague titles into clear action-oriented task titles.
- Do not invent work that is not strongly supported by the card.

Return JSON only with:
{
  "title": "Action-oriented task title, conservative, max 80 chars",
  "summary": "One or two concise sentences describing the work",
  "nextAction": "Single clear next step starting with a verb",
  "taskType": "Reply|Admin|Review|Deep Work|Waiting|Personal",
  "effort": "5 min|15 min|30 min|60 min|90+ min",
  "dueDate": "YYYY-MM-DD or null",
  "priority": "High|Medium|Low",
  "source": "Optional short source/account note or null"
}

Guidance:
- "Reply" is for clear response tasks.
- "Admin" is for lightweight coordination or logistics.
- "Review" is for reading/checking material without major creation.
- "Deep Work" is for substantial focused thinking/writing/preparation.
- "Waiting" is only if the card is mainly blocked or delegated already.
- "Personal" is for family/home/personal life items.
- Effort must use the exact coarse buckets.
- Due dates must be explicit or very high confidence. Otherwise null.
- Priority should be High only for clearly urgent/important items, Medium for standard near-term work, Low for later/non-urgent work.
`

function parseJsonObject(text: string): string {
    const trimmed = text.trim()
    const codeBlockMatch = trimmed.match(/```(?:json)?\n?([\s\S]*?)\n?```/)
    if (codeBlockMatch) return codeBlockMatch[1].trim()

    const objectMatch = trimmed.match(/\{[\s\S]*\}/)
    return objectMatch ? objectMatch[0] : trimmed
}

export async function analyzeTrelloCard(cardName: string, cardDescription: string): Promise<TrelloCardEnrichment | null> {
    if (!process.env.GOOGLE_AI_API_KEY) {
        return null
    }

    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' })
        const now = new Date().toLocaleString('en-AU', {
            timeZone: 'Australia/Melbourne',
            dateStyle: 'full',
            timeStyle: 'long',
        })

        const prompt = `Current date/time in Melbourne: ${now}

Trello card title:
${cardName}

Trello card description / forwarded email content:
"""
${cardDescription.slice(0, 12000)}
"""
`

        const result = await model.generateContent({
            contents: [
                { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
                { role: 'model', parts: [{ text: 'Understood. I will return JSON only.' }] },
                { role: 'user', parts: [{ text: prompt }] },
            ],
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 1200,
            },
        })

        const raw = parseJsonObject(result.response.text())
        const parsed = JSON.parse(raw) as TrelloCardEnrichment

        if (!parsed.title || !parsed.summary || !parsed.nextAction || !parsed.taskType || !parsed.effort || !parsed.priority) {
            return null
        }

        return {
            title: parsed.title.trim(),
            summary: parsed.summary.trim(),
            nextAction: parsed.nextAction.trim(),
            taskType: parsed.taskType,
            effort: parsed.effort,
            dueDate: parsed.dueDate || null,
            priority: parsed.priority,
            source: parsed.source || null,
        }
    } catch (error) {
        console.error('Failed to analyze Trello card:', error)
        return null
    }
}
