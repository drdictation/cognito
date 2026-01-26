'use client'

import { useState, useEffect } from 'react'
import { Clock, CheckCircle, Target } from 'lucide-react'
import { getWeeklyStats } from '@/lib/actions/time-tracking'

export default function CalendarStats() {
    const [stats, setStats] = useState({
        totalMinutes: 0,
        tasksCompleted: 0,
        avgAccuracy: 0
    })
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        loadStats()
    }, [])

    async function loadStats() {
        try {
            const data = await getWeeklyStats()
            setStats(data)
        } catch (error) {
            console.error('Error loading stats:', error)
        } finally {
            setLoading(false)
        }
    }

    function formatHours(minutes: number): string {
        const hours = Math.floor(minutes / 60)
        const mins = minutes % 60
        if (hours === 0) return `${mins}m`
        if (mins === 0) return `${hours}h`
        return `${hours}h ${mins}m`
    }

    if (loading) {
        return (
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
                <div className="text-center text-slate-400">Loading stats...</div>
            </div>
        )
    }

    return (
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <h3 className="text-lg font-bold text-white mb-4">📊 This Week</h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Total Hours */}
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/20 rounded-lg">
                            <Clock className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-white">
                                {formatHours(stats.totalMinutes)}
                            </div>
                            <div className="text-xs text-slate-400">Total Focused Time</div>
                        </div>
                    </div>
                </div>

                {/* Tasks Completed */}
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-500/20 rounded-lg">
                            <CheckCircle className="w-5 h-5 text-green-400" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-white">
                                {stats.tasksCompleted}
                            </div>
                            <div className="text-xs text-slate-400">Tasks Completed</div>
                        </div>
                    </div>
                </div>

                {/* AI Accuracy */}
                <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-500/20 rounded-lg">
                            <Target className="w-5 h-5 text-purple-400" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-white">
                                {stats.avgAccuracy}%
                            </div>
                            <div className="text-xs text-slate-400">AI Accuracy</div>
                        </div>
                    </div>
                </div>
            </div>

            {stats.avgAccuracy > 0 && (
                <div className="mt-4 p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
                    <p className="text-xs text-purple-300">
                        {stats.avgAccuracy > 100
                            ? `Tasks are taking ${stats.avgAccuracy - 100}% longer than estimated. AI is learning to adjust.`
                            : stats.avgAccuracy < 100
                                ? `Tasks are completing ${100 - stats.avgAccuracy}% faster than estimated. Great efficiency!`
                                : 'Perfect time estimates! AI accuracy is spot on.'}
                    </p>
                </div>
            )}
        </div>
    )
}
