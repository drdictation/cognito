'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { BlocklistEntry } from '@/lib/types/database'

interface BlocklistResponse {
    entries: BlocklistEntry[]
    error?: string
}

export async function getBlocklist(): Promise<BlocklistResponse> {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('blocklist')
        .select('*')
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching blocklist:', error)
        return { entries: [], error: error.message }
    }

    return { entries: data as BlocklistEntry[] }
}

export async function addToBlocklist(
    pattern: string,
    reason?: string
): Promise<{ success: boolean; error?: string }> {
    const supabase = createAdminClient()

    const { error } = await (supabase
        .from('blocklist') as any)
        .insert({
            email_pattern: pattern,
            reason: reason || null,
            is_active: true,
        })

    if (error) {
        console.error('Error adding to blocklist:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/admin')
    return { success: true }
}

export async function toggleBlocklistEntry(
    id: string,
    isActive: boolean
): Promise<{ success: boolean; error?: string }> {
    const supabase = createAdminClient()

    const { error } = await (supabase
        .from('blocklist') as any)
        .update({ is_active: isActive })
        .eq('id', id)

    if (error) {
        console.error('Error updating blocklist entry:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/admin')
    return { success: true }
}

export async function deleteFromBlocklist(
    id: string
): Promise<{ success: boolean; error?: string }> {
    const supabase = createAdminClient()

    const { error } = await (supabase
        .from('blocklist') as any)
        .delete()
        .eq('id', id)

    if (error) {
        console.error('Error deleting blocklist entry:', error)
        return { success: false, error: error.message }
    }

    revalidatePath('/admin')
    return { success: true }
}
