'use client'

import { useState, useEffect } from 'react'
import { Trash2, Calendar, ExternalLink } from 'lucide-react'
import { getAllScheduledTasks, clearTaskCalendarData } from '@/lib/actions/calendar-admin'
import { toast } from 'sonner'

interface ScheduledTask {
    id: string
    subject: string | null
    scheduled_start: string | null
    scheduled_end: string | null
    calendar_event_id: string | null
    execution_status: string | null
}

export default function TaskManagement() {
    const [tasks, setTasks] = useState<ScheduledTask[]>([])
    const [loading, setLoading] = useState(true)
    const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())

    useEffect(() => {
        loadTasks()
    }, [])

    async function loadTasks() {
        setLoading(true)
        try {
            const data = await getAllScheduledTasks()
            setTasks(data)
        } catch (error) {
            console.error('Error loading tasks:', error)
            toast.error('Failed to load tasks')
        } finally {
            setLoading(false)
        }
    }

    async function handleClearTask(taskId: string) {
        if (!confirm('Clear this task\'s calendar data? The task will remain in your inbox but be unscheduled.')) {
            return
        }

        setDeletingIds(prev => new Set(prev).add(taskId))
        try {
            await clearTaskCalendarData(taskId)
            toast.success('Task calendar data cleared')
            loadTasks()
        } catch (error) {
            toast.error('Failed to clear task')
            console.error(error)
        } finally {
            setDeletingIds(prev => {
                const newSet = new Set(prev)
                newSet.delete(taskId)
                return newSet
            })
        }
    }

    function formatDate(dateStr: string | null): string {
        if (!dateStr) return 'Not scheduled'
        const date = new Date(dateStr)
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        })
    }

    if (loading) {
        return (
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-12 border border-white/20">
                <div className="text-center text-white">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                    <p>Loading tasks...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 overflow-hidden">
            <div className="p-6 border-b border-white/10">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-white">
                        All Scheduled Tasks ({tasks.length})
                    </h2>
                    <button
                        onClick={loadTasks}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                        Refresh
                    </button>
                </div>
            </div>

            {tasks.length === 0 ? (
                <div className="p-12 text-center text-slate-400">
                    No scheduled tasks found
                </div>
            ) : (
                <div className="divide-y divide-white/10">
                    {tasks.map(task => (
                        <div
                            key={task.id}
                            className="p-4 hover:bg-white/5 transition-colors"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-white font-medium mb-2 truncate">
                                        {task.subject || 'Untitled Task'}
                                    </h3>
                                    <div className="space-y-1 text-sm text-slate-400">
                                        <div className="flex items-center gap-2">
                                            <Calendar className="w-4 h-4" />
                                            <span>
                                                {formatDate(task.scheduled_start)}
                                                {task.scheduled_end && (
                                                    <> → {formatDate(task.scheduled_end)}</>
                                                )}
                                            </span>
                                        </div>
                                        {task.calendar_event_id && (
                                            <div className="flex items-center gap-2">
                                                <ExternalLink className="w-4 h-4" />
                                                <span className="text-xs font-mono truncate">
                                                    {task.calendar_event_id}
                                                </span>
                                            </div>
                                        )}
                                        <div>
                                            <span className={`text-xs px-2 py-1 rounded ${task.execution_status === 'completed' ? 'bg-green-500/20 text-green-300' :
                                                    task.execution_status === 'scheduled' ? 'bg-blue-500/20 text-blue-300' :
                                                        'bg-gray-500/20 text-gray-300'
                                                }`}>
                                                {task.execution_status || 'pending'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={() => handleClearTask(task.id)}
                                    disabled={deletingIds.has(task.id)}
                                    className="flex items-center gap-2 px-3 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                    title="Clear calendar data"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    Clear
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
