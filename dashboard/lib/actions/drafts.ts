'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { revalidatePath } from 'next/cache'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '')
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })

export async function saveDraft(taskId: string, draft: string) {
    const supabase = createAdminClient()

    const { error } = await (supabase
        .from('inbox_queue') as any)
        .update({ draft_response: draft })
        .eq('id', taskId)

    if (error) {
        console.error('Error saving draft:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/')
    return { success: true }
}

export async function regenerateDraft(taskId: string, instruction: string, currentDraft: string) {
    const supabase = createAdminClient()

    // 1. Fetch original email context
    const { data: task, error: fetchError } = await (supabase
        .from('inbox_queue') as any)
        .select('original_content, real_sender, subject, ai_domain')
        .eq('id', taskId)
        .single()

    if (fetchError || !task) {
        return { success: false, error: 'Task not found' }
    }

    // Cast task to expected type to silence linter if schema type inference fails
    const emailContext = task as { original_content: string | null; real_sender: string; subject: string | null; ai_domain: string | null }

    // 2. Fetch Domain Knowledge (Pass 2)
    let domainContext = ""
    if (emailContext.ai_domain) {
        const { data: knowledge } = await (supabase
            .from('domain_knowledge') as any)
            .select('content')
            .eq('domain', emailContext.ai_domain)
            .single()

        if (knowledge?.content) {
            domainContext = knowledge.content
        }
    }

    // 2. Call Gemini for regeneration
    try {
        const apiKey = process.env.GOOGLE_AI_API_KEY
        if (!apiKey) {
            console.error('Missing GOOGLE_AI_API_KEY')
            return { success: false, error: 'Server configuration error: Missing API Key' }
        }

        const prompt = `
        You are an intelligent Executive Assistant named "Chamara".
        
        TASK: Rewrite the email draft based on the User's instruction.
        
        CONTEXT:
        Original Email Subject: ${emailContext.subject}
        Original Email From: ${emailContext.real_sender}
        Original Email Content:
        ${emailContext.original_content?.substring(0, 5000)}

        DOMAIN KNOWLEDGE (${emailContext.ai_domain || 'General'}):
        ${domainContext || "No specific domain knowledge available."}
        
        CURRENT DRAFT:
        ${currentDraft || "No draft yet - please create one."}
        
        USER INSTRUCTION:
        "${instruction}"
        
        REQUIREMENTS:
        - Output ONLY the new draft content.
        - Maintain a professional but authentic tone.
        - Sign off as "Chamara".
        `

        console.log(`Regenerating draft for task ${taskId} with instruction: ${instruction}`)
        const result = await model.generateContent(prompt)
        const response = result.response
        const newDraft = response.text().trim()
        console.log(`Generated new draft length: ${newDraft.length}`)

        // 3. Save new draft
        await saveDraft(taskId, newDraft)

        return { success: true, draft: newDraft }

    } catch (e: any) {
        console.error('AI Draft Regeneration Error:', e)
        return { success: false, error: `Failed to regenerate draft: ${e.message || e}` }
    }
}
