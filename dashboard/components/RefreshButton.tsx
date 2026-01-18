'use client'

import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { triggerIngestion } from '@/lib/actions/ingest'
import { toast } from 'sonner'

export function RefreshButton() {
    const router = useRouter()
    const [isRefreshing, setIsRefreshing] = useState(false)

    const handleRefresh = async () => {
        setIsRefreshing(true)

        try {
            // 1. Trigger the python ingestion script
            toast.info('Checking for new emails...')
            const result = await triggerIngestion()

            if (!result.success) {
                toast.error('Failed to fetch new emails: ' + result.error)
            } else {
                toast.success('Inbox updated')
            }
        } catch (e) {
            console.error(e)
            toast.error('Failed to run ingestion')
        }

        // 2. Refresh the UI data
        router.refresh()

        // Add a small cleanup delay for visual feedback
        setTimeout(() => {
            setIsRefreshing(false)
        }, 1000)
    }

    return (
        <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="btn-ghost flex items-center gap-2 self-start disabled:opacity-50"
            aria-label="Refresh tasks"
        >
            <RefreshCw
                size={18}
                className={isRefreshing ? 'animate-spin' : ''}
            />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
    )
}
