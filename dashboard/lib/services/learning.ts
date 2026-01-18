import { createAdminClient } from '@/lib/supabase/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '')
// Use 2.5 Flash Lite as per strict project rules
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })

export async function generateKnowledgeSuggestion(taskId: string) {
    const supabase = createAdminClient()

    // 1. Fetch task context
    const { data: task } = await (supabase
        .from('inbox_queue') as any)
        .select('*')
        .eq('id', taskId)
        .single()

    if (!task) return

    // 2. Fetch current knowledge
    const { data: knowledge } = await (supabase
        .from('domain_knowledge') as any)
        .select('content')
        .eq('domain', task.ai_domain)
        .single()

    const currentKnowledge = knowledge?.content || ""

    // 3. AI Analysis
    const prompt = `
    Analyze this email task to see if it reveals any NEW persistent knowledge for the user's Executive Assistant.
    
    TASK CONTEXT:
    Sender: ${task.real_sender}
    Subject: ${task.subject}
    Domain: ${task.ai_domain}
    Priority: ${task.ai_priority}
    Content Snippet: ${task.original_content?.substring(0, 500)}

    CURRENT DOMAIN KNOWLEDGE:
    ${currentKnowledge}

    GOAL:
    Identify if this email suggests a new pattern, key contact, or priority rule that is NOT already in the Current Knowledge.
    Examples of useful knowledge:
    - "Dr. Smith is a key contact"
    - "Emails about 'Project X' are High priority"
    - "Sender X requests meetings on Tuesdays"

    OUTPUT:
    If NO new knowledge, return "NO_UPDATE".
    If YES, return a concise markdown snippet (bullet point) to add to the knowledge base.
    Do NOT return JSON. Just the text.
    `

    try {
        const result = await model.generateContent(prompt)
        const text = result.response.text().trim()

        if (text === 'NO_UPDATE' || text.length < 5) return

        // 4. Save Suggestion
        console.log(`[Learning] Generated suggestion for task ${taskId}: ${text}`)

        await (supabase.from('knowledge_suggestions') as any).insert({
            domain: task.ai_domain,
            suggestion_type: 'general',
            suggested_content: text,
            source_task_id: taskId,
            status: 'pending'
        })

    } catch (e) {
        console.error('Error generating knowledge suggestion:', e)
    }
}
