'use client'

import { useState } from 'react'
import { Play, Pause, Check, ExternalLink, Trash2 } from 'lucide-react'
import { CalendarTask, Priority } from '@/lib/types/database'
import { startTask, pauseTask, resumeTask, completeTask, startAdHocTask } from '@/lib/actions/time-tracking'
import { clearTaskCalendarData } from '@/lib/actions/calendar-admin'
import { toast } from 'sonner'

interface TimeBlockProps {
    task: CalendarTask
    onUpdate: () => void
}

const priorityColors: Record<Priority, string> = {
    Critical: 'bg-red-500/20 border-red-500',
    High: 'bg-orange-500/20 border-orange-500',
    Normal: 'bg-blue-500/20 border-blue-500',
    Low: 'bg-green-500/20 border-green-500'
}

const statusColors = {
    scheduled: 'bg-blue-500/20 border-blue-500',
    running: 'bg-yellow-500/20 border-yellow-500 animate-pulse',
    paused: 'bg-orange-500/20 border-orange-500',
    completed: 'bg-green-500/20 border-green-500'
}

export default function TimeBlock({ task, onUpdate }: TimeBlockProps) {
    const [loading, setLoading] = useState(false)
    const [expanded, setExpanded] = useState(false)

    async function handleStart() {
        setLoading(true)
        try {
            if (task.id.startsWith('adhoc-')) {
                // Determine timestamps
                const start = task.scheduled_start ? new Date(task.scheduled_start) : new Date()
                const end = task.scheduled_end ? new Date(task.scheduled_end) : new Date(start.getTime() + 3600000)
                const calendarId = task.calendar_event_id || task.id.replace('adhoc-', '')

                await startAdHocTask(task.subject || 'Untitled Event', start, end, calendarId)
            } else {
                await startTask(task.id)
            }
            toast.success('Task started')
            onUpdate()
        } catch (error) {
            toast.error('Failed to start task')
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    async function handlePause() {
        if (!task.active_time_log_id) return
        setLoading(true)
        try {
            await pauseTask(task.active_time_log_id)
            toast.success('Task paused')
            onUpdate()
        } catch (error) {
            toast.error('Failed to pause task')
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    async function handleResume() {
        if (!task.active_time_log_id) return
        setLoading(true)
        try {
            await resumeTask(task.active_time_log_id)
            toast.success('Task resumed')
            onUpdate()
        } catch (error) {
            toast.error('Failed to resume task')
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    async function handleComplete() {
        if (!task.active_time_log_id) return
        setLoading(true)
        try {
            const result = await completeTask(task.active_time_log_id)
            toast.success(`Task completed! Took ${result.actual_minutes} minutes`)
            onUpdate()
        } catch (error) {
            toast.error('Failed to complete task')
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    async function handleDelete() {
        if (!confirm('Remove this task from the calendar? The task will remain in your inbox but be unscheduled.')) {
            return
        }
        setLoading(true)
        try {
            await clearTaskCalendarData(task.id)
            toast.success('Task removed from calendar')
            onUpdate()
        } catch (error) {
            toast.error('Failed to remove task')
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    function formatElapsedTime(seconds: number): string {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    const startTime = task.scheduled_start
        ? new Date(task.scheduled_start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : ''

    const endTime = task.scheduled_end
        ? new Date(task.scheduled_end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : ''

    const colorClass = statusColors[task.block_status]

    return (
        <div
            className={`rounded-lg border-2 p-3 transition-all cursor-pointer ${colorClass}`}
            onClick={() => setExpanded(!expanded)}
        >
            {/* Compact View */}
            <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">
                            {startTime} - {endTime}
                        </span>
                        {task.ai_priority && (
                            <span className={`text-xs px-2 py-0.5 rounded ${priorityColors[task.ai_priority]}`}>
                                {task.ai_priority}
                            </span>
                        )}
                    </div>
                    <h3 className="text-sm font-medium text-white truncate mt-1">
                        {task.subject || 'Untitled Task'}
                    </h3>
                    {task.block_status === 'running' && task.elapsed_seconds !== null && (
                        <div className="text-xs text-yellow-400 mt-1">
                            ⏱️ {formatElapsedTime(task.elapsed_seconds)} elapsed
                        </div>
                    )}
                    {task.block_status === 'completed' && (
                        <div className="text-xs text-green-400 mt-1">
                            ✓ Completed
                        </div>
                    )}
                </div>

                {/* Status Indicator */}
                <div className="flex items-center gap-2">
                    {task.block_status === 'scheduled' && (
                        <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                    )}
                    {task.block_status === 'running' && (
                        <div className="w-3 h-3 rounded-full bg-yellow-500 animate-pulse"></div>
                    )}
                    {task.block_status === 'paused' && (
                        <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                    )}
                    {task.block_status === 'completed' && (
                        <Check className="w-4 h-4 text-green-500" />
                    )}
                </div>
            </div>

            {/* Expanded View */}
            {expanded && (
                <div className="mt-4 pt-4 border-t border-white/10 space-y-3" onClick={(e) => e.stopPropagation()}>
                    {/* Task Details */}
                    <div className="text-sm text-slate-300 space-y-1">
                        {task.ai_domain && (
                            <div>
                                <span className="text-slate-500">Domain:</span> {task.ai_domain}
                            </div>
                        )}
                        {task.ai_estimated_minutes && (
                            <div>
                                <span className="text-slate-500">Estimated:</span> {task.ai_estimated_minutes} min
                            </div>
                        )}
                        <div className="text-xs text-slate-500 mt-2">
                            Status: {task.block_status}
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                        {task.block_status === 'scheduled' && (
                            <button
                                onClick={handleStart}
                                disabled={loading}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                            >
                                <Play className="w-4 h-4" />
                                Start
                            </button>
                        )}

                        {task.block_status === 'running' && (
                            <>
                                <button
                                    onClick={handlePause}
                                    disabled={loading}
                                    className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                >
                                    <Pause className="w-4 h-4" />
                                    Pause
                                </button>
                                <button
                                    onClick={handleComplete}
                                    disabled={loading}
                                    className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                >
                                    <Check className="w-4 h-4" />
                                    Complete
                                </button>
                            </>
                        )}

                        {task.block_status === 'paused' && (
                            <>
                                <button
                                    onClick={handleResume}
                                    disabled={loading}
                                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                >
                                    <Play className="w-4 h-4" />
                                    Resume
                                </button>
                                <button
                                    onClick={handleComplete}
                                    disabled={loading}
                                    className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                >
                                    <Check className="w-4 h-4" />
                                    Complete
                                </button>
                            </>
                        )}

                        {task.trello_card_url && (
                            <a
                                href={task.trello_card_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors"
                            >
                                <ExternalLink className="w-4 h-4" />
                                Trello
                            </a>
                        )}

                        <button
                            onClick={handleDelete}
                            disabled={loading}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ml-auto"
                            title="Remove from calendar"
                        >
                            <Trash2 className="w-4 h-4" />
                            Delete
                        </button>
                    </div>
                </div>
            )
            }
        </div >
    )
}
