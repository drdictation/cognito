/**
 * Email Ingestion Service
 * TypeScript port of Python ingestion logic from src/scripts/ingest_hub.py
 */

import { fetchUnprocessedEmails, labelEmailAsProcessed, type Email } from './gmail'
import { analyzeTaskContent } from './llm'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface IngestionResult {
    success: boolean
    processed: number
    blocked: number
    errors: number
    message: string
}

export interface SingleProcessResult {
    done: boolean
    subject?: string
    status?: 'processed' | 'blocked' | 'error'
    error?: string
}

/**
 * Extract original sender from forwarded email
 */
function extractOriginalSender(email: Email): { sender: string; source: string } {
    const body = email.body

    const forwardPattern = /From:\s*(?:.*?<)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?/i
    const match = body.match(forwardPattern)

    let sender: string
    if (match) {
        sender = match[1].toLowerCase()
    } else {
        const fromMatch = email.from.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/)
        sender = fromMatch ? fromMatch[1].toLowerCase() : 'unknown@unknown.com'
    }

    const source = mapSenderToSource(sender)

    if (source === 'ms365_hospital') {
        const { subject: cleanSubject, body: cleanBody } = cleanForwardedContent(email.subject, email.body)
        if (cleanBody !== email.body) {
            email.subject = cleanSubject
            email.body = cleanBody
        }
    }

    return { sender, source }
}

function cleanForwardedContent(subject: string, body: string): { subject: string, body: string } {
    let cleanSubject = subject;
    let cleanBody = body;

    cleanSubject = cleanSubject.replace(/^((?:(?:FW|Fwd|RE|Re):\s*)+)/i, '').trim();

    const forwardHeaderPattern = /From:\s*[\s\S]*?\n\s*Sent:\s*[\s\S]*?\n\s*To:\s*[\s\S]*?\n\s*Subject:\s*[\s\S]*?\n/i;
    const match = cleanBody.match(forwardHeaderPattern);

    if (match && match.index !== undefined) {
        const endOfMatch = match.index + match[0].length;
        cleanBody = cleanBody.substring(endOfMatch).trim();
    }

    return { subject: cleanSubject, body: cleanBody };
}

function mapSenderToSource(email: string): string {
    const domain = email.split('@')[1]?.toLowerCase() || ''

    if (domain.includes('hospital.org.au') || domain.includes('health.vic.gov.au')) {
        return 'ms365_hospital'
    } else if (domain.includes('unimelb.edu.au')) {
        return 'ms365_university'
    } else if (domain.includes('privatepractice.com.au')) {
        return 'gmail_private_practice'
    } else if (domain.includes('project-domain.com')) {
        return 'gmail_project'
    } else if (domain.includes('gmail.com')) {
        return 'gmail_personal'
    } else if (domain.includes('hotmail.com') || domain.includes('outlook.com')) {
        return 'hotmail_legacy'
    } else {
        return 'gmail_personal'
    }
}

async function checkBlocklist(sender: string): Promise<boolean> {
    try {
        const { data, error } = await (supabase
            .from('blocklist') as any)
            .select('email_pattern')
            .eq('is_active', true)

        if (error) return false

        for (const item of data || []) {
            const pattern = item.email_pattern.replace(/%/g, '.*')
            if (new RegExp(pattern, 'i').test(sender)) {
                return true
            }
        }
        return false
    } catch {
        return false
    }
}

const TIMEZONE = 'Australia/Melbourne'

function getMelbourneDayAndHour(date: Date): { day: number; hour: number } {
    const formatter = new Intl.DateTimeFormat('en-AU', {
        timeZone: TIMEZONE,
        weekday: 'short',
        hour: 'numeric',
        hour12: false
    })
    const parts = formatter.formatToParts(date)
    const weekday = parts.find(p => p.type === 'weekday')?.value || 'Sun'
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10)
    const days: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
    return { day: days[weekday] ?? 0, hour }
}

function isNoFlyZone(domain?: string): boolean {
    if (domain === 'Home' || domain === 'Hobby') return false

    const now = new Date()
    const { day, hour } = getMelbourneDayAndHour(now)

    if (day === 5 && hour >= 17) return true
    if (day === 6) return true
    if (day === 0 && hour < 18) return true

    return false
}

