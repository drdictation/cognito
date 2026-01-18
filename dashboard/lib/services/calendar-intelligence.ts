/**
 * Cognito Calendar Intelligence Service - Phase 7b
 * Handles smart calendar features:
 * - Event detection from email content
 * - Priority-based slot finding with bumping
 * - Conflict detection and resolution
 * - Protected calendar management
 */

import { google, calendar_v3 } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'
import type { Priority, DetectedEvent, SchedulingWindow, CognitoEventRow } from '@/lib/types/database'

// Path to credentials (relative to project root)
const CREDENTIALS_PATH = path.join(process.cwd(), '..', 'credentials.json')
const TOKEN_PATH = path.join(process.cwd(), '..', 'token.json')
const TIMEZONE = 'Australia/Melbourne'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface CalendarCredentials {
    installed?: {
        client_id: string
        client_secret: string
        redirect_uris: string[]
    }
    web?: {
        client_id: string
        client_secret: string
    }
}

interface TokenData {
    token: string
    refresh_token: string
    token_uri: string
    client_id: string
    client_secret: string
    scopes: string[]
    expiry?: string
}

interface TimeSlot {
    start: Date
    end: Date
}

interface BumpResult {
    success: boolean
    bumpedEvents: CognitoEventRow[]
    newSlot: TimeSlot
    cascadeWarning?: string
}

interface SlotResult {
    slot: TimeSlot | null
    requiresBumping: boolean
    eventsToBump?: CognitoEventRow[]
    cascadeWarning?: string
}

interface Conflict {
    eventId: string
    summary: string
    start: Date
    end: Date
    isProtected: boolean
}

/**
 * Get authenticated Google Calendar client
 */
async function getCalendarClient(): Promise<calendar_v3.Calendar | null> {
    try {
        if (!fs.existsSync(CREDENTIALS_PATH) || !fs.existsSync(TOKEN_PATH)) {
            console.error('Calendar credentials not found')
            return null
        }

        const credentialsContent = fs.readFileSync(CREDENTIALS_PATH, 'utf-8')
        const credentials: CalendarCredentials = JSON.parse(credentialsContent)
        const clientConfig = credentials.installed || credentials.web

        if (!clientConfig) {
            console.error('Invalid credentials format')
            return null
        }

        const tokenContent = fs.readFileSync(TOKEN_PATH, 'utf-8')
        const tokenData: TokenData = JSON.parse(tokenContent)

        const auth = new OAuth2Client(
            clientConfig.client_id,
            clientConfig.client_secret,
            credentials.installed?.redirect_uris?.[0]
        )

        auth.setCredentials({
            access_token: tokenData.token,
            refresh_token: tokenData.refresh_token,
            expiry_date: tokenData.expiry ? new Date(tokenData.expiry).getTime() : undefined
        })

        return google.calendar({ version: 'v3', auth })
    } catch (e) {
        console.error('Failed to initialize calendar client:', e)
        return null
    }
}

/**
 * Check if a calendar is protected from bumping
 */
export async function isProtectedCalendar(calendarName: string): Promise<boolean> {
    const { data } = await (supabase
        .from('protected_calendars') as any)
        .select('calendar_name')
        .eq('calendar_name', calendarName.toUpperCase())
        .single()

    return !!data
}

/**
 * Get active scheduling windows for a given day and priority
 */
async function getSchedulingWindows(
    dayOfWeek: number,
    isCritical: boolean
): Promise<SchedulingWindow[]> {
    const { data, error } = await (supabase
        .from('scheduling_windows') as any)
        .select('*')
        .eq('day_of_week', dayOfWeek)
        .eq('is_active', true)

    if (error || !data) {
        console.error('Failed to fetch scheduling windows:', error)
        return []
    }

    // Filter by priority level
    return data.filter((window: any) => {
        if (window.priority_level === 'all') return true
        if (window.priority_level === 'critical_only') return isCritical
        return false
    })
}

/**
 * Get conflicts for a proposed time slot
 */
