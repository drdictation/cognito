/**
 * Cognito Execution Service - Phase 3c
 * Handles Trello card creation and calendar scheduling from the dashboard.
 */

import { createClient } from '@supabase/supabase-js'
import { InboxTask } from '@/lib/types/database'

// Create untyped Supabase client for columns not in generated types
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Trello API Configuration
const TRELLO_API_KEY = process.env.TRELLO_API_KEY
const TRELLO_TOKEN = process.env.TRELLO_TOKEN
const TRELLO_BASE_URL = 'https://api.trello.com/1'

// Board configuration
const BOARD_NAME = 'Cognito Task Queue'
const LIST_NAMES = {
    today: '🔥 Today',
    tomorrow: '📅 Tomorrow',
    this_week: '📆 This Week',
    later: '🗓️ Later',
    completed: '✅ Completed'
}

const DOMAIN_COLORS: Record<string, string> = {
    Clinical: 'red',
    Research: 'purple',
    Admin: 'blue',
    Home: 'green',
    Hobby: 'orange'
}

const PRIORITY_EMOJI: Record<string, string> = {
    Critical: '🔴',
    High: '🟠',
    Normal: '🟡',
    Low: '🔵'
}

// =====================================================
// TRELLO API FUNCTIONS
// =====================================================

async function getTrelloBoards(): Promise<{ id: string; name: string }[]> {
    const res = await fetch(
        `${TRELLO_BASE_URL}/members/me/boards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&fields=name,id`
    )
    if (!res.ok) throw new Error('Failed to fetch Trello boards')
    return res.json()
}

async function getBoardLists(boardId: string): Promise<{ id: string; name: string }[]> {
    const res = await fetch(
        `${TRELLO_BASE_URL}/boards/${boardId}/lists?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&fields=name,id`
    )
    if (!res.ok) throw new Error('Failed to fetch board lists')
    return res.json()
}

async function findOrCreateBoard(): Promise<string | null> {
    try {
        const boards = await getTrelloBoards()
        const existing = boards.find(b => b.name === BOARD_NAME)
        if (existing) return existing.id

        // Create board
        const res = await fetch(
            `${TRELLO_BASE_URL}/boards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&name=${encodeURIComponent(BOARD_NAME)}&defaultLists=false`,
            { method: 'POST' }
        )
        if (!res.ok) throw new Error('Failed to create board')
        const board = await res.json()
        return board.id
    } catch (e) {
        console.error('Trello board error:', e)
        return null
    }
}

async function getListIds(boardId: string): Promise<Record<string, string>> {
    const lists = await getBoardLists(boardId)
    const listMap: Record<string, string> = {}

    for (const [key, name] of Object.entries(LIST_NAMES)) {
        const existing = lists.find(l => l.name === name)
        if (existing) {
            listMap[key] = existing.id
        } else {
            // Create list
            const res = await fetch(
                `${TRELLO_BASE_URL}/lists?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&name=${encodeURIComponent(name)}&idBoard=${boardId}`,
                { method: 'POST' }
            )
            if (res.ok) {
                const newList = await res.json()
                listMap[key] = newList.id
            }
        }
    }

    return listMap
}

function determineTargetList(task: InboxTask, listIds: Record<string, string>): string {
    const now = new Date()
    const todayEnd = new Date(now)
    todayEnd.setHours(23, 59, 59)
    const tomorrowEnd = new Date(now)
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 1)
    tomorrowEnd.setHours(23, 59, 59)
    const weekEnd = new Date(now)
    weekEnd.setDate(weekEnd.getDate() + 7)

    // Critical always goes to today
    if (task.ai_priority === 'Critical') {
        return listIds.today || listIds.later
    }

    // Check deadline
    const deadline = task.ai_inferred_deadline
    if (deadline) {
        const deadlineDate = new Date(deadline)
        if (deadlineDate <= todayEnd) return listIds.today || listIds.later
        if (deadlineDate <= tomorrowEnd) return listIds.tomorrow || listIds.later
        if (deadlineDate <= weekEnd) return listIds.this_week || listIds.later
    }

    // Use priority
    if (task.ai_priority === 'High') {
        return listIds.this_week || listIds.later
    }

    return listIds.later
}

