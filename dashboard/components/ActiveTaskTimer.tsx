'use client'

import { useState, useEffect } from 'react'
import { Pause, Check } from 'lucide-react'
import { getCalendarTasks, pauseTask, completeTask } from '@/lib/actions/time-tracking'
import { toast } from 'sonner'

interface ActiveTaskTimerProps {
    taskId: string
    onComplete: () => void
}

export default function ActiveTaskTimer({ taskId, onComplete }: ActiveTaskTimerProps) {
    const [task, setTask] = useState<any>(null)
    const [elapsedSeconds, setElapsedSeconds] = useState(0)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        loadTask()
        const interval = setInterval(() => {
            setElapsedSeconds(prev => prev + 1)
        }, 1000)

        return () => clearInterval(interval)
    }, [taskId])

    async function loadTask() {
        try {
            const tasks = await getCalendarTasks(new Date())
            const activeTask = tasks.find(t => t.id === taskId)
            if (activeTask) {
                setTask(activeTask)
                setElapsedSeconds(activeTask.elapsed_seconds || 0)
            }
        } catch (error) {
            console.error('Error loading task:', error)
        }
    }

    async function handlePause() {
        if (!task?.active_time_log_id) return
        setLoading(true)
        try {
            await pauseTask(task.active_time_log_id)
            toast.success('Task paused')
            onComplete()
        } catch (error) {
            toast.error('Failed to pause task')
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    async function handleComplete() {
        if (!task?.active_time_log_id) return
        setLoading(true)
        try {
            const result = await completeTask(task.active_time_log_id)
            toast.success(`Task completed! Took ${result.actual_minutes} minutes`)
            onComplete()
        } catch (error) {
            toast.error('Failed to complete task')
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    function formatTime(seconds: number): string {
        const hours = Math.floor(seconds / 3600)
        const mins = Math.floor((seconds % 3600) / 60)
        const secs = seconds % 60

        if (hours > 0) {
            return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        }
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    if (!task) return null

    return (
        <div className="fixed top-4 right-4 z-50 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-2xl shadow-2xl p-4 min-w-[320px] animate-pulse">
            <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                    <div className="text-xs text-white/80 font-medium mb-1">
                        ⏱️ TASK IN PROGRESS
                    </div>
                    <div className="text-white font-bold text-lg truncate">
                        {task.subject || 'Untitled Task'}
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                        <div className="text-2xl font-mono font-bold text-white">
                            {formatTime(elapsedSeconds)}
                        </div>
                        {task.ai_estimated_minutes && (
                            <div className="text-xs text-white/70">
                                / {task.ai_estimated_minutes} min est.
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex flex-col gap-2">
                    <button
                        onClick={handlePause}
                        disabled={loading}
                        className="p-2 bg-white/20 hover:bg-white/30 rounded-lg text-white transition-colors disabled:opacity-50"
                        title="Pause"
                    >
                        <Pause className="w-5 h-5" />
                    </button>
                    <button
                        onClick={handleComplete}
                        disabled={loading}
                        className="p-2 bg-green-600 hover:bg-green-700 rounded-lg text-white transition-colors disabled:opacity-50"
                        title="Complete"
                    >
                        <Check className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
    )
}
