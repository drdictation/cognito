'use client'

import { useState } from 'react'
import { Calendar, Check, X, Edit3, Layers } from 'lucide-react'
import type { MultiSessionSuggestion } from '@/lib/types/database'
import { toast } from 'sonner'

interface SessionsSuggestionProps {
    suggestion: MultiSessionSuggestion
    taskId: string
    deadline?: Date
    onAccept: () => void
    onReject: () => void
}

export function SessionsSuggestion({
    suggestion,
    taskId,
    deadline,
    onAccept,
    onReject
}: SessionsSuggestionProps) {
    const [isAdjusting, setIsAdjusting] = useState(false)
    const [sessionCount, setSessionCount] = useState(suggestion.suggested_sessions)
    const [duration, setDuration] = useState(suggestion.session_duration_minutes)
    const [cadence, setCadence] = useState(suggestion.cadence_days)
    const [isLoading, setIsLoading] = useState(false)

    const handleAccept = async () => {
        setIsLoading(true)
        try {
            const { createTaskSessions } = await import('@/lib/actions/sessions')
            const result = await createTaskSessions(
                taskId,
                sessionCount,
                duration,
                cadence,
                deadline
            )

            if (result.success) {
                toast.success(`Created ${sessionCount} linked work sessions`)
                onAccept()
            } else {
                toast.error(result.error || 'Failed to create sessions')
            }
        } catch (error) {
            toast.error('An error occurred')
            console.error(error)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="p-4 rounded-lg bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-purple-100">
                    <Layers className="w-5 h-5 text-purple-600" />
                </div>
                <div className="flex-1">
                    <h4 className="text-sm font-semibold text-gray-900 mb-1">
                        Multi-Session Task Detected
                    </h4>
                    <p className="text-sm text-gray-600 mb-3">
                        {suggestion.rationale}
                    </p>

                    {!isAdjusting ? (
                        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700 mb-3">
                            <Calendar className="w-4 h-4 text-purple-600" />
                            <span className="font-medium">
                                {sessionCount} sessions
                            </span>
                            <span className="text-gray-400">×</span>
                            <span className="font-medium">
                                {duration} minutes
                            </span>
                            <span className="text-gray-400">•</span>
                            <span className="text-gray-600">
                                Every {cadence} days
                            </span>
                        </div>
                    ) : (
                        <div className="space-y-3 mb-3">
                            <div className="grid grid-cols-3 gap-2">
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Sessions</label>
                                    <input
                                        type="number"
                                        min="2"
                                        max="10"
                                        value={sessionCount}
                                        onChange={(e) => setSessionCount(parseInt(e.target.value))}
                                        className="w-full text-sm border rounded px-2 py-1 focus:ring-2 focus:ring-purple-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Duration (min)</label>
                                    <input
                                        type="number"
                                        min="30"
                                        max="180"
                                        step="15"
                                        value={duration}
                                        onChange={(e) => setDuration(parseInt(e.target.value))}
                                        className="w-full text-sm border rounded px-2 py-1 focus:ring-2 focus:ring-purple-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Cadence (days)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="7"
                                        value={cadence}
                                        onChange={(e) => setCadence(parseInt(e.target.value))}
                                        className="w-full text-sm border rounded px-2 py-1 focus:ring-2 focus:ring-purple-500 outline-none"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-2">
                        {!isAdjusting ? (
                            <>
                                <button
                                    onClick={handleAccept}
                                    disabled={isLoading}
                                    className="px-3 py-1.5 text-xs text-white bg-purple-600 hover:bg-purple-700 rounded shadow-sm transition-colors flex items-center gap-1 disabled:opacity-50"
                                >
                                    <Check className="w-3 h-3" />
                                    Accept Chunking
                                </button>
                                <button
                                    onClick={() => setIsAdjusting(true)}
                                    className="px-3 py-1.5 text-xs text-purple-600 bg-white hover:bg-purple-50 rounded border border-purple-200 transition-colors flex items-center gap-1"
                                >
                                    <Edit3 className="w-3 h-3" />
                                    Adjust
                                </button>
                                <button
                                    onClick={onReject}
                                    className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded border border-gray-200 transition-colors flex items-center gap-1"
                                >
                                    <X className="w-3 h-3" />
                                    Single Block
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={handleAccept}
                                    disabled={isLoading}
                                    className="px-3 py-1.5 text-xs text-white bg-purple-600 hover:bg-purple-700 rounded shadow-sm transition-colors flex items-center gap-1 disabled:opacity-50"
                                >
                                    <Check className="w-3 h-3" />
                                    Create Sessions
                                </button>
                                <button
                                    onClick={() => setIsAdjusting(false)}
                                    className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded border border-gray-200 transition-colors"
                                >
                                    Cancel
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
