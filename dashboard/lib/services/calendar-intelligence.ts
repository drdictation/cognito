/**
 * Cognito Calendar Intelligence Service - Phase 10
 * Handles smart calendar features:
 * - Event detection from email content
 * - Priority AND DEADLINE-based slot finding with bumping (deadline is king)
 * - High priority can bump Normal/Low (not just Critical)
 * - Conflict detection and resolution
 * - Protected calendar management (ICLOUD, SVHA, UNIMELB, FAMILY)
 * - Double-book fallback with warnings
 */

import { calendar_v3 } from 'googleapis'
import { getCalendarClient } from './google-auth'
import { createClient } from '@supabase/supabase-js'
import type { Priority, DetectedEvent, SchedulingWindow, CognitoEventRow } from '@/lib/types/database'

const TIMEZONE = 'Australia/Melbourne'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
    doubleBookWarning?: string  // Set when forced to double-book due to no available slots
}

interface Conflict {
    eventId: string
    summary: string
    start: Date
    end: Date
    isProtected: boolean
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
        .order('start_time', { ascending: true })  // CRITICAL: Sort by time!

    if (error || !data) {
        console.error('Failed to fetch scheduling windows:', error)
        return []
    }

    // Filter by priority level
    const filtered = data.filter((window: any) => {
        if (window.priority_level === 'all') return true
        if (window.priority_level === 'critical_only') return isCritical
        return false
    })

    console.log(`  Windows for day ${dayOfWeek}: ${filtered.map((w: any) => w.name + ' (' + w.start_time + ')').join(', ')}`)
    return filtered
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

                // Check if this is an all-day event (has date but not dateTime)
                const isAllDay = !event.start.dateTime && !!event.start.date

                // Skip all-day events from non-protected calendars
                // (e.g., family calendar "Kiran summer school" is informational, not blocking)
                const isProtected = await isProtectedCalendar(cal.summary || '')
                if (isAllDay && !isProtected) {
                    console.log(`    Skipping all-day event: ${event.summary} (non-protected calendar)`)
                    continue
                }

                const eventStart = new Date(event.start.dateTime || event.start.date!)
                const eventEnd = new Date(event.end.dateTime || event.end.date!)

