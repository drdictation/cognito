'use server'

import { getCalendarClient } from '@/lib/services/google-auth'
import { GoogleCalendarEvent } from '@/lib/types/database'

/**
 * Phase 10: Fetch Google Calendar events for read-only overlay
 */

export async function fetchGoogleCalendarEvents(date: Date): Promise<GoogleCalendarEvent[]> {
    try {
        const calendar = await getCalendarClient()

        if (!calendar) {
            console.error('Calendar client not available')
            return []
        }

        const startOfDay = new Date(date)
        startOfDay.setHours(0, 0, 0, 0)

        const endOfDay = new Date(date)
        endOfDay.setHours(23, 59, 59, 999)

        // Get list of calendars
        const calendarList = await calendar.calendarList.list()
        const calendars = calendarList.data.items || []

        // Fetch events from all calendars
        const allEvents: GoogleCalendarEvent[] = []

        for (const cal of calendars) {
            if (!cal.id) continue

            try {
                const response = await calendar.events.list({
                    calendarId: cal.id,
                    timeMin: startOfDay.toISOString(),
                    timeMax: endOfDay.toISOString(),
                    singleEvents: true,
                    orderBy: 'startTime'
                })

                const events = response.data.items || []

                for (const event of events) {
                    // Skip all-day events (they don't have dateTime)
                    if (!event.start?.dateTime || !event.end?.dateTime) {
                        continue
                    }

                    allEvents.push({
                        id: event.id || '',
                        title: event.summary || 'Untitled Event',
                        start: event.start.dateTime,
                        end: event.end.dateTime,
                        calendarName: cal.summary || 'Unknown Calendar',
                        isReadOnly: true
                    })
                }
            } catch (error) {
                console.error(`Error fetching events from calendar ${cal.summary}:`, error)
                // Continue with other calendars
            }
        }

        return allEvents
    } catch (error) {
        console.error('Error fetching Google Calendar events:', error)
        return []
    }
}
