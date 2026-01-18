'use client'

import { InboxTask, Domain, Priority, CognitoEventRow } from '@/lib/types/database'
import { TaskCard } from './TaskCard'
import { BumpNotificationBanner } from './BumpNotification'
import { getBumpHistory } from '@/lib/actions/calendar-events'
import {
    Stethoscope,
    FlaskConical,
    FileText,
    Home,
    Rocket,
    Inbox
} from 'lucide-react'
import { useState, useEffect } from 'react'

interface BriefingViewProps {
    tasks: InboxTask[]
}

const domainIcons: Record<Domain, React.ReactNode> = {
    Clinical: <Stethoscope size={20} />,
    Research: <FlaskConical size={20} />,
    Admin: <FileText size={20} />,
    Home: <Home size={20} />,
    Hobby: <Rocket size={20} />,
}

const domainColors: Record<Domain, string> = {
    Clinical: 'from-red-500/20 to-red-500/5 border-red-500/30',
    Research: 'from-violet-500/20 to-violet-500/5 border-violet-500/30',
    Admin: 'from-cyan-500/20 to-cyan-500/5 border-cyan-500/30',
    Home: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30',
    Hobby: 'from-amber-500/20 to-amber-500/5 border-amber-500/30',
}

const priorityOrder: Record<Priority, number> = {
    Critical: 0,
    High: 1,
    Normal: 2,
    Low: 3,
}

const domainOrder: Domain[] = ['Clinical', 'Research', 'Admin', 'Home', 'Hobby']

export function BriefingView({ tasks }: BriefingViewProps) {
    const [activeFilter, setActiveFilter] = useState<Domain | 'all'>('all')
    const [bumpedEvents, setBumpedEvents] = useState<CognitoEventRow[]>([])

    // Load bump history
    useEffect(() => {
        async function loadBumpHistory() {
            const history = await getBumpHistory()
            setBumpedEvents(history)
        }
        loadBumpHistory()
    }, [])

    // Group tasks by domain
    const tasksByDomain = tasks.reduce((acc, task) => {
        const domain = task.ai_domain || 'Admin'
        if (!acc[domain]) acc[domain] = []
        acc[domain].push(task)
        return acc
    }, {} as Record<Domain, InboxTask[]>)

    // Sort each domain's tasks by priority
    Object.values(tasksByDomain).forEach(domainTasks => {
        domainTasks.sort((a, b) => {
            const aPriority = priorityOrder[a.ai_priority as Priority] ?? 4
            const bPriority = priorityOrder[b.ai_priority as Priority] ?? 4
            return aPriority - bPriority
        })
    })

    // Get filtered domains
    const filteredDomains = activeFilter === 'all'
        ? domainOrder.filter(d => tasksByDomain[d]?.length > 0)
        : [activeFilter].filter(d => tasksByDomain[d]?.length > 0)

    // Calculate stats
    const totalTasks = tasks.length
    const totalMinutes = tasks.reduce((acc, t) => acc + (t.ai_estimated_minutes || 0), 0)
    const criticalCount = tasks.filter(t => t.ai_priority === 'Critical').length

    if (tasks.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
                <div className="glass-card p-8 text-center max-w-md">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 flex items-center justify-center">
                        <Inbox size={32} className="text-emerald-400" />
                    </div>
                    <h2 className="text-xl font-bold text-foreground mb-2">
                        All Clear! 🎉
                    </h2>
                    <p className="text-muted-foreground">
                        No pending tasks in your briefing. Enjoy your peace of mind.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Stats Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass-card p-4 animate-fade-in stagger-1 opacity-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Tasks</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{totalTasks}</p>
                </div>
                <div className="glass-card p-4 animate-fade-in stagger-2 opacity-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Est. Time</p>
                    <p className="text-2xl font-bold text-foreground mt-1">
                        {totalMinutes >= 60
                            ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`
                            : `${totalMinutes}m`
                        }
                    </p>
                </div>
                <div className="glass-card p-4 animate-fade-in stagger-3 opacity-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Critical</p>
                    <p className={`text-2xl font-bold mt-1 ${criticalCount > 0 ? 'text-red-400' : 'text-foreground'}`}>
                        {criticalCount}
                    </p>
                </div>
                <div className="glass-card p-4 animate-fade-in stagger-4 opacity-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Domains</p>
                    <p className="text-2xl font-bold text-foreground mt-1">
                        {Object.keys(tasksByDomain).length}
                    </p>
                </div>
            </div>

            {/* Bump Notifications Banner */}
            {bumpedEvents.length > 0 && (
                <div className="animate-fade-in stagger-5 opacity-0">
                    <BumpNotificationBanner bumpedEvents={bumpedEvents} />
                </div>
            )}

            {/* Filter Pills */}
            <div className="flex flex-wrap gap-2 animate-fade-in stagger-5 opacity-0">
                <button
                    onClick={() => setActiveFilter('all')}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${activeFilter === 'all'
                        ? 'bg-primary text-white'
                        : 'bg-secondary text-muted-foreground hover:text-foreground'
                        }`}
                >
                    All ({totalTasks})
                </button>
                {domainOrder.map(domain => {
                    const count = tasksByDomain[domain]?.length || 0
                    if (count === 0) return null
                    return (
                        <button
                            key={domain}
                            onClick={() => setActiveFilter(domain)}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${activeFilter === domain
                                ? `bg-gradient-to-r ${domainColors[domain]} border`
                                : 'bg-secondary text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            {domainIcons[domain]}
                            {domain} ({count})
                        </button>
                    )
                })}
            </div>

            {/* Task Groups */}
            {filteredDomains.map((domain, domainIndex) => (
                <div
                    key={domain}
                    className={`animate-fade-in opacity-0`}
                    style={{ animationDelay: `${(domainIndex + 6) * 0.05}s` }}
                >
                    {/* Domain Header */}
                    <div className={`flex items-center gap-3 mb-4 p-3 rounded-lg bg-gradient-to-r ${domainColors[domain]} border`}>
                        <div className="p-2 rounded-lg bg-background/50">
                            {domainIcons[domain]}
                        </div>
                        <div className="flex-1">
                            <h2 className="font-bold text-foreground">{domain}</h2>
                            <p className="text-xs text-muted-foreground">
                                {tasksByDomain[domain].length} task{tasksByDomain[domain].length !== 1 ? 's' : ''} •
                                {' '}{tasksByDomain[domain].reduce((a, t) => a + (t.ai_estimated_minutes || 0), 0)}m total
                            </p>
                        </div>
                    </div>

                    {/* Tasks */}
                    <div className="space-y-4 pl-0 md:pl-4">
                        {tasksByDomain[domain].map((task, taskIndex) => (
                            <TaskCard
                                key={task.id}
                                task={task}
                                index={domainIndex * 10 + taskIndex}
                            />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
}