                // Check if there's overlap
                if (eventStart < proposedEnd && eventEnd > proposedStart) {
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
 * DEADLINE IS KING: A task can bump another if:
 * 1. It has higher priority, OR
 * 2. It has a sooner deadline (regardless of priority)
 * 
 * Only Cognito-managed events can be bumped - external calendar events are never touched.
 */
async function getBumpableEvents(
    start: Date,
    end: Date,
    currentPriority: Priority,
    currentDeadline?: Date
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

    const priorityOrder: Record<Priority, number> = {
        'Critical': 4,
        'High': 3,
        'Normal': 2,
        'Low': 1
    }

    const currentPriorityValue = priorityOrder[currentPriority]

    return data.filter((event: any) => {
        const eventPriorityValue = priorityOrder[event.priority as Priority]
        const eventDeadline = event.deadline ? new Date(event.deadline) : null

        // Can bump if:
        // 1. Current task has higher priority
        const hasHigherPriority = eventPriorityValue < currentPriorityValue

        // 2. DEADLINE IS KING: Current task has a sooner deadline
        //    (only applies if both tasks have deadlines)
        const hasSoonerDeadline = currentDeadline && eventDeadline &&
            currentDeadline.getTime() < eventDeadline.getTime()

        const canBump = hasHigherPriority || hasSoonerDeadline

        if (canBump) {
            console.log(`    Can bump '${event.title}' (priority: ${event.priority}, deadline: ${eventDeadline?.toISOString() || 'none'})`)
            if (hasSoonerDeadline && !hasHigherPriority) {
                console.log(`      Reason: DEADLINE IS KING - current deadline ${currentDeadline.toISOString()} < event deadline ${eventDeadline?.toISOString()}`)
            }
        }

        return canBump
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
    isCritical: boolean = false,
    searchStartDate?: Date,
    excludeSlots?: { start: Date; end: Date }[],
    searchBackward: boolean = false
): Promise<SlotResult> {
    const now = new Date()

    // For backward search: start from deadline-1 day, search towards now
    // For forward search: start from searchStartDate or now, search towards deadline
    let start: Date
    let searchEnd: Date

    if (searchBackward) {
        // Start from day before deadline, search backwards to now
        start = new Date(deadline)
        start.setDate(start.getDate() - 1)
        start.setHours(23, 59, 0, 0) // End of day before deadline
        searchEnd = now
        console.log('=== findSlotWithBumping DEBUG (BACKWARD MODE) ===')
    } else {
        start = searchStartDate || now
        searchEnd = new Date(Math.min(deadline.getTime(), start.getTime() + (30 * 24 * 60 * 60 * 1000)))
        console.log('=== findSlotWithBumping DEBUG ===')
    }

    console.log('Now:', now.toISOString())
    console.log('Search Start:', start.toISOString())
    console.log('Duration:', durationMinutes, 'min | Priority:', priority, '| isCritical:', isCritical)
    console.log('Deadline:', deadline.toISOString())
    console.log('Search window:', start.toISOString(), 'to', searchEnd.toISOString())

    let current = new Date(start)
    if (searchBackward) {
        current.setHours(23, 59, 0, 0) // Start from end of day for backward search
    } else {
        current.setMinutes(Math.ceil(current.getMinutes() / 30) * 30, 0, 0)
    }

    const durationMs = durationMinutes * 60 * 1000

    // Helper to check if we should continue searching
    const shouldContinue = () => {
        if (searchBackward) {
            return current > searchEnd // Keep going while current > now
        } else {
            return current < searchEnd
        }
    }

    outerLoop:
    while (shouldContinue()) {
        const dayOfWeek = current.getDay()
        const windows = await getSchedulingWindows(dayOfWeek, isCritical)

        console.log(`Day ${dayOfWeek} (${current.toDateString()}): ${windows.length} windows available`)

        if (windows.length === 0) {
            // No windows for this day, move to next/previous day
            if (searchBackward) {
                current.setDate(current.getDate() - 1)
                current.setHours(23, 59, 0, 0)
            } else {
                current.setDate(current.getDate() + 1)
                current.setHours(0, 0, 0, 0)
            }
            continue
        }

        // Try each window
        // CRITICAL: Preserve the loop date separately from 'current' which may be modified by conflict skipping
        const loopDate = new Date(current)
        loopDate.setHours(0, 0, 0, 0) // Normalize to start of day

        for (const window of windows) {
            const [startHour, startMin] = window.start_time.split(':').map(Number)
            const [endHour, endMin] = window.end_time.split(':').map(Number)

            // Use loopDate for window boundaries to preserve correct date
            const windowStart = new Date(loopDate)
            windowStart.setHours(startHour, startMin, 0, 0)

            const windowEnd = new Date(loopDate)
            windowEnd.setHours(endHour, endMin, 0, 0)

            console.log(`  Checking window: ${window.name} (${windowStart.toISOString()} - ${windowEnd.toISOString()})`)

            // Skip if current time is past this window (ONLY FORWARD SEARCH)
            if (!searchBackward && current > windowEnd) {
                console.log(`    SKIP: current time past window end`)
                continue
            }

            // Adjust slot start to whichever is later: current time or window start
            let slotStart: Date
            if (searchBackward) {
                // For backward search, just use window start (since we know current > windowStart)
                // We are searching days backward, but inside the day we take the first available window
                slotStart = new Date(windowStart)
            } else {
                slotStart = new Date(Math.max(current.getTime(), windowStart.getTime()))
            }
            const slotEnd = new Date(slotStart.getTime() + durationMs)

            console.log(`    Proposed slot: ${slotStart.toISOString()} - ${slotEnd.toISOString()}`)

            // Check manually excluded slots (from multi-session batching)
            if (excludeSlots && excludeSlots.length > 0) {
                const hasOverlap = excludeSlots.some(slot =>
                    (slotStart < slot.end && slotEnd > slot.start)
                )
                if (hasOverlap) {
                    console.log(`    SKIP: overlaps with excluded slot`)
                    // Skip ahead by 30 mins
                    current = new Date(current.getTime() + 30 * 60 * 1000)
                    continue outerLoop
                }
            }

            // Check if slot fits in window
            if (slotEnd > windowEnd) {
                console.log(`    SKIP: slot end exceeds window end`)
                continue
            }

            // Check for conflicts
            const conflicts = await getConflicts(slotStart, slotEnd)
            console.log(`    Conflicts found: ${conflicts.length}`)
            conflicts.forEach(c => console.log(`      - ${c.summary} (${c.isProtected ? 'PROTECTED' : 'non-protected'})`))

            // Filter out protected events
            const nonProtectedConflicts = conflicts.filter(c => !c.isProtected)

            if (conflicts.length === 0) {
                // Perfect! No conflicts
                console.log(`    SUCCESS: No conflicts, using this slot!`)
                return {
                    slot: { start: slotStart, end: slotEnd },
                    requiresBumping: false
                }
            }

            // Get Cognito-managed events that can be bumped (passing deadline for DEADLINE IS KING logic)
            const bumpableEvents = await getBumpableEvents(slotStart, slotEnd, priority, deadline)
            console.log(`    Bumpable Cognito events: ${bumpableEvents.length}`)

            // Check if any conflict is a Critical Cognito event in the database
            // (We can't bump Critical with Critical, so must find another slot)
            // Use strict overlap: event_start < slot_end AND event_end > slot_start
            const { data: criticalConflicts } = await (supabase
                .from('cognito_events') as any)
                .select('id, priority, scheduled_start, scheduled_end')
                .eq('is_active', true)
                .eq('priority', 'Critical')
                .gt('scheduled_end', slotStart.toISOString())  // event ends AFTER slot starts
                .lt('scheduled_start', slotEnd.toISOString())  // event starts BEFORE slot ends

            const hasCriticalConflict = (criticalConflicts?.length || 0) > 0
            console.log(`    Critical Cognito conflicts: ${criticalConflicts?.length || 0}`)
            if (criticalConflicts?.length) {
                criticalConflicts.forEach((c: any) => console.log(`      - ${c.scheduled_start} to ${c.scheduled_end}`))
            }

            // For CRITICAL or HIGH tasks: schedule anyway IF no Critical events in this slot
            // HIGH can bump Normal/Low, CRITICAL can bump all except other Critical
            const canForceSchedule = (isCritical || priority === 'High') && !hasCriticalConflict
            if (canForceSchedule) {
                console.log(`    ${priority.toUpperCase()} TASK: Force-scheduling (no Critical conflicts)`)
                return {
                    slot: { start: slotStart, end: slotEnd },
                    requiresBumping: bumpableEvents.length > 0,
                    eventsToBump: bumpableEvents.length > 0 ? bumpableEvents : undefined,
                    cascadeWarning: bumpableEvents.length > 0
                        ? `Will bump ${bumpableEvents.length} existing tasks`
                        : undefined
                }
            }

            // If there's a Critical conflict, log it and try next window
            if ((isCritical || priority === 'High') && hasCriticalConflict) {
                console.log(`    SKIP: A Critical task already in this slot, trying next window`)
            }

            // For non-Critical tasks: only proceed if ALL conflicts are bumpable
            if (bumpableEvents.length > 0 && bumpableEvents.length === nonProtectedConflicts.length) {
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

            // Conflict exists but can't bump - just move to next window
            console.log(`    Cannot use this slot, trying next window`)
        }

        // Move to next/previous day
        if (searchBackward) {
            current.setDate(current.getDate() - 1)
            current.setHours(23, 59, 0, 0)
        } else {
            current.setDate(current.getDate() + 1)
            current.setHours(0, 0, 0, 0)
        }
    }

    // No slot found within deadline
    // For Critical tasks: FORCE DOUBLE-BOOK with warning (user requested this behavior)
    if (isCritical) {
        console.log('=== CRITICAL FALLBACK: No slot found, forcing double-book ===')

        // Find the earliest possible slot (first available window, ignoring conflicts)
        const fallbackDate = new Date(now)
        fallbackDate.setMinutes(Math.ceil(fallbackDate.getMinutes() / 30) * 30, 0, 0)

        // Search for the first available window to double-book into
        for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
            const checkDate = new Date(fallbackDate)
            checkDate.setDate(checkDate.getDate() + dayOffset)
            checkDate.setHours(0, 0, 0, 0)

            const dayOfWeek = checkDate.getDay()
            const windows = await getSchedulingWindows(dayOfWeek, true)

            for (const window of windows) {
                const [startHour, startMin] = window.start_time.split(':').map(Number)
                const windowStart = new Date(checkDate)
                windowStart.setHours(startHour, startMin, 0, 0)

                // Skip if in the past
                if (windowStart < now) continue

                const slotEnd = new Date(windowStart.getTime() + durationMinutes * 60 * 1000)

                console.log(`  Double-booking into: ${windowStart.toISOString()}`)
                return {
                    slot: { start: windowStart, end: slotEnd },
                    requiresBumping: false,
                    doubleBookWarning: `⚠️ DOUBLE-BOOKED: No available slot before deadline. This Critical task overlaps with existing events.`
                }
            }
        }
    }

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

/**
 * Intelligent task scheduling using database-driven windows and bumping
 * This is the PRIMARY scheduler - replaces the hardcoded calendar.ts for all tasks
 */
export async function scheduleTaskIntelligent(
    taskId: string,
    subject: string,
    domain: string,
    summary: string,
    suggestedAction: string,
    estimatedMinutes: number,
    trelloUrl?: string,
    priority?: Priority,
    deadline?: Date,
    searchStartDate?: Date,
    excludeSlots?: { start: Date; end: Date }[],
    searchBackward: boolean = false
): Promise<{ eventId: string; eventUrl: string; scheduledStart: Date; scheduledEnd: Date; doubleBookWarning?: string } | null> {
    console.log('=== scheduleTaskIntelligent CALLED ===')
    console.log('TaskId:', taskId)
    console.log('Subject:', subject)
    console.log('Priority:', priority)
    console.log('Deadline:', deadline?.toISOString() || 'none')
    console.log('Search Start:', searchStartDate?.toISOString() || 'now')
    console.log('Search Direction:', searchBackward ? 'BACKWARD' : 'forward')

    const calendar = await getCalendarClient()
    if (!calendar) {
        console.log('Calendar client not available')
        return null
    }

    const taskPriority = priority || 'Normal'
    const isCritical = taskPriority === 'Critical'

    // Use explicit deadline or calculate default
    const taskDeadline = deadline || getDefaultDeadline(taskPriority)

    // Use intelligent slot finding with bumping support
    const slotResult = await findSlotWithBumping(
        estimatedMinutes,
        taskPriority,
        taskDeadline,
        isCritical,
        searchStartDate,
        excludeSlots,
        searchBackward
    )

    if (!slotResult.slot) {
        console.log('No available slot found within deadline')
        return null
    }

    // If bumping is required, perform the bumps first
    if (slotResult.requiresBumping && slotResult.eventsToBump) {
        console.log(`Bumping ${slotResult.eventsToBump.length} events for ${taskPriority} task`)
        for (const eventToBump of slotResult.eventsToBump) {
            // Find new slot for bumped event with EXTENDED deadline (2 weeks)
            // Bumped events should always find a slot eventually
            const extendedDeadline = new Date()
            extendedDeadline.setDate(extendedDeadline.getDate() + 14)

            const bumpedSlotResult = await findSlotWithBumping(
                eventToBump.scheduled_end && eventToBump.scheduled_start
                    ? Math.round((new Date(eventToBump.scheduled_end).getTime() - new Date(eventToBump.scheduled_start).getTime()) / 60000)
                    : 30,
                eventToBump.priority,
                extendedDeadline, // Use extended deadline, not original
                eventToBump.priority === 'Critical'
            )

            if (bumpedSlotResult.slot) {
                console.log(`  Bumping event to ${bumpedSlotResult.slot.start.toISOString()}`)
                await bumpEvent(eventToBump.id, bumpedSlotResult.slot, taskId)
            } else {
                console.log(`  WARNING: Could not find new slot for bumped event: ${eventToBump.title}`)
            }
        }
    }

    // Build event description
    const TIMEZONE = 'Australia/Melbourne'
    let fullDescription = `**Summary:** ${summary}\n\n**Action:** ${suggestedAction}`
    if (trelloUrl) {
        fullDescription += `\n\n📋 Trello Card: ${trelloUrl}`
    }
    fullDescription += '\n\n---\n*Scheduled by Cognito AI Executive Assistant*'

    try {
        console.log('=== CREATING CALENDAR EVENT ===')
        console.log('Slot start:', slotResult.slot.start.toISOString())
        console.log('Slot end:', slotResult.slot.end.toISOString())

        const eventRes = await calendar.events.insert({
            calendarId: 'primary',
            requestBody: {
                summary: `[${domain}] ${subject.substring(0, 50)}`,
                description: fullDescription,
                start: {
                    dateTime: slotResult.slot.start.toISOString(),
                    timeZone: TIMEZONE
                },
                end: {
                    dateTime: slotResult.slot.end.toISOString(),
                    timeZone: TIMEZONE
                },
                visibility: 'private',
                extendedProperties: {
                    private: {
                        cognito_managed: 'true',
                        task_id: taskId,
                        priority: taskPriority,
                        deadline: taskDeadline.toISOString()
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
        console.log(`Created calendar event: ${subject} at ${slotResult.slot.start.toISOString()}`)

        // Save to cognito_events table for bump tracking
        try {
            await (supabase
                .from('cognito_events') as any)
                .insert({
                    task_id: taskId,
                    google_event_id: event.id!,
                    title: `[${domain}] ${subject.substring(0, 50)}`,
                    scheduled_start: slotResult.slot.start.toISOString(),
                    scheduled_end: slotResult.slot.end.toISOString(),
                    priority: taskPriority,
                    deadline: taskDeadline.toISOString(),
                    original_start: slotResult.slot.start.toISOString(),
                    original_end: slotResult.slot.end.toISOString(),
                    is_active: true
                })
        } catch (e) {
            console.error('Failed to save to cognito_events:', e)
            // Don't fail the whole operation
        }

        // Log double-book warning if present
        if (slotResult.doubleBookWarning) {
            console.log(`⚠️ ${slotResult.doubleBookWarning}`)
        }

        return {
            eventId: event.id!,
            eventUrl: event.htmlLink!,
            scheduledStart: slotResult.slot.start,
            scheduledEnd: slotResult.slot.end,
            doubleBookWarning: slotResult.doubleBookWarning
        }
    } catch (e) {
        console.error('Failed to create calendar event:', e)
        return null
    }
}
