/**
 * Cognito Calendar Service - Phase 3c
 * Handles Google Calendar operations for time-blocking from the dashboard.
 * Uses the existing token.json from Python scripts.
 */

import { google, calendar_v3 } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import * as fs from 'fs'
import * as path from 'path'

// Path to credentials (relative to project root)
const CREDENTIALS_PATH = path.join(process.cwd(), '..', 'credentials.json')
const TOKEN_PATH = path.join(process.cwd(), '..', 'token.json')

// Working hours for scheduling (Melbourne time)
// User's availability: 8pm - 9:30pm on Sun, Mon, Tue, Wed, Thu
const WORK_START_HOUR = 20  // 8pm
const WORK_END_HOUR = 21    // 9pm (9:30 is handled via end offset)
const WORK_END_MINUTE = 30  // 9:30pm
const TIMEZONE = 'Australia/Melbourne'

// Days when tasks can be scheduled (0 = Sunday, 6 = Saturday)
const WORK_DAYS = [0, 1, 2, 3, 4]  // Sunday, Monday, Tuesday, Wednesday, Thursday

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

/**
 * Get authenticated Google Calendar client using existing token.
 */
async function getCalendarClient(): Promise<calendar_v3.Calendar | null> {
    try {
        // Check if credentials and token exist
        if (!fs.existsSync(CREDENTIALS_PATH)) {
            console.error('Credentials file not found:', CREDENTIALS_PATH)
            return null
        }
        if (!fs.existsSync(TOKEN_PATH)) {
            console.error('Token file not found:', TOKEN_PATH)
            return null
        }

        // Load credentials
        const credentialsContent = fs.readFileSync(CREDENTIALS_PATH, 'utf-8')
        const credentials: CalendarCredentials = JSON.parse(credentialsContent)
        const clientConfig = credentials.installed || credentials.web

        if (!clientConfig) {
            console.error('Invalid credentials format')
            return null
        }

        // Load token
        const tokenContent = fs.readFileSync(TOKEN_PATH, 'utf-8')
        const tokenData: TokenData = JSON.parse(tokenContent)

        // Create OAuth2 client
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

        // Return calendar client
        return google.calendar({ version: 'v3', auth })
    } catch (e) {
        console.error('Failed to initialize calendar client:', e)
        return null
    }
}

interface TimeSlot {
    start: Date
    end: Date
}

/**
 * Get busy times from all calendars for a given time range.
 */
async function getBusyTimes(
    calendar: calendar_v3.Calendar,
    startTime: Date,
    endTime: Date
): Promise<TimeSlot[]> {
    try {
        // Get list of calendars
        const calendarListRes = await calendar.calendarList.list()
        const calendars = calendarListRes.data.items || []

        // Map calendar IDs to primary status
        const calendarMap = new Map<string, boolean>()
        const calendarIds: { id: string }[] = []

        calendars.forEach(c => {
            if (c.id) {
                calendarIds.push({ id: c.id })
                calendarMap.set(c.id, c.primary || false)
            }
        })

        if (calendarIds.length === 0) {
            calendarIds.push({ id: 'primary' })
            calendarMap.set('primary', true)
        }

        // Get free/busy info
        const freeBusyRes = await calendar.freebusy.query({
            requestBody: {
                timeMin: startTime.toISOString(),
                timeMax: endTime.toISOString(),
                items: calendarIds
            }
        })

        // Collect all busy times
        const busyTimes: TimeSlot[] = []
        const calendarsData = freeBusyRes.data.calendars || {}

        for (const calId of Object.keys(calendarsData)) {
            const calData = calendarsData[calId]
            const isPrimary = calendarMap.get(calId) ?? false

            for (const busy of calData.busy || []) {
                if (busy.start && busy.end) {
                    const start = new Date(busy.start)
                    const end = new Date(busy.end)

                    // HEURISTIC: Filter out "All Day" or multi-day events from NON-PRIMARY calendars
                    // "Son on Camp" (Family Calendar) -> Ignore
                    // "Leave" (Primary Calendar) -> Keep (Busy)
                    const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)

                    if (!isPrimary && durationHours >= 20) {
                        console.log(`Ignoring long event on non-primary calendar (${calId}): ${start.toISOString()} (${durationHours}h)`)
                        continue
                    }

                    busyTimes.push({ start, end })
                }
            }
        }

        // Sort by start time
        busyTimes.sort((a, b) => a.start.getTime() - b.start.getTime())

        return busyTimes
    } catch (e) {
        console.error('Failed to get busy times:', e)
        return []
    }
}

