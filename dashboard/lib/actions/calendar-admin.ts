'use server'

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Clear all scheduled tasks (useful for cleaning up after manual Google Calendar changes)
 */
export async function clearAllScheduledTasks() {
    const { error } = await supabaseAdmin
        .from('inbox_queue')
        .update({
            calendar_event_id: null,
            scheduled_start: null,
            scheduled_end: null,
            execution_status: 'pending'
        })
        .not('calendar_event_id', 'is', null)

    if (error) {
        console.error('Error clearing tasks:', error)
        throw error
    }

    revalidatePath('/calendar')
    return { success: true }
}

/**
 * Clear a specific task's calendar data
 */
export async function clearTaskCalendarData(taskId: string) {
    const { error } = await supabaseAdmin
        .from('inbox_queue')
        .update({
            calendar_event_id: null,
            scheduled_start: null,
            scheduled_end: null,
            execution_status: 'pending'
        })
        .eq('id', taskId)

    if (error) {
        console.error('Error clearing task:', error)
        throw error
    }

    revalidatePath('/calendar')
    return { success: true }
}

/**
 * Get all scheduled tasks for admin view
 */
export async function getAllScheduledTasks() {
    const { data, error } = await supabaseAdmin
        .from('inbox_queue')
        .select('id, subject, scheduled_start, scheduled_end, calendar_event_id, execution_status')
        .not('scheduled_start', 'is', null)
        .order('scheduled_start', { ascending: false })
        .limit(50)

    if (error) {
        console.error('Error fetching tasks:', error)
        throw error
    }

    return data
}
