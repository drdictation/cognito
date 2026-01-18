'use client'

import { useState, useEffect } from 'react'
import { Calendar, AlertCircle } from 'lucide-react'
import type { DetectedEventRow } from '@/lib/types/database'
import { getPendingDetectedEvents } from '@/lib/actions/calendar-events'
import { CalendarEventCard } from './CalendarEventCard'

export function PendingEventsList() {
    const [events, setEvents] = useState<DetectedEventRow[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        loadEvents()
    }, [])

    async function loadEvents() {
        try {
            const data = await getPendingDetectedEvents()
            setEvents(data)
        } catch (error) {
            console.error('Failed to load pending events:', error)
        } finally {
            setIsLoading(false)
        }
    }

    if (!isLoading && events.length === 0) return null

    return (
        <div className="animate-fade-in stagger-1 opacity-0 mb-6">
            <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-500">
                    <Calendar size={18} />
                </div>
                <h2 className="text-lg font-semibold text-foreground">
                    Pending Schedule Items
                </h2>
                <div className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20 text-xs font-medium">
                    {events.length}
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {events.map(event => (
                    <CalendarEventCard key={event.id} event={event} />
                ))}
            </div>
        </div>
    )
}
