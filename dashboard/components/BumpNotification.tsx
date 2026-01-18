'use client'

import { useState } from 'react'
import { AlertTriangle, Undo2, X, Calendar, ArrowRight } from 'lucide-react'
import type { CognitoEventRow } from '@/lib/types/database'
import { undoBump } from '@/lib/actions/calendar-events'
import { toast } from 'sonner'

interface BumpNotificationProps {
    bumpedEvent: CognitoEventRow
    onDismiss?: () => void
}

export function BumpNotification({ bumpedEvent, onDismiss }: BumpNotificationProps) {
    const [isUndoing, setIsUndoing] = useState(false)

    const formatDateTime = (dateStr: string) => {
        const date = new Date(dateStr)
        return date.toLocaleString('en-AU', {
            timeZone: 'Australia/Melbourne',
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        })
    }

    const handleUndo = async () => {
        setIsUndoing(true)
        try {
            const result = await undoBump(bumpedEvent.id)
            if (result.success) {
                toast.success('Schedule restored to original time')
                onDismiss?.()
            } else {
                toast.error(result.error || 'Failed to undo bump')
            }
        } catch (error) {
            toast.error('Failed to undo bump')
        } finally {
            setIsUndoing(false)
        }
    }

    const isCritical = bumpedEvent.priority === 'Critical'
    const hasCascade = bumpedEvent.bump_count > 1

    return (
        <div className={`
            rounded-lg border p-4 mb-3
            ${isCritical
                ? 'bg-red-50 border-red-300'
                : 'bg-yellow-50 border-yellow-300'
            }
            shadow-sm
        `}>
            {/* Header */}
            <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                    <AlertTriangle className={`
                        w-5 h-5 
                        ${isCritical ? 'text-red-600' : 'text-yellow-600'}
                    `} />
                    <h4 className={`
                        font-semibold
                        ${isCritical ? 'text-red-900' : 'text-yellow-900'}
                    `}>
                        Task Bumped
                    </h4>
                </div>
                {onDismiss && (
                    <button
                        onClick={onDismiss}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Task Info */}
            <div className="mb-3">
                <p className={`
                    text-sm font-medium mb-1
                    ${isCritical ? 'text-red-800' : 'text-yellow-800'}
                `}>
                    {bumpedEvent.title}
                </p>
                <div className={`
                    flex items-center gap-2 text-xs
                    ${isCritical ? 'text-red-700' : 'text-yellow-700'}
                `}>
                    <span className="px-2 py-0.5 rounded-full bg-white/50 border border-current">
                        {bumpedEvent.priority}
                    </span>
                    {bumpedEvent.deadline && (
                        <span>
                            Due: {formatDateTime(bumpedEvent.deadline)}
                        </span>
                    )}
                </div>
            </div>

            {/* Time Change */}
            {bumpedEvent.original_start && (
                <div className={`
                    flex items-center gap-2 text-sm mb-3 p-2 rounded
                    ${isCritical ? 'bg-red-100/50' : 'bg-yellow-100/50'}
                `}>
                    <Calendar className="w-4 h-4 flex-shrink-0" />
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="line-through opacity-70">
                            {formatDateTime(bumpedEvent.original_start)}
                        </span>
                        <ArrowRight className="w-3 h-3" />
                        <span className="font-medium">
                            {formatDateTime(bumpedEvent.scheduled_start)}
                        </span>
                    </div>
                </div>
            )}

            {/* Cascade Warning */}
            {hasCascade && (
                <div className={`
                    mb-3 p-2 rounded text-xs
                    ${isCritical
                        ? 'bg-red-100 text-red-800 border border-red-200'
                        : 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                    }
                `}>
                    <AlertTriangle className="w-3 h-3 inline mr-1" />
                    This task has been bumped {bumpedEvent.bump_count} times
                </div>
            )}

            {/* Reason */}
            <p className={`
                text-sm mb-3
                ${isCritical ? 'text-red-700' : 'text-yellow-700'}
            `}>
                {isCritical
                    ? 'Moved to make room for a Critical priority task'
                    : 'Moved to make room for a higher priority task'
                }
            </p>

            {/* Actions */}
            <div className="flex items-center gap-2">
                <button
                    onClick={handleUndo}
                    disabled={isUndoing}
                    className={`
                        flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                        transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                        ${isCritical
                            ? 'bg-red-600 text-white hover:bg-red-700'
                            : 'bg-yellow-600 text-white hover:bg-yellow-700'
                        }
                    `}
                >
                    <Undo2 className="w-4 h-4" />
                    Undo Bump
                </button>
                <span className="text-xs text-gray-500">
                    Available while viewing this task
                </span>
            </div>
        </div>
    )
}

interface BumpNotificationBannerProps {
    bumpedEvents: CognitoEventRow[]
}

export function BumpNotificationBanner({ bumpedEvents }: BumpNotificationBannerProps) {
    const [dismissed, setDismissed] = useState<Set<string>>(new Set())

    if (bumpedEvents.length === 0) return null

    const visibleEvents = bumpedEvents.filter(e => !dismissed.has(e.id))

    if (visibleEvents.length === 0) return null

    const handleDismiss = (eventId: string) => {
        setDismissed(prev => new Set([...prev, eventId]))
    }

    return (
        <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-600" />
                Recent Schedule Changes
            </h3>
            <div className="space-y-2">
                {visibleEvents.map(event => (
                    <BumpNotification
                        key={event.id}
                        bumpedEvent={event}
                        onDismiss={() => handleDismiss(event.id)}
                    />
                ))}
            </div>
        </div>
    )
}
