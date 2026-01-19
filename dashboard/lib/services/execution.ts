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

    // Phase 3c: Create calendar time block using INTELLIGENT scheduler
    let calendarResult: {
        eventId: string
        eventUrl: string
        scheduledStart: Date
        scheduledEnd: Date
    } | null = null

    try {
        // Use intelligent scheduler with database-driven windows and bumping
        const { scheduleTaskIntelligent } = await import('./calendar-intelligence')
        const typedTask = task as InboxTask
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
        }
    } catch (e) {
        console.warn('Calendar scheduling skipped:', e)
        // Don't fail if calendar fails - Trello card is still created
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