/**
 * Get the hour in Melbourne timezone for a given Date.
 */
function getMelbourneHour(date: Date): number {
    return parseInt(date.toLocaleString('en-AU', {
        timeZone: TIMEZONE,
        hour: 'numeric',
        hour12: false
    }))
}

/**
 * Get the day of week in Melbourne timezone (0 = Sunday, 6 = Saturday).
 */
function getMelbourneDayOfWeek(date: Date): number {
    const dayStr = date.toLocaleString('en-AU', {
        timeZone: TIMEZONE,
        weekday: 'short'
    })
    const days: Record<string, number> = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 }
    return days[dayStr] ?? 0
}

/**
 * Find the next available time slot of the given duration.
 * All time calculations are done in Melbourne timezone.
 * Only schedules during 8pm-9:30pm on Sun, Mon, Tue, Wed, Thu.
 */
async function findNextAvailableSlot(
    calendar: calendar_v3.Calendar,
    durationMinutes: number,
    searchDays: number = 14  // Search 2 weeks since limited hours
): Promise<TimeSlot | null> {
    const now = new Date()
    const searchEnd = new Date(now)
    searchEnd.setDate(searchEnd.getDate() + searchDays)

    const busyTimes = await getBusyTimes(calendar, now, searchEnd)

    // Start from now, round up to next half hour
    let current = new Date(now)
    current.setMinutes(Math.ceil(current.getMinutes() / 30) * 30, 0, 0)

    const durationMs = durationMinutes * 60 * 1000

    while (current < searchEnd) {
        const melbourneHour = getMelbourneHour(current)
        const melbourneDayOfWeek = getMelbourneDayOfWeek(current)

        // Skip non-work days (Friday = 5, Saturday = 6)
        if (!WORK_DAYS.includes(melbourneDayOfWeek)) {
            current.setDate(current.getDate() + 1)
            current.setHours(WORK_START_HOUR, 0, 0, 0)
            continue
        }

        // Skip before working hours (before 8pm Melbourne)
        if (melbourneHour < WORK_START_HOUR) {
            current.setHours(current.getHours() + (WORK_START_HOUR - melbourneHour), 0, 0, 0)
            continue
        }

        // Skip after working hours (after 9:30pm Melbourne)
        if (melbourneHour > WORK_END_HOUR ||
            (melbourneHour === WORK_END_HOUR && current.getMinutes() >= WORK_END_MINUTE)) {
            current.setDate(current.getDate() + 1)
            current.setHours(WORK_START_HOUR, 0, 0, 0)
            continue
        }

        // Calculate slot end
        const slotEnd = new Date(current.getTime() + durationMs)
        const slotEndMelbourneHour = getMelbourneHour(slotEnd)
        const slotEndMinute = slotEnd.getMinutes()

        // Check if slot end goes past work hours (9:30pm Melbourne)
        if (slotEndMelbourneHour > WORK_END_HOUR ||
            (slotEndMelbourneHour === WORK_END_HOUR && slotEndMinute > WORK_END_MINUTE)) {
            current.setDate(current.getDate() + 1)
            current.setHours(WORK_START_HOUR, 0, 0, 0)
            continue
        }

        // Check if this slot conflicts with any busy time
        let hasConflict = false
        for (const busy of busyTimes) {
            // Conflict if slot overlaps with busy time
            if (current < busy.end && slotEnd > busy.start) {
                hasConflict = true
                // Move current to end of this busy time
                current = new Date(busy.end)
                break
            }
        }

        if (!hasConflict) {
            console.log(`Found slot: ${current.toLocaleString('en-AU', { timeZone: TIMEZONE })} - ${slotEnd.toLocaleString('en-AU', { timeZone: TIMEZONE })}`)
            return { start: current, end: slotEnd }
        }
    }

    return null
}