export async function getConflicts(
    proposedStart: Date,
    proposedEnd: Date
): Promise<Conflict[]> {
    const calendar = await getCalendarClient()
    if (!calendar) return []

    try {
        // Get list of all calendars
        const calendarListRes = await calendar.calendarList.list()
        const calendars = calendarListRes.data.items || []

        const conflicts: Conflict[] = []

        // Check each calendar for conflicts
        for (const cal of calendars) {
            if (!cal.id) continue

            const eventsRes = await calendar.events.list({
                calendarId: cal.id,
                timeMin: proposedStart.toISOString(),
                timeMax: proposedEnd.toISOString(),
                singleEvents: true
            })

            const events = eventsRes.data.items || []

            for (const event of events) {
                if (!event.start || !event.end) continue

                const eventStart = new Date(event.start.dateTime || event.start.date!)
                const eventEnd = new Date(event.end.dateTime || event.end.date!)

                // Check if there's overlap
                if (eventStart < proposedEnd && eventEnd > proposedStart) {
                    const isProtected = await isProtectedCalendar(cal.summary || '')

                    conflicts.push({
                        eventId: event.id!,
                        summary: event.summary || 'Untitled Event',
                        start: eventStart,
                        end: eventEnd,
                        isProtected
                    })
                }
            }
        }

        return conflicts
    } catch (e) {
        console.error('Failed to get conflicts:', e)
        return []
    }
}

/**
 * Find Cognito-managed events that can be bumped
 */
async function getBumpableEvents(
    start: Date,
    end: Date,
    currentPriority: Priority
): Promise<CognitoEventRow[]> {
    const { data, error } = await (supabase
        .from('cognito_events') as any)
        .select('*')
        .eq('is_active', true)
        .gte('scheduled_end', start.toISOString())
        .lte('scheduled_start', end.toISOString())

    if (error || !data) {
        console.error('Failed to fetch bumpable events:', error)
        return []
    }

    // Filter by priority (can only bump lower or equal priority)
    const priorityOrder: Record<Priority, number> = {
        'Critical': 4,
        'High': 3,
        'Normal': 2,
        'Low': 1
    }

    const currentPriorityValue = priorityOrder[currentPriority]

    return data.filter((event: any) => {
        const eventPriorityValue = priorityOrder[event.priority as Priority]
        return eventPriorityValue < currentPriorityValue
    })
}

/**
 * Calculate default deadline based on priority
 */
export function getDefaultDeadline(priority: Priority): Date {
    const now = new Date()
    const deadline = new Date(now)

    switch (priority) {
        case 'Critical':
            deadline.setHours(17, 0, 0, 0) // Today 5pm
            break
        case 'High':
            deadline.setDate(deadline.getDate() + 3)
            break
        case 'Normal':
            deadline.setDate(deadline.getDate() + 7)
            break
        case 'Low':
            deadline.setDate(deadline.getDate() + 14)
            break
    }

    return deadline
}

/**
 * Find next available slot with bumping support
 */
export async function findSlotWithBumping(
    durationMinutes: number,
    priority: Priority,
    deadline: Date,
    isCritical: boolean = false
): Promise<SlotResult> {
    const now = new Date()
    const searchEnd = new Date(Math.min(deadline.getTime(), now.getTime() + (14 * 24 * 60 * 60 * 1000)))

    let current = new Date(now)
    current.setMinutes(Math.ceil(current.getMinutes() / 30) * 30, 0, 0)

    const durationMs = durationMinutes * 60 * 1000

    while (current < searchEnd) {
        const dayOfWeek = current.getDay()
        const windows = await getSchedulingWindows(dayOfWeek, isCritical)

        if (windows.length === 0) {
            // No windows for this day, skip to next day
            current.setDate(current.getDate() + 1)
            current.setHours(0, 0, 0, 0)
            continue
        }

        // Try each window
        for (const window of windows) {
            const [startHour, startMin] = window.start_time.split(':').map(Number)
            const [endHour, endMin] = window.end_time.split(':').map(Number)

            const windowStart = new Date(current)
            windowStart.setHours(startHour, startMin, 0, 0)

            const windowEnd = new Date(current)
            windowEnd.setHours(endHour, endMin, 0, 0)

            // Skip if current time is past this window
            if (current > windowEnd) continue

            // Adjust current to window start if before it
            let slotStart = new Date(Math.max(current.getTime(), windowStart.getTime()))
            const slotEnd = new Date(slotStart.getTime() + durationMs)

            // Check if slot fits in window
            if (slotEnd > windowEnd) continue

            // Check for conflicts
            const conflicts = await getConflicts(slotStart, slotEnd)

            // Filter out protected events
            const nonProtectedConflicts = conflicts.filter(c => !c.isProtected)

            if (conflicts.length === 0) {
                // Perfect! No conflicts
                return {
                    slot: { start: slotStart, end: slotEnd },
                    requiresBumping: false
                }
            }

            if (nonProtectedConflicts.length > 0) {
                // Check if these are bumpable Cognito events
                const bumpableEvents = await getBumpableEvents(slotStart, slotEnd, priority)

                if (bumpableEvents.length > 0 && bumpableEvents.length === nonProtectedConflicts.length) {
                    // Can bump these events
                    const cascadeWarning = bumpableEvents.length > 1
                        ? `This will bump ${bumpableEvents.length} existing tasks`
                        : undefined

                    return {
                        slot: { start: slotStart, end: slotEnd },
                        requiresBumping: true,
                        eventsToBump: bumpableEvents,
                        cascadeWarning
                    }
                }
            }

            // Move to end of conflict and try again
            const latestConflictEnd = Math.max(...conflicts.map(c => c.end.getTime()))
            current = new Date(latestConflictEnd)
        }

        // Move to next day
        current.setDate(current.getDate() + 1)
        current.setHours(0, 0, 0, 0)
    }

    // No slot found within deadline
    return {
        slot: null,
        requiresBumping: false
    }
}

