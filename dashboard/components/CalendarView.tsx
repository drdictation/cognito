'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { getCalendarTasks } from '@/lib/actions/time-tracking'
import { fetchGoogleCalendarEvents } from '@/lib/actions/calendar-overlay'
import { clearAllScheduledTasks } from '@/lib/actions/calendar-admin'
import { CalendarTask, GoogleCalendarEvent } from '@/lib/types/database'
import TimeBlock from './TimeBlock'
import ActiveTaskTimer from './ActiveTaskTimer'
import CalendarStats from './CalendarStats'
import { toast } from 'sonner'

export default function CalendarView() {
    const [currentDate, setCurrentDate] = useState(new Date())
    const [tasks, setTasks] = useState<CalendarTask[]>([])
    const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEvent[]>([])
    const [loading, setLoading] = useState(true)
    const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
    const [clearing, setClearing] = useState(false)

    useEffect(() => {
        loadCalendarData()
    }, [currentDate])

    async function loadCalendarData(skipSync = false) {
        setLoading(true)
        try {
            const [tasksData, eventsData] = await Promise.all([
                getCalendarTasks(currentDate, skipSync),
                fetchGoogleCalendarEvents(currentDate)
            ])
            setTasks(tasksData)
            setGoogleEvents(eventsData)

            // Find active task
            const active = tasksData.find(t => t.block_status === 'running')
            setActiveTaskId(active?.id || null)
        } catch (error) {
            console.error('Error loading calendar:', error)
        } finally {
            setLoading(false)
        }
    }

    function handlePrevDay() {
        const newDate = new Date(currentDate)
        newDate.setDate(newDate.getDate() - 1)
        setCurrentDate(newDate)
    }

    function handleNextDay() {
        const newDate = new Date(currentDate)
        newDate.setDate(newDate.getDate() + 1)
        setCurrentDate(newDate)
    }

    function handleToday() {
        setCurrentDate(new Date())
    }

    function handleTaskUpdate() {
        loadCalendarData(true)  // Fast mode - skip Google sync
    }

    async function handleClearAll() {
        if (!confirm('This will clear ALL scheduled tasks from Cognito. You can re-approve them from the Briefing page. Continue?')) {
            return
        }

        setClearing(true)
        try {
            await clearAllScheduledTasks()
            toast.success('All scheduled tasks cleared')
            loadCalendarData()
        } catch (error) {
            toast.error('Failed to clear tasks')
            console.error(error)
        } finally {
            setClearing(false)
        }
    }

    // Generate time slots from 8am to 10pm
    const timeSlots = []
    for (let hour = 8; hour <= 22; hour++) {
        timeSlots.push(hour)
    }

    // Helper to format time
    function formatTime(hour: number): string {
        if (hour === 0) return '12 AM'
        if (hour === 12) return '12 PM'
        if (hour < 12) return `${hour} AM`
        return `${hour - 12} PM`
    }

    // Helper to check if a time slot has events
    function getEventsForSlot(hour: number): (CalendarTask | GoogleCalendarEvent)[] {
        const slotStart = new Date(currentDate)
        slotStart.setHours(hour, 0, 0, 0)
        const slotEnd = new Date(currentDate)
        slotEnd.setHours(hour + 1, 0, 0, 0)

        const events: (CalendarTask | GoogleCalendarEvent)[] = []
        const cognitoEventIds = new Set<string>()

        // Add Cognito tasks (INTERACTIVE)
        // These take precedence as they are already fully linked
        tasks.forEach(task => {
            if (!task.scheduled_start) return
            const taskStart = new Date(task.scheduled_start)

            // Basic date check - ignoring time zones for now on client side
            // but ensuring year/month/day match current view
            if (taskStart.getDate() !== currentDate.getDate() ||
                taskStart.getMonth() !== currentDate.getMonth() ||
                taskStart.getFullYear() !== currentDate.getFullYear()) {
                return
            }

            const taskEnd = new Date(task.scheduled_end || taskStart)

            if (taskStart < slotEnd && taskEnd > slotStart) {
                events.push(task)
                if (task.calendar_event_id) {
                    cognitoEventIds.add(task.calendar_event_id)
                }
            }
        })

        // Add Google Calendar events
        // Logic: Promote chamarabfwd@gmail.com events to INTERACTIVE tasks
        googleEvents.forEach(event => {
            // Deduplication: Skip if we already have a hard-linked Cognito task for this event
            if (cognitoEventIds.has(event.id)) return

            const eventStart = new Date(event.start)
            const eventEnd = new Date(event.end)

            if (eventStart < slotEnd && eventEnd > slotStart) {
                // SPECIAL RULE: Events from chamarabfwd@gmail.com are treated as NATIVE COGNITO TASKS
                if (event.calendarName === 'chamarabfwd@gmail.com' || event.calendarName === 'Primary' || !event.calendarName) {
                    // Render as interactive blocks
                    const pseudoTask: CalendarTask = {
                        id: `adhoc-${event.id}`, // Temporary ID
                        subject: event.title,
                        ai_domain: 'Admin',
                        ai_priority: 'Normal',
                        ai_estimated_minutes: Math.round((eventEnd.getTime() - eventStart.getTime()) / 60000) || 60,
                        scheduled_start: event.start,
                        scheduled_end: event.end,
                        trello_card_url: null,
                        calendar_event_id: event.id,
                        active_time_log_id: null,
                        tracking_status: null,
                        started_at: null,
                        elapsed_seconds: null,
                        block_status: 'scheduled'
                    }
                    events.push(pseudoTask)
                } else {
                    // Other calendars remain read-only
                    events.push(event)
                }
            }
        })

        return events
    }

    const dateString = currentDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    })

    const isToday = currentDate.toDateString() === new Date().toDateString()

    return (
        <div className="space-y-6">
            {/* Active Task Timer */}
            {activeTaskId && (
                <ActiveTaskTimer
                    taskId={activeTaskId}
                    onComplete={handleTaskUpdate}
                />
            )}

            {/* Date Navigation */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-white">{dateString}</h2>
                        {isToday && (
                            <span className="text-sm text-green-400 font-medium">Today</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleClearAll}
                            disabled={clearing}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 transition-colors disabled:opacity-50"
                            title="Clear all scheduled tasks"
                        >
                            <Trash2 className="w-4 h-4" />
                            Clear All
                        </button>
                        <button
                            onClick={handlePrevDay}
                            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button
                            onClick={handleToday}
                            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium transition-colors"
                        >
                            Today
                        </button>
                        <button
                            onClick={handleNextDay}
                            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Info Banner */}
            {tasks.length === 0 && googleEvents.length > 0 && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                    <p className="text-sm text-blue-300">
                        📌 <strong>Tip:</strong> Gray blocks are read-only Google Calendar events.
                        To create trackable Cognito tasks, approve items from the <a href="/" className="underline hover:text-blue-200">Briefing page</a>.
                    </p>
                </div>
            )}

            {/* Calendar Grid */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center text-white">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                        <p>Loading calendar...</p>
                    </div>
                ) : (
                    <div className="divide-y divide-white/10">
                        {timeSlots.map(hour => {
                            const events = getEventsForSlot(hour)
                            const currentHour = new Date().getHours()
                            const isCurrentHour = isToday && hour === currentHour

                            return (
                                <div
                                    key={hour}
                                    className={`flex ${isCurrentHour ? 'bg-purple-500/10' : ''}`}
                                >
                                    {/* Time Label */}
                                    <div className="w-24 p-4 text-right border-r border-white/10">
                                        <span className="text-sm font-medium text-slate-300">
                                            {formatTime(hour)}
                                        </span>
                                    </div>

                                    {/* Events Column */}
                                    <div className="flex-1 p-2 min-h-[80px]">
                                        {events.length === 0 ? (
                                            <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                                                {/* Empty slot */}
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {events.map((event, idx) => {
                                                    if ('block_status' in event) {
                                                        // Cognito task
                                                        return (
                                                            <TimeBlock
                                                                key={event.id}
                                                                task={event}
                                                                onUpdate={handleTaskUpdate}
                                                            />
                                                        )
                                                    } else {
                                                        // Google Calendar event (read-only)
                                                        return (
                                                            <div
                                                                key={`gcal-${idx}`}
                                                                className="p-3 rounded-lg bg-gray-500/20 border border-gray-500/50 cursor-not-allowed"
                                                            >
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                        <span className="text-xs text-gray-400">
                                                                            {new Date(event.start).toLocaleTimeString('en-US', {
                                                                                hour: 'numeric',
                                                                                minute: '2-digit'
                                                                            })}
                                                                        </span>
                                                                        <span className="text-sm text-white font-medium truncate">
                                                                            {event.title}
                                                                        </span>
                                                                    </div>
                                                                    <span className="text-xs text-gray-500 bg-gray-700/30 px-2 py-1 rounded">
                                                                        {event.calendarName}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        )
                                                    }
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Stats */}
            <CalendarStats />
        </div>
    )
}
