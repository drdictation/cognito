'use client'

import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { useState, useEffect } from 'react'
import { triggerIngestion } from '@/lib/actions/ingest'
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
            // Initial refresh
            router.refresh()

            // Poll every 30 seconds (UI refresh only; ingestion happens via cron)
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
            toast.info('Checking for new emails...')

            const result = await triggerIngestion()

            if (!result.success) {
                console.error('Ingestion failed:', result.error)
                toast.error('Failed: ' + result.error)
            } else if (result.stats && result.stats.processed > 0) {
                // Only toast on success if emails were actually processed or manual
                toast.success(`Inbox updated: ${result.message}`)
            } else {
                toast.success('Inbox up to date')
            }

            // 2. Fix any stuck tasks (approved but execution incomplete)
            const fixResult = await fixStuckTasks()
            if (fixResult.fixed > 0) {
                toast.success(`🔧 Fixed ${fixResult.fixed} stuck task${fixResult.fixed > 1 ? 's' : ''}`)
            }
            if (fixResult.failed > 0) {
                toast.warning(`${fixResult.failed} task${fixResult.failed > 1 ? 's' : ''} could not be fixed`)
            }
        } catch (e) {
            console.error(e)
            toast.error('Failed to run ingestion')
        }

        // Refresh the UI data
        router.refresh()

        // Add a small cleanup delay for visual feedback
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
