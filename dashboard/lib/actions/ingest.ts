'use server'

import { processEmails } from '@/lib/services/ingestion'

export async function triggerIngestion() {
    try {
        console.log('🔄 Triggering email ingestion...')

        const result = await processEmails()

        if (result.success) {
            console.log(`✅ Ingestion complete: ${result.message}`)
            return {
                success: true,
                message: result.message,
                stats: {
                    processed: result.processed,
                    blocked: result.blocked,
                    errors: result.errors
                }
            }
        } else {
            console.error(`❌ Ingestion failed: ${result.message}`)
            return {
                success: false,
                error: result.message
            }
        }
    } catch (error: any) {
        console.error('Ingestion failed:', error)
        return {
            success: false,
            error: error.message || 'Failed to populate inbox'
        }
    }
}
