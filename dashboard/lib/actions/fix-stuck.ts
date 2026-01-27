'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { executeTask } from '@/lib/services/execution'

export interface FixStuckResult {
    success: boolean
    fixed: number
    failed: number
    errors: string[]
}

/**
 * Find and re-execute tasks that are stuck in partial execution state.
 * A stuck task has status='approved' but execution_status='pending',
 * meaning the approval succeeded but execution failed before completing.
 */
export async function fixStuckTasks(): Promise<FixStuckResult> {
    const supabase = createAdminClient()

    // Find stuck tasks: approved but execution never completed
    const { data: stuckTasks, error } = await (supabase
        .from('inbox_queue') as any)
        .select('id, subject, trello_card_id')
        .eq('status', 'approved')
        .eq('execution_status', 'pending')

    if (error) {
        console.error('Error querying stuck tasks:', error)
        return { success: false, fixed: 0, failed: 0, errors: [error.message] }
    }

    if (!stuckTasks || stuckTasks.length === 0) {
        return { success: true, fixed: 0, failed: 0, errors: [] }
    }

    console.log(`Found ${stuckTasks.length} stuck tasks to fix`)

    let fixed = 0
    let failed = 0
    const errors: string[] = []

    for (const task of stuckTasks) {
        try {
            console.log(`Fixing stuck task: ${task.subject}`)

            // If Trello card already exists, we just need to retry calendar scheduling
            // The executeTask function handles this - it will skip Trello if card exists
            const result = await executeTask(task.id)

            if (result.success) {
                console.log(`Fixed: ${task.subject}`)
                fixed++
            } else {
                console.warn(`Failed to fix: ${task.subject} - ${result.error}`)
                failed++
                errors.push(`${task.subject}: ${result.error}`)
            }
        } catch (e) {
            console.error(`Error fixing task ${task.id}:`, e)
            failed++
            errors.push(`${task.subject}: ${e instanceof Error ? e.message : 'Unknown error'}`)
        }
    }

    return { success: true, fixed, failed, errors }
}
