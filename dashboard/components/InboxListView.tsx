'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, X, Timer } from 'lucide-react'
import { useTasks } from '@/contexts/TasksContext'
import { InboxTask, Domain, Priority } from '@/lib/types/database'
import { updateTaskStatus } from '@/lib/actions/tasks'
import { TaskCard } from '@/components/TaskCard'

const priorityOrder: Record<Priority, number> = {
    Critical: 0,
    High: 1,
    Normal: 2,
    Low: 3,
}

const domainOrder: Domain[] = ['Clinical', 'Research', 'Admin', 'Home', 'Hobby']

const priorityBadgeClass: Record<Priority, string> = {
    Critical: 'priority-critical',
    High: 'priority-high',
    Normal: 'priority-normal',
    Low: 'priority-low',
}

const domainBadgeClass: Record<Domain, string> = {
    Clinical: 'domain-clinical',
    Research: 'domain-research',
    Admin: 'domain-admin',
    Home: 'domain-home',
    Hobby: 'domain-hobby',
}

function safeDomain(task: InboxTask): Domain {
    return (task.ai_domain && task.ai_domain in domainBadgeClass) ? task.ai_domain : 'Admin'
}

function safePriority(task: InboxTask): Priority {
    return (task.ai_priority && task.ai_priority in priorityBadgeClass) ? task.ai_priority : 'Normal'
}

function formatReceivedAt(task: InboxTask): string {
    const raw = task.received_at || task.created_at
    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
}

