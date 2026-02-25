'use server'

import { processNextEmail, createIngestionLog, updateIngestionLog } from '@/lib/services/ingestion'

export async function beginSync() {
    try {
        console.log('🔄 Starting manual sync...')
        const id = await createIngestionLog()
        return { success: true, logId: id }
    } catch (e) {
        return { success: false, error: 'Failed to start sync' }
    }
}

export async function syncOneEmail() {
    try {
        const result = await processNextEmail()
        return { success: true, ...result }
    } catch (e) {
        return { success: false, error: 'Network error or timeout' }
    }
}

export async function finishSync(logId: string, stats: { processed: number, blocked: number, errors: number, found: number }, errorDetails: { subject: string, error: string }[]) {
    try {
        if (!logId) return { success: true };
        await updateIngestionLog(logId, stats, errorDetails)
        return { success: true }
    } catch (e) {
        return { success: false, error: 'Failed to log completion' }
    }
}
