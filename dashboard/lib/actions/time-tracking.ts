'use server'

import { createClient } from '@supabase/supabase-js'
import { TimeLog, TimeLogStatus, TimeOfDay } from '@/lib/types/database'
import { revalidatePath } from 'next/cache'

/**
 * Phase 10: Time Tracking Server Actions
 * Handles start/pause/resume/complete workflows with server-side timer persistence
 */

// Create Supabase client
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getTimeOfDay(date: Date): TimeOfDay {
    const hour = date.getHours()
    if (hour < 12) return 'morning'
    if (hour < 17) return 'afternoon'
    return 'evening'
}

export async function startTask(taskId: string) {
    const supabase = supabaseAdmin

    // Get task details
    const { data: task } = await supabase
        .from('inbox_queue')
        .select('ai_estimated_minutes, ai_domain, ai_priority')
        .eq('id', taskId)
        .single()

    if (!task) {
        throw new Error('Task not found')
    }

    const now = new Date()

    // Create time log
    const { data: timeLog, error } = await supabase
        .from('time_logs')
        .insert({
            task_id: taskId,
            started_at: now.toISOString(),
            ai_estimated_minutes: task.ai_estimated_minutes,
            domain: task.ai_domain,
            priority: task.ai_priority,
            day_of_week: now.getDay(),
            time_of_day: getTimeOfDay(now),
            status: 'running' as TimeLogStatus,
            elapsed_seconds: 0
        })
        .select()
        .single()

    if (error) {
        console.error('Error starting task:', error)
        throw error
    }

    revalidatePath('/calendar')
    return timeLog
}

export async function startAdHocTask(subject: string, scheduledStart: Date, scheduledEnd: Date, calendarEventId: string) {
    const supabase = supabaseAdmin
    const now = new Date()

    try {
        // 1. Create the task in inbox_queue
        const { data: newTask, error: taskError } = await supabase
            .from('inbox_queue')
            .insert({
                subject: subject,
                scheduled_start: scheduledStart,
                scheduled_end: scheduledEnd,
                calendar_event_id: calendarEventId,
                ai_domain: 'Admin',
                ai_priority: 'Normal',
                ai_estimated_minutes: Math.round((new Date(scheduledEnd).getTime() - new Date(scheduledStart).getTime()) / 60000) || 30, // Default to 30 min if math fails
                execution_status: 'scheduled',
                status: 'approved', // Using correct column name 'status' instead of 'triage_status'

                // Required fields for DB constraints:
                source: 'google_calendar',
                original_content: 'Created from Google Calendar Event',
                real_sender: 'calendar-integration',
                message_id: `gcal-${calendarEventId}-${now.getTime()}`,

                // Email-specific fields that might be required:
                received_at: now.toISOString(), // Correct field name
                original_source_email: 'chamarabfwd@gmail.com',
            })
            .select()
            .single()

        if (taskError) {
            console.error('SERVER ERROR creating ad-hoc task:', JSON.stringify(taskError, null, 2))
            throw new Error(`DB Error: ${taskError.message} (${taskError.code})`)
        }

        // 2. Start the task immediately
        return await startTask(newTask.id)
    } catch (error: any) {
        console.error('Unexpected error in startAdHocTask:', error)
        throw new Error(error.message || 'Unknown server error')
    }
}

export async function pauseTask(timeLogId: string) {
    const supabase = supabaseAdmin

    // Get current time log
    const { data: timeLog } = await supabase
        .from('time_logs')
        .select('*')
        .eq('id', timeLogId)
        .single()

    if (!timeLog || timeLog.status !== 'running') {
        throw new Error('Time log not found or not running')
    }

    const now = new Date()
    const startedAt = new Date(timeLog.started_at)
    const additionalSeconds = Math.floor((now.getTime() - startedAt.getTime()) / 1000)
    const totalElapsed = timeLog.elapsed_seconds + additionalSeconds

    // Update time log
    const { error } = await supabase
        .from('time_logs')
        .update({
            paused_at: now.toISOString(),
            elapsed_seconds: totalElapsed,
            status: 'paused' as TimeLogStatus,
            updated_at: now.toISOString()
        })
        .eq('id', timeLogId)

    if (error) {
        console.error('Error pausing task:', error)
        throw error
    }

    revalidatePath('/calendar')
    return { elapsed_seconds: totalElapsed }
}

