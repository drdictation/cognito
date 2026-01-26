/**
 * Email Ingestion Service
 * TypeScript port of Python ingestion logic from src/scripts/ingest_hub.py
 */

import { fetchUnreadEmails, markEmailAsRead, type Email } from './gmail'
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

/**
 * Extract original sender from forwarded email
 */
function extractOriginalSender(email: Email): { sender: string; source: string } {
    const body = email.body

    // Check for forwarded email patterns in body
    // Pattern: "From: Name <email@domain.com>"
    const forwardPattern = /From:\s*(?:.*?<)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?/i
    const match = body.match(forwardPattern)

    let sender: string
    if (match) {
        sender = match[1].toLowerCase()
        console.log(`Extracted original sender from body: ${sender}`)
    } else {
        // Fallback to From header
        const fromMatch = email.from.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/)
        sender = fromMatch ? fromMatch[1].toLowerCase() : 'unknown@unknown.com'
        console.warn(`Could not extract from forwarded body, using From header: ${sender}`)
    }

    // Map sender domain to source account
    const source = mapSenderToSource(sender)

    // Special handling for SVHA forwarded emails to clean headers
    if (source === 'ms365_hospital') {
        const { subject: cleanSubject, body: cleanBody } = cleanForwardedContent(email.subject, email.body)
        if (cleanBody !== email.body) {
            console.log('Cleaned SVHA forwarding headers from content')
            // Mutate the email object temporarily for this processing scope
            // logic implies we want to analyze the CLEANED content
            email.subject = cleanSubject
            email.body = cleanBody
        }
    }

    return { sender, source }
}

/**
 * Clean forwarded email content, specifically for SVHA/Outlook forwarding blocks
 */
function cleanForwardedContent(subject: string, body: string): { subject: string, body: string } {
    let cleanSubject = subject;
    let cleanBody = body;

    // 1. Clean Subject
    // Remove "FW: " or "Fwd: " case insensitive from start
    cleanSubject = cleanSubject.replace(/^((?:(?:FW|Fwd|RE|Re):\s*)+)/i, '').trim();

    // 2. Clean Body
    // Look for Outlook/Exchange style forwarding block
    // From: ...
    // Sent: ...
    // To: ...
    // Subject: ...
    const forwardHeaderPattern = /From:\s*[\s\S]*?\n\s*Sent:\s*[\s\S]*?\n\s*To:\s*[\s\S]*?\n\s*Subject:\s*[\s\S]*?\n/i;

    const match = cleanBody.match(forwardHeaderPattern);

    if (match && match.index !== undefined) {
        // Found a forwarding block.
        // Remove this block and EVERYTHING BEFORE IT 
        const endOfMatch = match.index + match[0].length;
        cleanBody = cleanBody.substring(endOfMatch).trim();
    }

    return { subject: cleanSubject, body: cleanBody };
}

/**
 * Map email address to source account
 */
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
        console.warn(`Unknown domain: ${domain}, defaulting to gmail_personal`)
        return 'gmail_personal'
    }
}

/**
 * Check if sender matches blocklist patterns
 */
async function checkBlocklist(sender: string): Promise<boolean> {
    try {
        const { data, error } = await (supabase
            .from('blocklist') as any)
            .select('email_pattern')
            .eq('is_active', true)

        if (error) {
            console.error('Error checking blocklist:', error)
            return false
        }

        for (const item of data || []) {
            // Convert SQL LIKE pattern to regex
            const pattern = item.email_pattern.replace(/%/g, '.*')
            if (new RegExp(pattern, 'i').test(sender)) {
                console.log(`Sender ${sender} matched blocklist pattern: ${item.email_pattern}`)
                return true
            }
        }

        return false
    } catch (error) {
        console.error('Error checking blocklist:', error)
        return false
    }
}

/**
 * Check if current time is in No-Fly Zone (Friday 17:00 - Sunday 18:00)
 */
function isNoFlyZone(domain?: string): boolean {
    // Bypass for Home/Hobby domains
    if (domain === 'Home' || domain === 'Hobby') {
        return false
    }

    const now = new Date()
    const day = now.getDay() // 0 = Sunday, 6 = Saturday
    const hour = now.getHours()

    // Friday after 17:00
    if (day === 5 && hour >= 17) {
        console.log('No-Fly Zone active: Friday after 17:00')
        return true
    }

    // Saturday (all day)
    if (day === 6) {
        console.log('No-Fly Zone active: Saturday')
        return true
    }

    // Sunday before 18:00
    if (day === 0 && hour < 18) {
        console.log('No-Fly Zone active: Sunday before 18:00')
        return true
    }

    return false
}

