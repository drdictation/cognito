'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { analyzeTaskContent } from '@/lib/services/llm'
import { v4 as uuidv4 } from 'uuid'

interface CreateTaskResult {
    success: boolean
    taskId?: string
    error?: string
}

export async function createManualTask(content: string): Promise<CreateTaskResult> {
    if (!content || content.trim().length === 0) {
        return { success: false, error: 'Content is required' }
    }

    try {
        // Analyze content with AI
        const assessment = await analyzeTaskContent(content)

        if (!assessment) {
            return { success: false, error: 'Failed to analyze task content' }
        }

        const supabase = createAdminClient()

        // Generate a unique message_id for manual tasks
        const messageId = `manual_${uuidv4()}`

        // Prepare the task data
        const taskData = {
            message_id: messageId,
            source: 'manual',
            original_content: content,
            real_sender: 'self',
            subject: assessment.summary.substring(0, 100),
            ai_assessment: assessment,
            ai_domain: assessment.domain,
            ai_priority: assessment.priority,
            ai_summary: assessment.summary,
            ai_suggested_action: assessment.suggested_action,
            ai_estimated_minutes: assessment.estimated_minutes,
            status: 'pending',
            model_used: 'gemini-2.0-flash-lite',
        }

        // Insert into inbox_queue (using any to bypass strict typing since DB has more fields)
        const { data, error } = await (supabase
            .from('inbox_queue') as any)
            .insert(taskData as any)
            .select('id')
            .single()

        if (error) {
            console.error('Error inserting manual task:', error)
            return { success: false, error: error.message }
        }

        revalidatePath('/')

        return { success: true, taskId: (data as any)?.id }

    } catch (error) {
        console.error('Error creating manual task:', error)
        return { success: false, error: 'Failed to create task' }
    }
}