export interface CalendarEventResult {
    eventId: string
    eventUrl: string
    scheduledStart: Date
    scheduledEnd: Date
}

/**
 * Create a calendar event for time-blocking.
 */
export async function createTimeBlockEvent(
    title: string,
    description: string,
    durationMinutes: number,
    trelloUrl?: string,
    taskId?: string,
    priority?: string,
    deadline?: Date
): Promise<CalendarEventResult | null> {
    const calendar = await getCalendarClient()
    if (!calendar) {
        console.log('Calendar client not available')
        return null
    }

    // Find next available slot
    const slot = await findNextAvailableSlot(calendar, durationMinutes)
    if (!slot) {
        console.log('No available slot found in next 7 days')
        return null
    }

    // Build event description
    let fullDescription = description
    if (trelloUrl) {
        fullDescription += `\n\n📋 Trello Card: ${trelloUrl}`
    }
    fullDescription += '\n\n---\n*Scheduled by Cognito AI Executive Assistant*'

    try {
        const eventRes = await calendar.events.insert({
            calendarId: 'primary',
            requestBody: {
                summary: title,
                description: fullDescription,
                start: {
                    dateTime: slot.start.toISOString(),
                    timeZone: TIMEZONE
                },
                end: {
                    dateTime: slot.end.toISOString(),
                    timeZone: TIMEZONE
                },
                visibility: 'private',
                // Phase 7b: Add metadata for bump eligibility
                extendedProperties: {
                    private: {
                        cognito_managed: 'true',
                        task_id: taskId || '',
                        priority: priority || 'Normal',
                        deadline: deadline?.toISOString() || ''
                    }
                },
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'popup', minutes: 10 }
                    ]
                }
            }
        })

        const event = eventRes.data
        console.log(`Created calendar event: ${title} at ${slot.start.toISOString()}`)

        // Phase 7b: Save to cognito_events table for bump tracking
        if (taskId && priority) {
            try {
                const { createAdminClient } = await import('@/lib/supabase/server')
                const supabase = createAdminClient()

                await (supabase
                    .from('cognito_events') as any)
                    .insert({
                        task_id: taskId,
                        google_event_id: event.id!,
                        title: title,
                        scheduled_start: slot.start.toISOString(),
                        scheduled_end: slot.end.toISOString(),
                        priority: priority,
                        deadline: deadline?.toISOString() || null,
                        original_start: slot.start.toISOString(),
                        original_end: slot.end.toISOString(),
                        is_active: true
                    })
            } catch (e) {
                console.error('Failed to save to cognito_events:', e)
                // Don't fail the whole operation
            }
        }

        return {
            eventId: event.id!,
            eventUrl: event.htmlLink!,
            scheduledStart: slot.start,
            scheduledEnd: slot.end
        }
    } catch (e) {
        console.error('Failed to create calendar event:', e)
        return null
    }
}

/**
 * Schedule a task on the calendar.
 */
export async function scheduleTask(
    taskId: string,
    subject: string,
    domain: string,
    summary: string,
    suggestedAction: string,
    estimatedMinutes: number,
    trelloUrl?: string,
    priority?: string,
    deadline?: Date
): Promise<CalendarEventResult | null> {
    const title = `[${domain}] ${subject.substring(0, 50)}`
    const description = `**Summary:** ${summary}\n\n**Action:** ${suggestedAction}`

    // Use at least 5 minutes, max 120 minutes
    const duration = Math.max(5, Math.min(estimatedMinutes || 30, 120))

    return createTimeBlockEvent(title, description, duration, trelloUrl, taskId, priority, deadline)
}