/**
 * Save email and AI assessment to inbox_queue
 */
export async function saveToInboxQueue(
    email: Email,
    assessment: any,
    originalSender: string,
    sourceAccount: string
): Promise<void> {
    const isAutoTask = email.subject.toUpperCase().includes('COGNITO')
    const initialStatus = isAutoTask ? 'approved' : 'pending'

    // Phase 11: Smart Subject Replacement
    // If subject is generic ("COGNITO", "FW:"), prefer the AI-generated smart_subject
    let finalSubject = email.subject
    if (assessment.smart_subject) {
        const isGeneric =
            email.subject.toUpperCase().includes('COGNITO') ||
            email.subject.toUpperCase().startsWith('FW:') ||
            email.subject.toUpperCase().startsWith('FWD:') ||
            email.subject.trim().length === 0

        if (isGeneric) {
            console.log(`Replacing generic subject "${email.subject}" with smart_subject: "${assessment.smart_subject}"`)
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
        model_used: 'gemini-2.0-flash-lite',
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

        console.log(`Saved to inbox_queue: ${email.subject} (Status: ${initialStatus})`)

        // Phase 11: Auto-Task Execution
        if (isAutoTask && savedTask?.id) {
            console.log(`⚡ AUTO-TASK DETECTED: Executing ${savedTask.id}`)

            // 1. Save detected events first (needed for scheduling)
            if (assessment.detected_events) {
                const { saveDetectedEvent } = await import('@/lib/services/calendar-intelligence')
                for (const event of assessment.detected_events) {
                    await saveDetectedEvent(savedTask.id, event)
                }
            }

            // 2. Execute Task (Trello + Calendar)
            const { executeTask } = await import('@/lib/services/execution')
            await executeTask(savedTask.id)

            // 3. Learning Loop
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
 * Main ingestion pipeline
 */
export async function processEmails(): Promise<IngestionResult> {
    console.log('='.repeat(60))
    console.log('Cognito Email Ingestion Pipeline')
    console.log('='.repeat(60))

    let processed = 0
    let blocked = 0
    let errors = 0

    try {
        // Fetch unread emails
        const emails = await fetchUnreadEmails()

        if (emails.length === 0) {
            console.log('No unread emails to process')
            return {
                success: true,
                processed: 0,
                blocked: 0,
                errors: 0,
                message: 'No unread emails'
            }
        }

        // Process each email
        for (const email of emails) {
            try {
                console.log(`\nProcessing: ${email.subject.substring(0, 50)}...`)

                // Extract original sender
                const { sender, source } = extractOriginalSender(email)
                console.log(`Original sender: ${sender} (Source: ${source})`)

                // Check blocklist
                if (await checkBlocklist(sender)) {
                    console.log(`Skipping blocked sender: ${sender}`)
                    blocked++
                    await markEmailAsRead(email.id)
                    continue
                }

                // Analyze with Gemini
                const assessment = await analyzeTaskContent(email.body)

                if (!assessment) {
                    console.error(`Failed to get AI assessment for: ${email.subject}`)
                    errors++
                    continue
                }

                // Check No-Fly Zone
                if (isNoFlyZone(assessment.domain)) {
                    console.log('No-Fly Zone active - ingesting silently')
                }

                // Save to database
                await saveToInboxQueue(email, assessment, sender, source)

                // Mark as read
                await markEmailAsRead(email.id)

                processed++

                // Small delay for rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000))

            } catch (error) {
                console.error(`Error processing email ${email.subject}:`, error)
                errors++
            }
        }

        console.log('\n' + '='.repeat(60))
        console.log(`Processed: ${processed}`)
        console.log(`Blocked: ${blocked}`)
        console.log(`Errors: ${errors}`)
        console.log('='.repeat(60))

        return {
            success: true,
            processed,
            blocked,
            errors,
            message: `Processed ${processed} emails`
        }

    } catch (error) {
        console.error('Ingestion pipeline error:', error)
        return {
            success: false,
            processed,
            blocked,
            errors,
            message: error instanceof Error ? error.message : 'Unknown error'
        }
    }
}