export async function resumeTask(timeLogId: string) {
    const supabase = supabaseAdmin

    const now = new Date()

    // Update time log
    const { error } = await supabase
        .from('time_logs')
        .update({
            started_at: now.toISOString(),  // Reset start time for next segment
            paused_at: null,
            status: 'running' as TimeLogStatus,
            updated_at: now.toISOString()
        })
        .eq('id', timeLogId)

    if (error) {
        console.error('Error resuming task:', error)
        throw error
    }

    revalidatePath('/calendar')
}

export async function completeTask(timeLogId: string) {
    const supabase = supabaseAdmin

    // Get current time log
    const { data: timeLog } = await supabase
        .from('time_logs')
        .select('*')
        .eq('id', timeLogId)
        .single()

    if (!timeLog) {
        throw new Error('Time log not found')
    }

    const now = new Date()
    let totalElapsed = timeLog.elapsed_seconds

    // If currently running, add final segment
    if (timeLog.status === 'running') {
        const startedAt = new Date(timeLog.started_at)
        const additionalSeconds = Math.floor((now.getTime() - startedAt.getTime()) / 1000)
        totalElapsed += additionalSeconds
    }

    const actualMinutes = Math.ceil(totalElapsed / 60)
    const accuracyRatio = timeLog.ai_estimated_minutes
        ? actualMinutes / timeLog.ai_estimated_minutes
        : null

    // Update time log
    const { error: timeLogError } = await supabase
        .from('time_logs')
        .update({
            completed_at: now.toISOString(),
            elapsed_seconds: totalElapsed,
            actual_minutes: actualMinutes,
            accuracy_ratio: accuracyRatio,
            status: 'completed' as TimeLogStatus,
            updated_at: now.toISOString()
        })
        .eq('id', timeLogId)

    if (timeLogError) {
        console.error('Error completing time log:', timeLogError)
        throw timeLogError
    }

    // Update inbox_queue with completion data
    if (timeLog.task_id) {
        const { error: taskError } = await supabase
            .from('inbox_queue')
            .update({
                completed_at: now.toISOString(),
                actual_duration_minutes: actualMinutes,
                time_accuracy_ratio: accuracyRatio,
                execution_status: 'completed'
            })
            .eq('id', timeLog.task_id)

        if (taskError) {
            console.error('Error updating task:', taskError)
        }
    }

    revalidatePath('/calendar')
    return { actual_minutes: actualMinutes, accuracy_ratio: accuracyRatio }
}

export async function getActiveTimeLog(): Promise<TimeLog | null> {
    const supabase = supabaseAdmin

    const { data } = await supabase
        .from('time_logs')
        .select('*')
        .in('status', ['running', 'paused'])
        .order('started_at', { ascending: false })
        .limit(1)
        .single()

    return data as TimeLog | null
}

export async function getCalendarTasks(date: Date, skipGoogleSync = true) {  // Default to TRUE - skip slow Google sync
    const supabase = supabaseAdmin

    const startOfDay = new Date(date)
    startOfDay.setHours(0, 0, 0, 0)

    const endOfDay = new Date(date)
    endOfDay.setHours(23, 59, 59, 999)

    // Get all tasks that have calendar events (regardless of stored scheduled_start)
    const { data, error } = await supabase
        .from('inbox_queue')
        .select(`
            id,
            subject,
            ai_domain,
            ai_priority,
            ai_estimated_minutes,
            scheduled_start,
            scheduled_end,
            trello_card_url,
            calendar_event_id,
            execution_status,
            time_logs (
                id,
                status,
                started_at,
                elapsed_seconds
            )
        `)
        .not('scheduled_start', 'is', null)    // Must have scheduled time
        .not('scheduled_start', 'is', null)    // Must have scheduled time
        // .gte('scheduled_start', startOfDay.toISOString())  // Temporarily removed to debug timezone
        // .lte('scheduled_start', endOfDay.toISOString())    // Temporarily removed to debug timezone
        .order('scheduled_start', { ascending: true })

    if (error) {
        console.error('Error fetching calendar tasks:', error)
        throw error
    }

    // Just use database times - no Google Calendar verification
    return data.map(task => transformTask(task))
}