async function getOrCreateLabel(boardId: string, name: string, color: string): Promise<string | null> {
    try {
        const res = await fetch(
            `${TRELLO_BASE_URL}/boards/${boardId}/labels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
        )
        const labels = await res.json()
        const existing = labels.find((l: { name: string }) => l.name === name)
        if (existing) return existing.id

        const createRes = await fetch(
            `${TRELLO_BASE_URL}/labels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&name=${encodeURIComponent(name)}&color=${color}&idBoard=${boardId}`,
            { method: 'POST' }
        )
        if (createRes.ok) {
            const label = await createRes.json()
            return label.id
        }
    } catch (e) {
        console.error('Label error:', e)
    }
    return null
}

interface TrelloCardResult {
    cardId: string
    cardUrl: string
}

async function createTrelloCard(
    listId: string,
    boardId: string,
    task: InboxTask
): Promise<TrelloCardResult | null> {
    const emoji = PRIORITY_EMOJI[task.ai_priority || 'Normal'] || ''
    const subject = (task.subject || 'No Subject').substring(0, 80)
    const title = `${emoji} [${task.ai_priority}] ${subject}`

    const description = `## Task Summary
${task.ai_summary || ''}

## Suggested Action
${task.ai_suggested_action || ''}

---

**📋 Domain:** ${task.ai_domain || 'Unknown'}
**⏱️ Estimated Time:** ${task.ai_estimated_minutes || 0} minutes
**📧 From:** ${task.real_sender || 'Unknown'}
**📅 Deadline:** ${task.ai_inferred_deadline || 'Not set'}

${task.draft_response ? `---
## 📝 Draft Response
${task.draft_response}

` : ''}---
## 📧 Full Email Content
${task.original_content || 'No content provided'}

---
*Created by Cognito AI Executive Assistant*
*Task ID: ${task.id}*`

    // Trello has a 16,384 character limit for card descriptions
    const TRELLO_DESC_LIMIT = 16384
    const truncationNote = '\n\n---\n*⚠️ Content truncated due to length. View full email in source.*'

    let finalDescription = description
    if (description.length > TRELLO_DESC_LIMIT) {
        // Reserve space for truncation note
        const maxLength = TRELLO_DESC_LIMIT - truncationNote.length
        finalDescription = description.substring(0, maxLength) + truncationNote
        console.log(`Trello description truncated from ${description.length} to ${TRELLO_DESC_LIMIT} chars`)
    }

    try {
        const params = new URLSearchParams({
            key: TRELLO_API_KEY!,
            token: TRELLO_TOKEN!,
            idList: listId,
            name: title,
            desc: finalDescription,
            pos: 'top'
        })

        if (task.ai_inferred_deadline) {
            params.append('due', task.ai_inferred_deadline)
        }

        const res = await fetch(`${TRELLO_BASE_URL}/cards?${params}`, { method: 'POST' })
        if (!res.ok) throw new Error('Failed to create card')

        const card = await res.json()

        // Add domain label
        if (task.ai_domain && DOMAIN_COLORS[task.ai_domain]) {
            const labelId = await getOrCreateLabel(boardId, task.ai_domain, DOMAIN_COLORS[task.ai_domain])
            if (labelId) {
                await fetch(
                    `${TRELLO_BASE_URL}/cards/${card.id}/idLabels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&value=${labelId}`,
                    { method: 'POST' }
                )
            }
        }

        return { cardId: card.id, cardUrl: card.url }
    } catch (e) {
        console.error('Card creation error:', e)
        return null
    }
}

// =====================================================
// MAIN EXECUTION FUNCTION
// =====================================================

export interface ExecuteResult {
    success: boolean
    trelloCardId?: string
    trelloCardUrl?: string
    calendarEventId?: string
    calendarEventUrl?: string
    scheduledStart?: string
    scheduledEnd?: string
    error?: string
}

export async function executeTask(taskId: string): Promise<ExecuteResult> {
    console.log('=== executeTask CALLED ===')
    console.log('TaskId:', taskId)

    // Validate Trello config
    if (!TRELLO_API_KEY || !TRELLO_TOKEN) {
        console.log('ERROR: Trello not configured')
        return { success: false, error: 'Trello not configured' }
    }

    const supabase = supabaseAdmin

    // Fetch the task
    const { data: task, error: fetchError } = await (supabase
        .from('inbox_queue') as any)
        .select('*')
        .eq('id', taskId)
        .single()

    if (fetchError || !task) {
        return { success: false, error: 'Task not found' }
    }

    // Get or create Trello board
    const boardId = await findOrCreateBoard()
    if (!boardId) {
        return { success: false, error: 'Failed to access Trello board' }
    }

    // Get list IDs
    const listIds = await getListIds(boardId)
    const targetListId = determineTargetList(task as InboxTask, listIds)

    // Create Trello card
    const cardResult = await createTrelloCard(targetListId, boardId, task as InboxTask)
    if (!cardResult) {
        return { success: false, error: 'Failed to create Trello card' }
    }

    // Phase 3c: Check for linked sessions first (Multi-Session Handling)
    const { getSessionsForTask } = await import('@/lib/actions/sessions')
    const sessions = await getSessionsForTask(taskId)
    const { scheduleTaskIntelligent } = await import('./calendar-intelligence')
    const typedTask = task as InboxTask

    let calendarResult: {
        eventId: string
        eventUrl: string
        scheduledStart: Date
        scheduledEnd: Date
        doubleBookWarning?: string
    } | null = null

    if (sessions.length > 0) {
        console.log(`=== EXECUTING MULTI-SESSION TASK (${sessions.length} chunks) ===`)

        // Get task deadline for backward scheduling
        // Phase 11: Prefer AI inferred deadline if explicit user/system deadline missing
        const taskDeadline = typedTask.user_deadline
            ? new Date(typedTask.user_deadline)
            : typedTask.deadline
                ? new Date(typedTask.deadline)
                : typedTask.ai_inferred_deadline
                    ? new Date(typedTask.ai_inferred_deadline)
                    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Default: 30 days from now

        // Get cadence from first session (all sessions have same cadence)
        const cadenceDays = sessions[0].cadence_days || 3

        // ADAPTIVE CADENCE (Phase 11b)
        // If deadline is too tight, reduce cadence instead of clamping everything to 'now'
        const now = new Date()
        const daysToDeadline = Math.max(0, (taskDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        const requiredDays = sessions.length * cadenceDays

        let effectiveCadence = cadenceDays
        if (requiredDays > daysToDeadline && daysToDeadline > 0) {
            // Squeeze sessions into available time
            // e.g. 6 sessions in 3 days -> 0.5 days (12 hours) apart
            effectiveCadence = Math.max(0.2, (daysToDeadline - 1) / sessions.length) // Minimum 5 hours apart
            console.log(`⚠️ Deadline Constraint: ${daysToDeadline.toFixed(1)} days available for ${sessions.length} sessions (wanted ${requiredDays})`)
            console.log(`   -> Reducing cadence from ${cadenceDays} to ${effectiveCadence.toFixed(2)} days`)
        }

        console.log(`Task Deadline: ${taskDeadline.toISOString()}`)
        console.log(`Cadence: ${cadenceDays} days (Effective: ${effectiveCadence.toFixed(2)})`)
        console.log(`Strategy: Schedule BACKWARD from deadline`)

        // Keep track of locally scheduled slots to prevent race conditions with Google Calendar API
        const scheduledSlots: { start: Date; end: Date }[] = []

        // Loop and schedule each session BACKWARD from deadline
        // Session N (last): scheduled closest to deadline
        // Session 1 (first): scheduled furthest from deadline
        for (let i = 0; i < sessions.length; i++) {
            const session = sessions[i]
            console.log(`Scheduling Session ${session.session_number}: ${session.title}`)

            // Calculate how many days before deadline this session should be
            // Session N -> 0 days before deadline
            // Session N-1 -> effectiveCadence days before deadline
            const daysBeforeDeadline = (sessions.length - 1 - i) * effectiveCadence
            let targetDate = new Date(taskDeadline)
            // Use time-based subtraction for fractional days
            targetDate.setTime(targetDate.getTime() - (daysBeforeDeadline * 24 * 60 * 60 * 1000))

            // If we are using standard cadence, we align to 9am.
            // If we are compressed (fractional cadence), we keep the time flow? 
            // Better to default to 9am but let scheduleTaskIntelligent search from there.
            if (effectiveCadence >= 1) {
                targetDate.setHours(9, 0, 0, 0)
            } else {
                // If compressed, targetDate might be 3pm. That's fine.
                // But we should ensure it's not late night?
                // scheduleTaskIntelligent -> findSlotWithBumping handles working hours.
            }

            // WEEKEND PROTECTION: If target falls on weekend, move to previous Friday
            // This prevents the scheduler from having a tiny search window on a day with no windows
            const dayOfWeek = targetDate.getDay() // 0 = Sunday, 6 = Saturday
            if (dayOfWeek === 0) { // Sunday
                targetDate.setDate(targetDate.getDate() - 2) // Move to Friday
                console.log(`  Weekend protection: Sunday → moved to Friday`)
            } else if (dayOfWeek === 6) { // Saturday
                targetDate.setDate(targetDate.getDate() - 1) // Move to Friday
                console.log(`  Weekend protection: Saturday → moved to Friday`)
            }

            // CRITICAL SAFEGUARD: Never schedule in the past
            // If target date is before now, clamp it to now (plus small buffer)
            const checkNow = new Date()
            if (targetDate < checkNow) {
                console.log(`  Adjusting target date from ${targetDate.toISOString()} to NOW (preventing past scheduling)`)
                targetDate = new Date(checkNow)
                targetDate.setMinutes(Math.ceil(checkNow.getMinutes() / 30) * 30 + 30) // Next 30m slot
            }

            console.log(`  Target date: ${targetDate.toISOString()} (${daysBeforeDeadline.toFixed(2)} days before deadline)`)

            const sessionResult = await scheduleTaskIntelligent(
                taskId,
                `${session.title}: ${typedTask.subject || 'Task'}`,
                typedTask.ai_domain || 'Task',
                typedTask.ai_summary || '',
                typedTask.ai_suggested_action || '',
                session.duration_minutes,
                cardResult.cardUrl,
                session.priority || typedTask.ai_priority || 'Normal',
                taskDeadline,  // Use task deadline for bumping logic
                targetDate,     // Start search from calculated target date
                scheduledSlots  // Exclude slots we just booked in this loop
            )

            if (sessionResult) {
                console.log(`  -> Scheduled: ${sessionResult.scheduledStart.toISOString()}`)

                // Add to local exclusion list
                scheduledSlots.push({
                    start: sessionResult.scheduledStart,
                    end: sessionResult.scheduledEnd
                })

                // Update session record
                await (supabase
                    .from('task_sessions') as any)
                    .update({
                        scheduled_start: sessionResult.scheduledStart.toISOString(),
                        scheduled_end: sessionResult.scheduledEnd.toISOString(),
                        google_event_id: sessionResult.eventId,
                        status: 'scheduled',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', session.id)

                // Use first session as the "main" result for parent task display
                if (i === 0) calendarResult = sessionResult
                if (sessionResult.doubleBookWarning) calendarResult!.doubleBookWarning = sessionResult.doubleBookWarning
            } else {
                console.warn(`  -> FAILED to schedule session ${session.session_number}`)
            }
        }
    } else {
        // Standard single-task scheduling (original logic)
        try {
            calendarResult = await scheduleTaskIntelligent(
                taskId,
                typedTask.subject || 'Cognito Task',
                typedTask.ai_domain || 'Task',
                typedTask.ai_summary || '',
                typedTask.ai_suggested_action || '',
                typedTask.ai_estimated_minutes || 30,
                cardResult.cardUrl,
                typedTask.ai_priority || 'Normal',
                typedTask.user_deadline ? new Date(typedTask.user_deadline) :
                    typedTask.deadline ? new Date(typedTask.deadline) : undefined
            )
            if (calendarResult) {
                console.log(`Calendar event created: ${calendarResult.eventUrl}`)
                if (calendarResult.doubleBookWarning) {
                    console.warn(`Double-book warning: ${calendarResult.doubleBookWarning}`)
                }
            }
        } catch (e) {
            console.warn('Calendar scheduling skipped:', e)
        }
    }

    // Update task with execution details
    // Using raw supabase client to bypass generated type constraints
    const updatePayload: Record<string, unknown> = {
        execution_status: 'scheduled',
        trello_card_id: cardResult.cardId,
        trello_card_url: cardResult.cardUrl,
        executed_at: new Date().toISOString()
    }

    if (calendarResult) {
        updatePayload.calendar_event_id = calendarResult.eventId
        updatePayload.scheduled_start = calendarResult.scheduledStart.toISOString()
        updatePayload.scheduled_end = calendarResult.scheduledEnd.toISOString()
        if (calendarResult.doubleBookWarning) {
            updatePayload.double_book_warning = calendarResult.doubleBookWarning
        }
    }

    const { error: updateError } = await (supabase
        .from('inbox_queue') as any)
        .update(updatePayload)
        .eq('id', taskId)

    if (updateError) {
        console.error('Failed to update task:', updateError)
        // Card was created, so still return success
    }

    return {
        success: true,
        trelloCardId: cardResult.cardId,
        trelloCardUrl: cardResult.cardUrl,
        calendarEventId: calendarResult?.eventId,
        calendarEventUrl: calendarResult?.eventUrl,
        scheduledStart: calendarResult?.scheduledStart.toISOString(),
        scheduledEnd: calendarResult?.scheduledEnd.toISOString()
    }
}
