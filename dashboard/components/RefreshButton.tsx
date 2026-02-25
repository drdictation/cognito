'use client'

import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { useState, useEffect } from 'react'
import { beginSync, syncOneEmail, finishSync } from '@/lib/actions/ingest'
import { fixStuckTasks } from '@/lib/actions/fix-stuck'
import { toast } from 'sonner'

export function RefreshButton() {
    const router = useRouter()
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [isAutoEnabled, setIsAutoEnabled] = useState(true)

    // Auto-refresh effect
    useEffect(() => {
        let intervalId: NodeJS.Timeout

        if (isAutoEnabled) {
            router.refresh()
            intervalId = setInterval(() => {
                router.refresh()
            }, 30000)
        }

        return () => {
            if (intervalId) clearInterval(intervalId)
        }
    }, [isAutoEnabled, router])

    const handleSyncNow = async () => {
        if (isRefreshing) return
        setIsRefreshing(true)

        try {
            toast.info('Starting sync...', { id: 'sync' })

            const startRes = await beginSync()
            if (!startRes.success) {
                toast.error('Failed to start sync', { id: 'sync' })
                return setIsRefreshing(false)
            }
            const logId = startRes.logId

            let processed = 0
            let blocked = 0
            let errors = 0
            const errorDetails: { subject: string, error: string }[] = []

            while (true) {
                const res = await syncOneEmail()

                if (!res.success) {
                    errors++
                    errorDetails.push({ subject: 'Unknown', error: res.error || 'Network error' })
                    break // Stop on hard network errors
                }

                const data = res as any
                if (data.done) {
                    break // No more emails!
                }

                if (data.status === 'processed') processed++
                else if (data.status === 'blocked') blocked++
                else if (data.status === 'error') {
                    errors++
                    errorDetails.push({ subject: data.subject || 'Unknown', error: data.error || 'Task failed' })
                }

                toast.loading(`Synced: ${processed}, Failed: ${errors} (${data.subject?.substring(0, 30)}...)`, { id: 'sync' })
            }

            const total = processed + blocked + errors;

            if (logId) {
                await finishSync(logId, { processed, blocked, errors, found: total }, errorDetails)
            }

            if (total === 0) {
                toast.success('Inbox up to date', { id: 'sync' })
            } else if (errors === 0) {
                toast.success(`Sync complete: Processed ${processed}${blocked > 0 ? `, Blocked ${blocked}` : ''}`, { id: 'sync' })
            } else {
                toast.warning(`Sync finished with ${errors} error(s). Processed ${processed}`, { id: 'sync' })
            }

            // Fix stuck tasks
            const fixResult = await fixStuckTasks()
            if (fixResult.fixed > 0) {
                toast.success(`🔧 Fixed ${fixResult.fixed} stuck task(s)`)
            }
        } catch (e) {
            console.error(e)
            toast.error('Failed to run ingestion', { id: 'sync' })
        }

        router.refresh()

        setTimeout(() => {
            setIsRefreshing(false)
        }, 1000)
    }

    return (
        <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-secondary/50 px-3 py-1.5 rounded-full border border-border/50">
                <div className={`w-2 h-2 rounded-full ${isAutoEnabled ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                <label htmlFor="auto-refresh" className="text-xs font-medium cursor-pointer select-none">
                    Auto
                </label>
                <input
                    id="auto-refresh"
                    type="checkbox"
                    checked={isAutoEnabled}
                    onChange={(e) => setIsAutoEnabled(e.target.checked)}
                    className="toggle toggle-xs toggle-success"
                />
            </div>

            <button
                onClick={() => handleSyncNow()}
                disabled={isRefreshing}
                className="btn-ghost flex items-center gap-2 disabled:opacity-50"
                aria-label="Refresh tasks"
            >
                <RefreshCw
                    size={18}
                    className={isRefreshing ? 'animate-spin' : ''}
                />
                {isRefreshing ? 'Syncing...' : 'Sync now'}
            </button>
        </div>
    )
}
