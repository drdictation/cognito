'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { Domain, Priority } from '@/lib/types/database'

// --- Domain Knowledge ---

export async function getKnowledge(domain: Domain) {
    const supabase = createAdminClient()
    const { data, error } = await (supabase
        .from('domain_knowledge') as any)
        .select('*')
        .eq('domain', domain)
        .single()

    if (error) {
        console.error('Error fetching knowledge:', error)
        return null
    }
    return data
}

export async function getAllKnowledge() {
    const supabase = createAdminClient()
    const { data, error } = await (supabase
        .from('domain_knowledge') as any)
        .select('*')
        .order('domain')

    if (error) {
        console.error('Error fetching all knowledge:', error)
        return []
    }
    return data
}

export async function saveKnowledge(domain: Domain, content: string) {
    const supabase = createAdminClient()
    const { error } = await (supabase
        .from('domain_knowledge') as any)
        .upsert({ domain, content, updated_at: new Date().toISOString() }, { onConflict: 'domain' })

    if (error) {
        return { success: false, error: error.message }
    }

    revalidatePath('/knowledge')
    return { success: true }
}

// --- Contacts ---

export async function getContacts() {
    const supabase = createAdminClient()
    const { data, error } = await (supabase
        .from('contacts') as any)
        .select('*')
        .order('created_at', { ascending: false })

    if (error) {
        return { success: false, error: error.message }
    }
    return { success: true, data: data }
}

export async function createContact(contact: {
    name: string
    email?: string
    role?: string
    domain: Domain
    priority_boost?: Priority
    notes?: string
}) {
    const supabase = createAdminClient()
    const { error } = await (supabase.from('contacts') as any).insert(contact)

    if (error) return { success: false, error: error.message }
    revalidatePath('/knowledge')
    return { success: true }
}

export async function deleteContact(id: string) {
    const supabase = createAdminClient()
    const { error } = await (supabase.from('contacts') as any).delete().eq('id', id)

    if (error) return { success: false, error: error.message }
    revalidatePath('/knowledge')
    return { success: true }
}

// --- Suggestions ---

export async function getSuggestions() {
    const supabase = createAdminClient()
    const { data, error } = await (supabase
        .from('knowledge_suggestions') as any)
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

    if (error) return []
    return data
}

export async function approveSuggestion(id: string) {
    const supabase = createAdminClient()

    // 1. Fetch suggestion
    const { data: suggestion } = await (supabase
        .from('knowledge_suggestions') as any)
        .select('*')
        .eq('id', id)
        .single()

    if (!suggestion) return { success: false, error: 'Suggestion not found' }

    // 2. Append to domain knowledge
    const { data: currentKnowledge } = await (supabase
        .from('domain_knowledge') as any)
        .select('content')
        .eq('domain', suggestion.domain)
        .single()

    const newContent = (currentKnowledge?.content || '') + '\n\n' + suggestion.suggested_content

    const { error: updateError } = await (supabase
        .from('domain_knowledge') as any)
        .update({ content: newContent, updated_at: new Date().toISOString() })
        .eq('domain', suggestion.domain)

    if (updateError) return { success: false, error: updateError.message }

    // 3. Mark suggestion approved
    await (supabase
        .from('knowledge_suggestions') as any)
        .update({ status: 'approved' })
        .eq('id', id)

    revalidatePath('/knowledge')
    return { success: true }
}

export async function rejectSuggestion(id: string) {
    const supabase = createAdminClient()
    const { error } = await (supabase
        .from('knowledge_suggestions') as any)
        .update({ status: 'rejected' })
        .eq('id', id)

    if (error) return { success: false, error: error.message }
    revalidatePath('/knowledge')
    return { success: true }
}
