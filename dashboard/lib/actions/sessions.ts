'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { TaskSession, SessionStatus } from '@/lib/types/database'

/**
 * Create multiple linked sessions for a multi-session task
 */
export async function createTaskSessions(
    taskId: string,
    sessionCount: number,
    durationMinutes: number,
    cadenceDays: number,
    deadline?: Date
): Promise<{ success: boolean; sessions?: TaskSession[]; error?: string }> {
    const supabase = createAdminClient()

    try {
        // Calculate session deadlines working backwards from final deadline
        const sessions: Omit<TaskSession, 'id' | 'created_at' | 'updated_at'>[] = []
        const finalDeadline = deadline || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Default: 30 days

        for (let i = 0; i < sessionCount; i++) {
            // Work backwards: last session closest to deadline
            const daysBeforeDeadline = (sessionCount - 1 - i) * cadenceDays
            const sessionDeadline = new Date(finalDeadline)
            sessionDeadline.setDate(sessionDeadline.getDate() - daysBeforeDeadline)

            sessions.push({
                parent_task_id: taskId,
                session_number: i + 1,
                title: `Session ${i + 1} of ${sessionCount}`,
                duration_minutes: durationMinutes,
                scheduled_start: null,
                scheduled_end: null,
                google_event_id: null,
                status: 'pending',
                notes: null
            })
        }

        const { data, error } = await (supabase
            .from('task_sessions') as any)
            .insert(sessions)
            .select()

        if (error) throw error

        revalidatePath('/')
        return { success: true, sessions: data as TaskSession[] }
    } catch (error) {
        console.error('Failed to create task sessions:', error)
        return { success: false, error: 'Failed to create sessions' }
    }
}

/**
 * Get all sessions for a parent task
 */
export async function getSessionsForTask(taskId: string): Promise<TaskSession[]> {
    const supabase = createAdminClient()

    const { data, error } = await (supabase
        .from('task_sessions') as any)
        .select('*')
        .eq('parent_task_id', taskId)
        .order('session_number', { ascending: true })

    if (error) {
        console.error('Failed to fetch sessions:', error)
        return []
    }

    return (data as TaskSession[]) || []
}

/**
 * Update session status (e.g., mark as completed)
 */
export async function updateSessionStatus(
    sessionId: string,
    status: SessionStatus,
    notes?: string
): Promise<{ success: boolean; error?: string }> {
    const supabase = createAdminClient()

    try {
        const updateData: any = { status, updated_at: new Date().toISOString() }
        if (notes) updateData.notes = notes

        const { error } = await (supabase
            .from('task_sessions') as any)
            .update(updateData)
            .eq('id', sessionId)

        if (error) throw error

        revalidatePath('/')
        return { success: true }
    } catch (error) {
        console.error('Failed to update session status:', error)
        return { success: false, error: 'Failed to update session' }
    }
}

/**
 * Schedule a session to the calendar
 */
export async function scheduleSession(
    sessionId: string,
    scheduledStart: Date,
    scheduledEnd: Date
): Promise<{ success: boolean; error?: string }> {
    const supabase = createAdminClient()

    try {
        // Get session details
        const { data: session, error: fetchError } = await (supabase
            .from('task_sessions') as any)
            .select('*, inbox_queue!inner(*)')
            .eq('id', sessionId)
            .single()

        if (fetchError || !session) {
            throw new Error('Session not found')
        }

        // Create calendar event
        const { scheduleTask } = await import('@/lib/services/calendar')
        const task = session.inbox_queue

        const calendarResult = await scheduleTask(
            task.id,
            `${session.title}: ${task.subject || 'Task'}`,
            task.ai_domain || 'Task',
            task.ai_summary || '',
            task.ai_suggested_action || '',
            session.duration_minutes,
            task.trello_card_url,
            task.ai_priority || 'Normal',
            scheduledEnd
        )

        if (!calendarResult) {
            throw new Error('Failed to create calendar event')
        }

        // Update session with calendar details
        const { error: updateError } = await (supabase
            .from('task_sessions') as any)
            .update({
                scheduled_start: scheduledStart.toISOString(),
                scheduled_end: scheduledEnd.toISOString(),
                google_event_id: calendarResult.eventId,
                status: 'scheduled',
                updated_at: new Date().toISOString()
            })
            .eq('id', sessionId)

        if (updateError) throw updateError

        revalidatePath('/')
        return { success: true }
    } catch (error) {
        console.error('Failed to schedule session:', error)
        return { success: false, error: 'Failed to schedule session' }
    }
}