/**
 * Bump an event to a new time slot
 */
export async function bumpEvent(
    eventId: string,
    newSlot: TimeSlot,
    bumpedBy: string
): Promise<BumpResult> {
    const calendar = await getCalendarClient()
    if (!calendar) {
        return { success: false, bumpedEvents: [], newSlot }
    }

    try {
        // Get the Cognito event record
        const { data: cognitoEvent, error } = await (supabase
            .from('cognito_events') as any)
            .select('*')
            .eq('id', eventId)
            .single()

        if (error || !cognitoEvent) {
            console.error('Cognito event not found:', error)
            return { success: false, bumpedEvents: [], newSlot }
        }

        // Update Google Calendar event
        await calendar.events.patch({
            calendarId: 'primary',
            eventId: cognitoEvent.google_event_id,
            requestBody: {
                start: {
                    dateTime: newSlot.start.toISOString(),
                    timeZone: TIMEZONE
                },
                end: {
                    dateTime: newSlot.end.toISOString(),
                    timeZone: TIMEZONE
                }
            }
        })

        // Update Cognito event record
        const { data: updated } = await (supabase
            .from('cognito_events') as any)
            .update({
                scheduled_start: newSlot.start.toISOString(),
                scheduled_end: newSlot.end.toISOString(),
                bumped_by: bumpedBy,
                bump_count: cognitoEvent.bump_count + 1,
                updated_at: new Date().toISOString()
            })
            .eq('id', eventId)
            .select()
            .single()

        return {
            success: true,
            bumpedEvents: updated ? [updated] : [],
            newSlot
        }
    } catch (e) {
        console.error('Failed to bump event:', e)
        return { success: false, bumpedEvents: [], newSlot }
    }
}

/**
 * Undo a bump by restoring original time
 */
export async function undoBump(eventId: string): Promise<boolean> {
    const calendar = await getCalendarClient()
    if (!calendar) return false

    try {
        const { data: cognitoEvent, error } = await (supabase
            .from('cognito_events') as any)
            .select('*')
            .eq('id', eventId)
            .single()

        if (error || !cognitoEvent || !cognitoEvent.original_start || !cognitoEvent.original_end) {
            console.error('Cannot undo bump - no original time stored')
            return false
        }

        // Restore in Google Calendar
        await calendar.events.patch({
            calendarId: 'primary',
            eventId: cognitoEvent.google_event_id,
            requestBody: {
                start: {
                    dateTime: cognitoEvent.original_start,
                    timeZone: TIMEZONE
                },
                end: {
                    dateTime: cognitoEvent.original_end,
                    timeZone: TIMEZONE
                }
            }
        })

        // Update Cognito event record
        await (supabase
            .from('cognito_events') as any)
            .update({
                scheduled_start: cognitoEvent.original_start,
                scheduled_end: cognitoEvent.original_end,
                bumped_by: null,
                bump_count: Math.max(0, cognitoEvent.bump_count - 1),
                updated_at: new Date().toISOString()
            })
            .eq('id', eventId)

        return true
    } catch (e) {
        console.error('Failed to undo bump:', e)
        return false
    }
}

/**
 * Create a detected event in the database
 */
export async function saveDetectedEvent(
    taskId: string,
    event: DetectedEvent
): Promise<string | null> {
    const { data, error } = await (supabase
        .from('detected_events') as any)
        .insert({
            task_id: taskId,
            event_type: event.event_type,
            title: event.title,
            proposed_start: event.proposed_start,
            proposed_end: event.proposed_end,
            duration_minutes: event.duration_minutes,
            location: event.location,
            attendees: event.attendees,
            is_all_day: false,
            confidence: event.confidence,
            source_text: event.source_text,
            status: 'pending'
        })
        .select('id')
        .single()

    if (error) {
        console.error('Failed to save detected event:', error)
        return null
    }

    return data?.id || null
}
