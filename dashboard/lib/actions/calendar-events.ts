'use server'

/**
 * Server Actions for Calendar Events - Phase 7b
 * Handles detected event approval, rejection, editing, and bump management
 */

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import type { DetectedEventRow, CognitoEventRow } from '@/lib/types/database'
import { getConflicts, undoBump as undoBumpService } from '@/lib/services/calendar-intelligence'
import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import * as fs from 'fs'
import * as path from 'path'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TIMEZONE = 'Australia/Melbourne'
const CREDENTIALS_PATH = path.join(process.cwd(), '..', 'credentials.json')
const TOKEN_PATH = path.join(process.cwd(), '..', 'token.json')

interface ActionResult {
    success: boolean
    error?: string
    data?: unknown
}

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

async function getCalendarClient() {
    try {
        if (!fs.existsSync(CREDENTIALS_PATH) || !fs.existsSync(TOKEN_PATH)) {
            return null
        }

        const credentialsContent = fs.readFileSync(CREDENTIALS_PATH, 'utf-8')
        const credentials: CalendarCredentials = JSON.parse(credentialsContent)
        const clientConfig = credentials.installed || credentials.web

        if (!clientConfig) return null

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
 * Approve a detected event and create it in Google Calendar
 */
export async function approveDetectedEvent(eventId: string, override: boolean = false): Promise<ActionResult> {
    try {
        // Get the detected event
        const { data: event, error } = await (supabase
            .from('detected_events') as any)
            .select('*')
            .eq('id', eventId)
            .single()

        if (error || !event) {
            return { success: false, error: 'Event not found' }
        }

        // Check for conflicts (unless overriding)
        if (!override && event.proposed_start && event.proposed_end) {
            const conflicts = await getConflicts(
                new Date(event.proposed_start),
                new Date(event.proposed_end)
            )

            if (conflicts.length > 0) {
                // Update status to conflict
                await (supabase
                    .from('detected_events') as any)
                    .update({
                        status: 'conflict',
                        conflict_event_id: conflicts[0].eventId,
                        conflict_summary: conflicts[0].summary
                    })
                    .eq('id', eventId)

                revalidatePath('/')
                return {
                    success: false,
                    error: `Conflicts with: ${conflicts[0].summary}`,
                    data: { conflicts }
                }
            }
        }

        // Create in Google Calendar
        const calendar = await getCalendarClient()
        if (!calendar) {
            return { success: false, error: 'Calendar not available' }
        }

        const eventData: any = {
            summary: event.title,
            description: event.source_text || '',
            visibility: 'private'
        }

        if (event.proposed_start && event.proposed_end) {
            eventData.start = {
                dateTime: event.proposed_start,
                timeZone: TIMEZONE
            }
            eventData.end = {
                dateTime: event.proposed_end,
                timeZone: TIMEZONE
            }
        } else if (event.is_all_day) {
            // All-day event
            const date = new Date(event.proposed_start!).toISOString().split('T')[0]
            eventData.start = { date }
            eventData.end = { date }
        }

        if (event.location) {
            eventData.location = event.location
        }

        if (event.attendees && event.attendees.length > 0) {
            eventData.attendees = event.attendees.map((email: string) => ({ email }))
        }

        const createdEvent = await calendar.events.insert({
            calendarId: 'primary',
            requestBody: eventData
        })

        // Update detected event status
        await (supabase
            .from('detected_events') as any)
            .update({
                status: 'approved',
                google_event_id: createdEvent.data.id!
            })
            .eq('id', eventId)

        revalidatePath('/')
        return { success: true, data: { eventId: createdEvent.data.id } }
    } catch (error) {
        console.error('Failed to approve detected event:', error)
        return { success: false, error: 'Failed to create calendar event' }
    }
}

/**
 * Reject a detected event
 */
export async function rejectDetectedEvent(eventId: string): Promise<ActionResult> {
    try {
        const { error } = await (supabase
            .from('detected_events') as any)
            .update({ status: 'rejected' })
            .eq('id', eventId)

        if (error) {
            return { success: false, error: error.message }
        }

        revalidatePath('/')
        return { success: true }
    } catch (error) {
        console.error('Failed to reject detected event:', error)
        return { success: false, error: 'Failed to reject event' }
    }
}

/**
 * Edit a detected event before approval
 */
export async function editDetectedEvent(
    eventId: string,
    updates: Partial<DetectedEventRow>
): Promise<ActionResult> {
    try {
        const { error } = await (supabase
            .from('detected_events') as any)
            .update(updates)
            .eq('id', eventId)

        if (error) {
            return { success: false, error: error.message }
        }

        revalidatePath('/')
        return { success: true }
    } catch (error) {
        console.error('Failed to edit detected event:', error)
        return { success: false, error: 'Failed to edit event' }
    }
}

/**
 * Undo a bump and restore original schedule
 */
export async function undoBump(cognitoEventId: string): Promise<ActionResult> {
    try {
        const success = await undoBumpService(cognitoEventId)

        if (!success) {
            return { success: false, error: 'Failed to undo bump' }
        }

        revalidatePath('/')
        return { success: true }
    } catch (error) {
        console.error('Failed to undo bump:', error)
        return { success: false, error: 'Failed to undo bump' }
    }
}

/**
 * Get active conflicts for the dashboard
 */
export async function getActiveConflicts(): Promise<DetectedEventRow[]> {
    try {
        const { data, error } = await (supabase
            .from('detected_events') as any)
            .select('*')
            .eq('status', 'conflict')
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Failed to get conflicts:', error)
            return []
        }

        return data || []
    } catch (error) {
        console.error('Failed to get conflicts:', error)
        return []
    }
}

/**
 * Get bump history for display
 */
export async function getBumpHistory(): Promise<CognitoEventRow[]> {
    try {
        const { data, error } = await (supabase
            .from('cognito_events') as any)
            .select('*')
            .not('bumped_by', 'is', null)
            .eq('is_active', true)
            .order('updated_at', { ascending: false })
            .limit(10)

        if (error) {
            console.error('Failed to get bump history:', error)
            return []
        }

        return data || []
    } catch (error) {
        console.error('Failed to get bump history:', error)
        return []
    }
}

/**
 * Get detected events for a specific task
 */
export async function getDetectedEventsForTask(taskId: string): Promise<DetectedEventRow[]> {
    try {
        const { data, error } = await (supabase
            .from('detected_events') as any)
            .select('*')
            .eq('task_id', taskId)
            .in('status', ['pending', 'conflict'])
            .order('confidence', { ascending: false })

        if (error) {
            console.error('Failed to get detected events:', error)
            return []
        }

        return data || []
        return data || []
    } catch (error) {
        console.error('Failed to get detected events:', error)
        return []
    }
}

/**
 * Get all pending detected events for the dashboard
 * Used for the "Pending Schedule" section
 */
export async function getPendingDetectedEvents(): Promise<DetectedEventRow[]> {
    try {
        const { data, error } = await (supabase
            .from('detected_events') as any)
            .select('*')
            .in('status', ['pending', 'conflict'])
            .order('proposed_start', { ascending: true })

        if (error) {
            console.error('Failed to get pending events:', error)
            return []
        }

        return data || []
    } catch (error) {
        console.error('Failed to get pending events:', error)
        return []
    }
}
