'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { InboxTask, Priority, Domain, TaskStatus } from '@/lib/types/database'

interface TasksResponse {
    tasks: InboxTask[]
    error?: string
}

export async function getPendingTasks(): Promise<TasksResponse> {
    const supabase = createAdminClient()

    const { data, error } = await (supabase
        .from('inbox_queue') as any)
        .select('*')
        .eq('status', 'pending')
        .order('ai_priority', { ascending: true })
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching tasks:', error)
        return { tasks: [], error: error.message }
    }

    // Sort by priority manually since Supabase doesn't know our priority order
    const priorityOrder = { 'Critical': 0, 'High': 1, 'Normal': 2, 'Low': 3 }
    const sortedTasks = (data || []).sort((a: any, b: any) => {
        const aPriority = priorityOrder[a.ai_priority as keyof typeof priorityOrder] ?? 4
        const bPriority = priorityOrder[b.ai_priority as keyof typeof priorityOrder] ?? 4
        if (aPriority !== bPriority) return aPriority - bPriority
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

    return { tasks: sortedTasks as InboxTask[] }
}

export async function updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    snoozedUntil?: string
): Promise<{ success: boolean; error?: string; trelloUrl?: string }> {
    const supabase = createAdminClient()

    // Fetch the task to get AI assessment
    const { data: taskData } = await (supabase
        .from('inbox_queue') as any)
        .select('*')
        .eq('id', taskId)
        .single()

    const task = taskData as InboxTask | null

    const updateData: any = { status }
    if (status === 'snoozed' && snoozedUntil) {
        updateData.snoozed_until = snoozedUntil
    } else {
        updateData.snoozed_until = null
    }

    // Phase 7b: Set default deadline if not already set
    if (status === 'approved' && task && !task.deadline) {
        const { getDefaultDeadline } = await import('@/lib/services/calendar-intelligence')
        const priority = (task.ai_priority || 'Normal') as Priority
        const deadline = getDefaultDeadline(priority)
        updateData.deadline = deadline.toISOString()
        updateData.deadline_source = 'default'
    }

    const { error } = await (supabase
        .from('inbox_queue') as any)
        .update(updateData)
        .eq('id', taskId)

    if (error) {
        console.error('Error updating task status:', error)
        return { success: false, error: error.message }
    }

    // Phase 7b: Save detected events to database
    if (status === 'approved' && task?.ai_assessment?.detected_events) {
        try {
            const { saveDetectedEvent } = await import('@/lib/services/calendar-intelligence')
            for (const event of task.ai_assessment.detected_events) {
                await saveDetectedEvent(taskId, event)
            }
        } catch (e) {
            console.error('Failed to save detected events:', e)
            // Don't fail the whole operation
        }
    }

    // Phase 3c: Auto-execute on approve - create Trello card
    let trelloUrl: string | undefined
    if (status === 'approved') {
        try {
            const { executeTask } = await import('@/lib/services/execution')
            const result = await executeTask(taskId)
            if (result.success && result.trelloCardUrl) {
                trelloUrl = result.trelloCardUrl
                console.log(`Task ${taskId} executed: ${trelloUrl}`)
            } else if (result.error) {
                console.warn(`Execution warning for ${taskId}: ${result.error}`)
            }
        } catch (e) {
            console.error('Execution error:', e)
            // Don't fail the approve action if execution fails
        }
    }

    // Phase 7: AI Learning (Proactive Suggestions)
    if (status === 'approved') {
        try {
            const { generateKnowledgeSuggestion } = await import('@/lib/services/learning')
            // Await to ensure it runs before response (for MVP reliability)
            await generateKnowledgeSuggestion(taskId)
        } catch (e) {
            console.error('Learning error:', e)
        }
    }

    revalidatePath('/')
    return { success: true, trelloUrl }
}

export async function tweakTask(
    taskId: string,
    updates: { priority?: Priority; domain?: Domain },
    originalTask: InboxTask
): Promise<{ success: boolean; error?: string }> {
    const supabase = createAdminClient()

    const updateData: Partial<InboxTask> = {}

    if (updates.priority) {
        updateData.ai_priority = updates.priority
    }
    if (updates.domain) {
        updateData.ai_domain = updates.domain
    }

    // Update the task
    const { error: updateError } = await (supabase
        .from('inbox_queue') as any)
        .update(updateData)
        .eq('id', taskId)

    if (updateError) {
        console.error('Error updating task:', updateError)
        return { success: false, error: updateError.message }
    }

    // Log the decision for learning
    const { error: logError } = await (supabase
        .from('decision_log') as any)
        .insert({
            task_id: taskId,
            ai_prediction: {
                priority: originalTask.ai_priority,
                domain: originalTask.ai_domain,
                summary: originalTask.ai_summary,
            },
            user_correction: updates,
            correction_type: updates.priority && updates.domain
                ? 'priority_and_domain'
                : updates.priority
                    ? 'priority'
                    : 'domain',
        })

    if (logError) {
        console.error('Error logging decision:', logError)
        // Don't fail the whole operation if logging fails
    }

    revalidatePath('/')
    return { success: true }
}

interface BriefingStats {
    totalPending: number
    totalMinutes: number
    byDomain: {
        domain: Domain
        count: number
        minutes: number
    }[]
    byPriority: {
        priority: Priority
        count: number
    }[]
}

export async function getBriefingStats(): Promise<BriefingStats> {
    const supabase = createAdminClient()

    const { data: tasks, error } = await (supabase
        .from('inbox_queue') as any)
        .select('ai_domain, ai_priority, ai_estimated_minutes')
        .eq('status', 'pending')

    if (error || !tasks) {
        return {
            totalPending: 0,
            totalMinutes: 0,
            byDomain: [],
            byPriority: [],
        }
    }

    const domainStats = new Map<Domain, { count: number; minutes: number }>()
    const priorityStats = new Map<Priority, number>()
    let totalMinutes = 0

    for (const task of tasks) {
        const domain = (task as any).ai_domain as Domain
        const priority = (task as any).ai_priority as Priority
        const minutes = (task as any).ai_estimated_minutes || 0
        totalMinutes += minutes

        if (domain) {
            const current = domainStats.get(domain) || { count: 0, minutes: 0 }
            domainStats.set(domain, {
                count: current.count + 1,
                minutes: current.minutes + minutes
            })
        }

        if (priority) {
            priorityStats.set(priority, (priorityStats.get(priority) || 0) + 1)
        }
    }

    const byDomain = Array.from(domainStats.entries()).map(([domain, stats]) => ({
        domain,
        count: stats.count,
        minutes: stats.minutes,
    }))

    const byPriority = Array.from(priorityStats.entries()).map(([priority, count]) => ({
        priority,
        count,
    }))

    return {
        totalPending: tasks.length,
        totalMinutes,
        byDomain,
        byPriority,
    }
}