export async function saveToInboxQueue(
    email: Email,
    assessment: any,
    originalSender: string,
    sourceAccount: string
): Promise<void> {
    const isAutoTask = email.subject.toUpperCase().includes('COGNITO')
    const initialStatus = isAutoTask ? 'approved' : 'pending'

    let finalSubject = email.subject
    if (assessment.smart_subject) {
        const isGeneric =
            email.subject.toUpperCase().includes('COGNITO') ||
            email.subject.toUpperCase().startsWith('FW:') ||
            email.subject.toUpperCase().startsWith('FWD:') ||
            email.subject.trim().length === 0

        if (isGeneric) {
            finalSubject = assessment.smart_subject
        }
    }

    const data = {
        message_id: email.message_id,
        original_source_email: sourceAccount,
        real_sender: originalSender,
        subject: finalSubject,
        received_at: email.date,
        source: 'email',
        original_content: email.body,
        forwarded_from: email.from,
        ai_assessment: assessment,
        ai_domain: assessment.domain,
        ai_priority: assessment.priority,
        ai_summary: assessment.summary,
        ai_suggested_action: assessment.suggested_action,
        ai_estimated_minutes: assessment.estimated_minutes,
        status: initialStatus,
        ai_inferred_deadline: assessment.inferred_deadline || null,
        ai_deadline_confidence: assessment.deadline_confidence || null,
        ai_deadline_source: assessment.deadline_source || null,
        model_used: 'gemini-3.1-flash-lite-preview',
        is_simple_response: assessment.is_simple_response || false,
        draft_response: assessment.draft_response || null,
        execution_status: isAutoTask ? 'scheduled' : 'pending'
    }

    try {
        const { data: savedTask, error } = await (supabase
            .from('inbox_queue') as any)
            .upsert(data, { onConflict: 'message_id' })
            .select('id')
            .single()

        if (error) throw error

        if (isAutoTask && savedTask?.id) {
            if (assessment.detected_events) {
                const { saveDetectedEvent } = await import('@/lib/services/calendar-intelligence')
                for (const event of assessment.detected_events) {
                    await saveDetectedEvent(savedTask.id, event)
                }
            }

            const { executeTask } = await import('@/lib/services/execution')
            await executeTask(savedTask.id)

            try {
                const { generateKnowledgeSuggestion } = await import('@/lib/services/learning')
                await generateKnowledgeSuggestion(savedTask.id)
            } catch (e) {
                console.error('Learning error during auto-task:', e)
            }
        }
    } catch (error) {
        console.error('Error saving to Supabase:', error)
        throw error
    }
}

/**
 * Saves a poison/failed email to inbox queue so it's not totally lost
 */
async function saveFailedToInboxQueue(
    email: Email,
    originalSender: string,
    sourceAccount: string,
    errorMessage: string
) {
    const data = {
        message_id: email.message_id,
        original_source_email: sourceAccount,
        real_sender: originalSender,
        subject: email.subject,
        received_at: email.date,
        source: 'email',
        original_content: email.body,
        forwarded_from: email.from,
        status: 'pending',
        processing_error: errorMessage,
        retry_count: 1
    }

    await (supabase.from('inbox_queue') as any)
        .upsert(data, { onConflict: 'message_id' })
}

/**
 * Process exactly one email to prevent timeout.
 * Returns done: true when inbox is empty.
 */
export async function processNextEmail(): Promise<SingleProcessResult> {
    const emails = await fetchUnprocessedEmails(1)

    if (!emails || emails.length === 0) {
        return { done: true }
    }

    const email = emails[0]
    console.log(`\nProcessing single email: ${email.subject.substring(0, 50)}...`)

    try {
        const { sender, source } = extractOriginalSender(email)

        if (await checkBlocklist(sender)) {
            await labelEmailAsProcessed(email.id)
            return { done: false, subject: email.subject, status: 'blocked' }
        }

        const assessment = await analyzeTaskContent(email.body)

        if (!assessment) {
            await saveFailedToInboxQueue(email, sender, source, "AI Assessment Failed (returned null)")
            await labelEmailAsProcessed(email.id)
            return { done: false, subject: email.subject, status: 'error', error: "AI assessment failed" }
        }

        await saveToInboxQueue(email, assessment, sender, source)
        await labelEmailAsProcessed(email.id)

        return { done: false, subject: email.subject, status: 'processed' }

    } catch (error) {
        console.error(`Error processing email ${email.subject}:`, error)
        try {
            const { sender, source } = extractOriginalSender(email)
            await saveFailedToInboxQueue(email, sender, source, error instanceof Error ? error.message : "Unknown processing error")
            await labelEmailAsProcessed(email.id)
        } catch (fallbackError) {
            // hard failure, just label to avoid infinite loop
            await labelEmailAsProcessed(email.id)
        }
        return {
            done: false,
            subject: email.subject,
            status: 'error',
            error: error instanceof Error ? error.message : String(error)
        }
    }
}

/**
 * Starts a new ingestion log in Supabase
 */
export async function createIngestionLog() {
    const { data } = await (supabase.from('ingestion_log') as any)
        .insert({ source: 'manual_sync', status: 'partial' })
        .select('id')
        .single()

    return data?.id
}

/**
 * Updates the ingestion log
 */
export async function updateIngestionLog(
    logId: string,
    stats: { processed: number, blocked: number, errors: number, found: number },
    errorDetails: { subject: string, error: string }[]
) {
    // End time assumed to be now, compute if we tracked start, but we won't bother with duration for now
    const status = stats.errors > 0 ? (stats.processed > 0 ? 'partial' : 'failed') : 'success'

    await (supabase.from('ingestion_log') as any)
        .update({
            emails_found: stats.found,
            processed: stats.processed,
            blocked: stats.blocked,
            errors: stats.errors,
            error_details: errorDetails,
            status: status
        })
        .eq('id', logId)
}

/**
 * FOR BACKWARD COMPAT (NOT USED BY NEW UI, but kept just in case)
 */
export async function processEmails(): Promise<IngestionResult> {
    return { success: true, processed: 0, blocked: 0, errors: 0, message: "Use processNextEmail instead" }
}
