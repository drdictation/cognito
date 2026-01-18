'use client'

import { useState } from 'react'
import { Calendar, MapPin, Users, Clock, AlertCircle, Check, X, Edit3 } from 'lucide-react'
import type { DetectedEventRow, EventType } from '@/lib/types/database'
import { approveDetectedEvent, rejectDetectedEvent } from '@/lib/actions/calendar-events'
import { toast } from 'sonner'

interface CalendarEventCardProps {
    event: DetectedEventRow
}

const eventTypeConfig: Record<EventType, { label: string; icon: React.JSX.Element; color: string }> = {
    meeting: {
        label: 'Meeting',
        icon: <Users className="w-4 h-4" />,
        color: 'bg-blue-500/10 text-blue-600 border-blue-500/20'
    },
    deadline: {
        label: 'Deadline',
        icon: <Clock className="w-4 h-4" />,
        color: 'bg-red-500/10 text-red-600 border-red-500/20'
    },
    appointment: {
        label: 'Appointment',
        icon: <Calendar className="w-4 h-4" />,
        color: 'bg-purple-500/10 text-purple-600 border-purple-500/20'
    },
    reminder: {
        label: 'Reminder',
        icon: <AlertCircle className="w-4 h-4" />,
        color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
    }
}

export function CalendarEventCard({ event }: CalendarEventCardProps) {
    const [isProcessing, setIsProcessing] = useState(false)
    const [isEditing, setIsEditing] = useState(false)

    const config = eventTypeConfig[event.event_type]
    const isConflict = event.status === 'conflict'

    const formatDateTime = (dateStr: string | null) => {
        if (!dateStr) return 'Not specified'
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

    const handleApprove = async () => {
        setIsProcessing(true)
        try {
            const result = await approveDetectedEvent(event.id)
            if (result.success) {
                toast.success('Calendar event created!')
            } else {
                if (result.error?.includes('Conflicts with')) {
                    toast.error(result.error, {
                        description: 'Please resolve the conflict or choose a different time'
                    })
                } else {
                    toast.error(result.error || 'Failed to create event')
                }
            }
        } catch (error) {
            toast.error('Failed to create calendar event')
        } finally {
            setIsProcessing(false)
        }
    }

    const handleReject = async () => {
        setIsProcessing(true)
        try {
            const result = await rejectDetectedEvent(event.id)
            if (result.success) {
                toast.success('Event dismissed')
            } else {
                toast.error(result.error || 'Failed to dismiss event')
            }
        } catch (error) {
            toast.error('Failed to dismiss event')
        } finally {
            setIsProcessing(false)
        }
    }

    return (
        <div className={`
            rounded-lg border p-4 mb-3
            ${isConflict ? 'border-red-500/50 bg-red-500/5' : 'border-gray-200 bg-white'}
            transition-all duration-200 hover:shadow-md
        `}>
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                    <div className={`
                        flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border
                        ${config.color}
                    `}>
                        {config.icon}
                        {config.label}
                    </div>
                    {event.confidence >= 0.8 && (
                        <div className="px-2 py-0.5 rounded-full text-xs bg-green-500/10 text-green-600 border border-green-500/20">
                            High confidence
                        </div>
                    )}
                </div>
                {isConflict && (
                    <div className="flex items-center gap-1 text-xs text-red-600">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Conflict
                    </div>
                )}
            </div>

            {/* Title */}
            <h4 className="font-semibold text-gray-900 mb-2">{event.title}</h4>

            {/* Details */}
            <div className="space-y-2 text-sm text-gray-600 mb-3">
                {event.proposed_start && (
                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <span>{formatDateTime(event.proposed_start)}</span>
                    </div>
                )}

                {event.duration_minutes && (
                    <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-400" />
                        <span>{event.duration_minutes} minutes</span>
                    </div>
                )}

                {event.location && (
                    <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-gray-400" />
                        <span className="truncate">{event.location}</span>
                    </div>
                )}

                {event.attendees && event.attendees.length > 0 && (
                    <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-gray-400" />
                        <span className="truncate">{event.attendees.join(', ')}</span>
                    </div>
                )}
            </div>

            {/* Source Quote */}
            {event.source_text && (
                <div className="mb-3 p-2 rounded bg-gray-50 border border-gray-200">
                    <p className="text-xs text-gray-500 mb-1">From email:</p>
                    <p className="text-sm text-gray-700 italic">"{event.source_text}"</p>
                </div>
            )}

            {/* Conflict Warning */}
            {isConflict && event.conflict_summary && (
                <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200">
                    <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="text-sm font-medium text-red-900">
                                Conflicts with existing event
                            </p>
                            <p className="text-sm text-red-700 mt-1">
                                {event.conflict_summary}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Actions */}
            {event.status === 'pending' || event.status === 'conflict' ? (
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleApprove}
                        disabled={isProcessing}
                        className="
                            flex items-center gap-1.5 px-4 py-2 rounded-lg
                            bg-green-600 text-white text-sm font-medium
                            hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed
                            transition-colors
                        "
                    >
                        <Check className="w-4 h-4" />
                        {isConflict ? 'Create Anyway' : 'Create Event'}
                    </button>

                    <button
                        onClick={() => setIsEditing(!isEditing)}
                        disabled={isProcessing}
                        className="
                            flex items-center gap-1.5 px-4 py-2 rounded-lg
                            bg-gray-100 text-gray-700 text-sm font-medium
                            hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed
                            transition-colors
                        "
                    >
                        <Edit3 className="w-4 h-4" />
                        Edit
                    </button>

                    <button
                        onClick={handleReject}
                        disabled={isProcessing}
                        className="
                            flex items-center gap-1.5 px-4 py-2 rounded-lg
                            bg-gray-100 text-gray-700 text-sm font-medium
                            hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed
                            transition-colors
                        "
                    >
                        <X className="w-4 h-4" />
                        Dismiss
                    </button>
                </div>
            ) : (
                <div className="text-sm text-gray-500">
                    {event.status === 'approved' && '✓ Event created in calendar'}
                    {event.status === 'rejected' && '✗ Event dismissed'}
                </div>
            )}

            {/* Edit Mode (Simple for now) */}
            {isEditing && (
                <div className="mt-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
                    <p className="text-sm text-gray-600">
                        Edit functionality coming soon. For now, you can dismiss and manually create the event.
                    </p>
                </div>
            )}
        </div>
    )
}
