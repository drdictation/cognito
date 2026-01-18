'use client'

import { useEffect, useState } from 'react'
import { getNoFlyZoneStatus, formatTimeUntil, NoFlyZoneStatus } from '@/lib/utils/no-fly-zone'
import { Moon, Sun, Plane } from 'lucide-react'

export function NoFlyZoneIndicator() {
    const [status, setStatus] = useState<NoFlyZoneStatus | null>(null)
    const [timeRemaining, setTimeRemaining] = useState<string>('')

    useEffect(() => {
        function updateStatus() {
            const now = new Date()
            const newStatus = getNoFlyZoneStatus(now)
            setStatus(newStatus)

            if (newStatus.isActive && newStatus.endsAt) {
                setTimeRemaining(formatTimeUntil(newStatus.endsAt, now))
            } else if (!newStatus.isActive && newStatus.startsAt) {
                setTimeRemaining(formatTimeUntil(newStatus.startsAt, now))
            }
        }

        updateStatus()
        const interval = setInterval(updateStatus, 60000) // Update every minute

        return () => clearInterval(interval)
    }, [])

    if (!status) return null

    return (
        <div className={`glass-card p-4 flex items-center gap-4 ${status.isActive
                ? 'border-l-4 border-l-amber-500'
                : 'border-l-4 border-l-emerald-500'
            }`}>
            <div className={`p-3 rounded-full ${status.isActive
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'bg-emerald-500/20 text-emerald-400'
                }`}>
                {status.isActive ? <Moon size={24} /> : <Sun size={24} />}
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className={`status-dot ${status.isActive ? 'status-inactive' : 'status-active'}`} />
                    <h3 className="font-semibold text-foreground">
                        {status.isActive ? 'No-Fly Zone Active' : 'Active Hours'}
                    </h3>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                    {status.message}
                </p>
            </div>

            <div className="text-right flex-shrink-0">
                <div className="flex items-center gap-1 text-muted-foreground">
                    <Plane size={14} />
                    <span className="text-xs uppercase tracking-wide">
                        {status.isActive ? 'Ends in' : 'Starts in'}
                    </span>
                </div>
                <p className="text-lg font-bold text-foreground">
                    {timeRemaining}
                </p>
            </div>
        </div>
    )
}