function transformTask(task: any) {
    const activeLog = Array.isArray(task.time_logs) && task.time_logs.length > 0
        ? task.time_logs[0]
        : null

    let blockStatus: 'scheduled' | 'running' | 'paused' | 'completed' = 'scheduled'
    if (activeLog) {
        if (activeLog.status === 'completed') blockStatus = 'completed'
        else if (activeLog.status === 'running') blockStatus = 'running'
        else if (activeLog.status === 'paused') blockStatus = 'paused'
    }

    return {
        id: task.id,
        subject: task.subject,
        ai_domain: task.ai_domain,
        ai_priority: task.ai_priority,
        ai_estimated_minutes: task.ai_estimated_minutes,
        scheduled_start: task.scheduled_start,
        scheduled_end: task.scheduled_end,
        trello_card_url: task.trello_card_url,
        calendar_event_id: task.calendar_event_id,
        active_time_log_id: activeLog?.id || null,
        tracking_status: activeLog?.status || null,
        started_at: activeLog?.started_at || null,
        elapsed_seconds: activeLog?.elapsed_seconds || null,
        block_status: blockStatus
    }
}

// New function to manually sync a specific task with Google Calendar
export async function syncTaskWithGoogleCalendar(taskId: string) {
    const supabase = supabaseAdmin

    const { data: task } = await supabase
        .from('inbox_queue')
        .select('calendar_event_id')
        .eq('id', taskId)
        .single()

    if (!task?.calendar_event_id) {
        return { synced: false, message: 'No calendar event' }
    }

    const { getCalendarClient } = await import('@/lib/services/google-auth')
    const calendar = await getCalendarClient()

    if (!calendar) {
        return { synced: false, message: 'Calendar not available' }
    }

    try {
        const event = await calendar.events.get({
            calendarId: 'primary',
            eventId: task.calendar_event_id
        })

        if (event.data.start?.dateTime && event.data.end?.dateTime) {
            await supabase
                .from('inbox_queue')
                .update({
                    scheduled_start: event.data.start.dateTime,
                    scheduled_end: event.data.end.dateTime
                })
                .eq('id', taskId)

            return { synced: true, message: 'Times updated' }
        }
    } catch (err: any) {
        if (err.code === 404 || err.response?.status === 404) {
            await supabase
                .from('inbox_queue')
                .update({
                    calendar_event_id: null,
                    scheduled_start: null,
                    scheduled_end: null
                })
                .eq('id', taskId)

            return { synced: true, message: 'Event deleted, cleared from Cognito' }
        }
    }

    return { synced: false, message: 'Sync failed' }
}

export async function getCompletedTasks(startDate: Date, endDate: Date) {
    const supabase = supabaseAdmin

    const { data, error } = await supabase
        .from('time_logs')
        .select('*')
        .eq('status', 'completed')
        .gte('completed_at', startDate.toISOString())
        .lte('completed_at', endDate.toISOString())
        .order('completed_at', { ascending: false })

    if (error) {
        console.error('Error fetching completed tasks:', error)
        throw error
    }

    return data as TimeLog[]
}

export async function getWeeklyStats() {
    const supabase = supabaseAdmin

    const now = new Date()
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - now.getDay()) // Sunday
    startOfWeek.setHours(0, 0, 0, 0)

    const { data, error } = await supabase
        .from('time_logs')
        .select('*')
        .eq('status', 'completed')
        .gte('completed_at', startOfWeek.toISOString())

    if (error) {
        console.error('Error fetching weekly stats:', error)
        return { totalMinutes: 0, tasksCompleted: 0, avgAccuracy: 0 }
    }

    const totalMinutes = data.reduce((sum: number, log: TimeLog) => sum + (log.actual_minutes || 0), 0)
    const tasksCompleted = data.length
    const accuracyRatios = data.filter((log: TimeLog) => log.accuracy_ratio !== null).map((log: TimeLog) => log.accuracy_ratio!)
    const avgAccuracy = accuracyRatios.length > 0
        ? accuracyRatios.reduce((sum: number, ratio: number) => sum + ratio, 0) / accuracyRatios.length
        : 0

    return {
        totalMinutes,
        tasksCompleted,
        avgAccuracy: Math.round(avgAccuracy * 100) // Convert to percentage
    }
}