export function InboxListView() {
    const router = useRouter()
    const { tasks, removeTask } = useTasks()
    const [activeDomain, setActiveDomain] = useState<Domain | 'all'>('all')
    const [selectedId, setSelectedId] = useState<string | null>(tasks[0]?.id ?? null)

    const filteredAndSorted = useMemo(() => {
        const filtered = activeDomain === 'all'
            ? tasks
            : tasks.filter(t => safeDomain(t) === activeDomain)

        return [...filtered].sort((a, b) => {
            const ap = priorityOrder[safePriority(a)] ?? 9
            const bp = priorityOrder[safePriority(b)] ?? 9
            if (ap !== bp) return ap - bp
            const at = new Date(a.received_at || a.created_at).getTime()
            const bt = new Date(b.received_at || b.created_at).getTime()
            return bt - at
        })
    }, [tasks, activeDomain])

    const effectiveSelectedId = useMemo(() => {
        if (selectedId && tasks.some(t => t.id === selectedId)) return selectedId
        return filteredAndSorted[0]?.id ?? null
    }, [selectedId, tasks, filteredAndSorted])

    const selectedTask = useMemo(
        () => tasks.find(t => t.id === effectiveSelectedId) || null,
        [tasks, effectiveSelectedId]
    )

    async function quickAction(task: InboxTask, action: 'approved' | 'rejected') {
        removeTask(task.id)
        toast.success(action === 'approved' ? 'Approved' : 'Rejected')

        try {
            const result = await updateTaskStatus(task.id, action)
            if (!result.success) {
                toast.error(result.error || 'Update failed')
                router.refresh()
                return
            }
            if (result.doubleBookWarning) {
                toast.warning(result.doubleBookWarning)
            }
            if (result.trelloUrl) {
                toast.success('Trello card created')
            }
        } catch (e: unknown) {
            console.error(e)
            toast.error(e instanceof Error ? e.message : 'Update failed')
            router.refresh()
        }
    }

    const totalTasks = tasks.length
    const totalMinutes = tasks.reduce((acc, t) => acc + (t.ai_estimated_minutes || 0), 0)

    const domainCounts = useMemo(() => {
        const counts: Record<Domain, number> = {
            Clinical: 0,
            Research: 0,
            Admin: 0,
            Home: 0,
            Hobby: 0,
        }
        for (const t of tasks) counts[safeDomain(t)] += 1
        return counts
    }, [tasks])

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[420px,1fr] gap-4">
            {/* Inbox List */}
            <section className="glass-card p-3 lg:sticky lg:top-6 h-fit">
                <div className="flex items-center justify-between gap-3 px-1">
                    <div>
                        <h2 className="text-sm font-semibold text-foreground">Inbox</h2>
                        <p className="text-xs text-muted-foreground">
                            {totalTasks} pending • {totalMinutes}m
                        </p>
                    </div>
                </div>

                {/* Domain Filters */}
                <div className="mt-3 flex flex-wrap gap-2">
                    <button
                        onClick={() => setActiveDomain('all')}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${activeDomain === 'all'
                            ? 'bg-primary text-white'
                            : 'bg-secondary text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        All ({totalTasks})
                    </button>
                    {domainOrder.map(domain => {
                        const count = domainCounts[domain] || 0
                        if (count === 0) return null
                        return (
                            <button
                                key={domain}
                                onClick={() => setActiveDomain(domain)}
                                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${activeDomain === domain
                                    ? `border border-border/50 ${domainBadgeClass[domain]}`
                                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                                    }`}
                            >
                                {domain} ({count})
                            </button>
                        )
                    })}
                </div>

                <div className="mt-3 max-h-[70vh] overflow-y-auto rounded-lg border border-border/50 bg-background/30">
                    {filteredAndSorted.length === 0 ? (
                        <div className="p-6 text-sm text-muted-foreground">
                            No pending items in this filter.
                        </div>
                    ) : (
                        <div className="divide-y divide-border/50">
                            {filteredAndSorted.map((task) => {
                                const isSelected = task.id === selectedId
                                const priority = safePriority(task)
                                const domain = safeDomain(task)

                                return (
                                    <div
                                        key={task.id}
                                        className={`group p-3 cursor-pointer transition-colors ${isSelected ? 'bg-secondary/60' : 'hover:bg-secondary/30'}`}
                                        onClick={() => setSelectedId(task.id)}
                                        role="button"
                                        tabIndex={0}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="flex flex-col items-center gap-2 pt-0.5">
                                                <span className={`h-2.5 w-2.5 rounded-full ${priority === 'Critical'
                                                    ? 'bg-red-400'
                                                    : priority === 'High'
                                                        ? 'bg-orange-400'
                                                        : priority === 'Normal'
                                                            ? 'bg-blue-400'
                                                            : 'bg-gray-400'
                                                    }`}
                                                />
                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-start justify-between gap-2">
                                                    <p className="text-sm font-semibold text-foreground truncate">
                                                        {task.subject || 'No subject'}
                                                    </p>
                                                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                                                        {formatReceivedAt(task)}
                                                    </span>
                                                </div>

                                                <p className="text-xs text-muted-foreground truncate">
                                                    {task.real_sender}
                                                </p>

                                                {task.ai_summary && (
                                                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                                        {task.ai_summary}
                                                    </p>
                                                )}

                                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                                    <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full text-white ${priorityBadgeClass[priority]}`}>
                                                        {priority}
                                                    </span>
                                                    <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full ${domainBadgeClass[domain]}`}>
                                                        {domain}
                                                    </span>
                                                    {task.ai_estimated_minutes ? (
                                                        <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-secondary text-muted-foreground inline-flex items-center gap-1">
                                                            <Timer size={12} />
                                                            {task.ai_estimated_minutes}m
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </div>

                                            <div className="flex flex-col gap-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                                                <button
                                                    className="btn-ghost p-2 rounded-md hover:bg-green-500/10"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        quickAction(task, 'approved')
                                                    }}
                                                    aria-label="Approve"
                                                    title="Approve"
                                                >
                                                    <Check size={18} className="text-green-400" />
                                                </button>
                                                <button
                                                    className="btn-ghost p-2 rounded-md hover:bg-red-500/10"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        quickAction(task, 'rejected')
                                                    }}
                                                    aria-label="Reject"
                                                    title="Reject"
                                                >
                                                    <X size={18} className="text-red-400" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </section>

            {/* Detail Pane */}
            <section className="min-h-[300px]">
                {selectedTask ? (
                    <TaskCard task={selectedTask} index={0} />
                ) : (
                    <div className="glass-card p-6 text-sm text-muted-foreground">
                        Select an email to review.
                    </div>
                )}
            </section>
        </div>
    )
}
