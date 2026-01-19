'use client'

import { useState, useEffect } from 'react'
import { InboxTask, Priority, Domain, DetectedEventRow } from '@/lib/types/database'
import { updateTaskStatus, tweakTask } from '@/lib/actions/tasks'
import { getDetectedEventsForTask } from '@/lib/actions/calendar-events'
import {
    Check,
    X,
    Clock,
    Edit3,
    ChevronDown,
    ChevronUp,
    Mail,
    Timer,
    Lightbulb,
    Plus,
    Minus,
    Calendar as CalendarIcon,
    SlidersHorizontal,
    AlertCircle
} from 'lucide-react'
import { toast } from 'sonner'
import { DraftEditor } from './DraftEditor'
import { CalendarEventCard } from './CalendarEventCard'
import { DeadlinePicker } from './DeadlinePicker'
import { SessionsSuggestion } from './SessionsSuggestion'

interface TaskCardProps {
    task: InboxTask
    index: number
}

const priorityConfig: Record<Priority, { label: string; class: string }> = {
    Critical: { label: 'Critical', class: 'priority-critical' },
    High: { label: 'High', class: 'priority-high' },
    Normal: { label: 'Normal', class: 'priority-normal' },
    Low: { label: 'Low', class: 'priority-low' },
}

const domainConfig: Record<Domain, { label: string; class: string; icon: string }> = {
    Clinical: { label: 'Clinical', class: 'domain-clinical', icon: '🏥' },
    Research: { label: 'Research', class: 'domain-research', icon: '🔬' },
    Admin: { label: 'Admin', class: 'domain-admin', icon: '📋' },
    Home: { label: 'Home', class: 'domain-home', icon: '🏠' },
    Hobby: { label: 'Hobby', class: 'domain-hobby', icon: '🚀' },
}

export function TaskCard({ task, index }: TaskCardProps) {
    if (typeof window !== 'undefined') {
        console.log(`TaskCard ${task.id}:`, {
            hasOriginalContent: !!task.original_content,
            contentLength: task.original_content?.length,
            originalContentPreview: task.original_content?.substring(0, 50)
        })
    }
    const [isExpanded, setIsExpanded] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [isTweaking, setIsTweaking] = useState(false)
    const [showDraftEditor, setShowDraftEditor] = useState(
        !!(task.draft_response || task.is_simple_response)
    )
    const [tweakUpdates, setTweakUpdates] = useState<{ priority?: Priority; domain?: Domain; estimatedMinutes?: number }>({})
    const [detectedEvents, setDetectedEvents] = useState<DetectedEventRow[]>([])
    const [isDeadlinePickerOpen, setIsDeadlinePickerOpen] = useState(false)
    const [deadline, setDeadline] = useState<string | null>(task.user_deadline || task.deadline || task.ai_assessment?.inferred_deadline || null)
    const [showChunking, setShowChunking] = useState(!!task.ai_assessment?.multi_session)


    const priority = task.ai_priority || 'Normal'
    const domain = task.ai_domain || 'Admin'

    // Load detected calendar events
    useEffect(() => {
        async function loadDetectedEvents() {
            const events = await getDetectedEventsForTask(task.id)
            setDetectedEvents(events)
        }
        loadDetectedEvents()
    }, [task.id])

    async function handleAction(action: 'approve' | 'reject' | 'snooze') {
        setIsLoading(true)
        try {
            const status = action === 'approve' ? 'approved'
                : action === 'reject' ? 'rejected'
                    : 'snoozed'

            // For snooze, set to tomorrow 9 AM
            let snoozedUntil: string | undefined
            if (action === 'snooze') {
                const tomorrow = new Date()
                tomorrow.setDate(tomorrow.getDate() + 1)
                tomorrow.setHours(9, 0, 0, 0)
                snoozedUntil = tomorrow.toISOString()
            }

            const result = await updateTaskStatus(task.id, status, snoozedUntil)

            if (result.success) {
                toast.success(`Task ${action}ed successfully`)
            } else {
                toast.error(result.error || 'Failed to update task')
            }
        } catch (error) {
            toast.error('An error occurred')
            console.error(error)
        } finally {
            setIsLoading(false)
        }
    }

    async function handleTweak() {
        if (!tweakUpdates.priority && !tweakUpdates.domain && tweakUpdates.estimatedMinutes === undefined) {
            setIsTweaking(false)
            return
        }

        setIsLoading(true)
        try {
            const updates: { priority?: Priority; domain?: Domain; estimatedMinutes?: number } = {}
            if (tweakUpdates.priority) updates.priority = tweakUpdates.priority
            if (tweakUpdates.domain) updates.domain = tweakUpdates.domain
            if (tweakUpdates.estimatedMinutes !== undefined) updates.estimatedMinutes = tweakUpdates.estimatedMinutes

            const result = await tweakTask(task.id, updates, task)

            if (result.success) {
                toast.success('Task updated and logged for learning')
                setIsTweaking(false)
                setTweakUpdates({})
            } else {
                toast.error(result.error || 'Failed to update task')
            }
        } catch (error) {
            toast.error('An error occurred')
            console.error(error)
        } finally {
            setIsLoading(false)
        }
    }

    const staggerClass = `stagger-${Math.min(index + 1, 6)}`

    return (
        <div
            className={`glass-card card-hover animate-fade-in opacity-0 ${staggerClass}`}
        >
            {/* Header */}
            <div className="p-4 md:p-5">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                        {/* Badges */}
                        <div className="flex flex-wrap gap-2 mb-3">
                            <span className={`px-2.5 py-1 text-xs font-bold rounded-full text-white ${priorityConfig[priority].class}`}>
                                {priorityConfig[priority].label}
                            </span>
                            <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${domainConfig[domain].class}`}>
                                {domainConfig[domain].icon} {domainConfig[domain].label}
                            </span>
                            {task.model_used && (
                                <span className={`px-2.5 py-1 text-xs font-medium rounded-full flex items-center gap-1 border ${task.model_used.includes('gemini')
                                    ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                                    : 'bg-purple-500/10 text-purple-500 border-purple-500/20'
                                    }`}>
                                    <Lightbulb size={12} />
                                    {(() => {
                                        const m = task.model_used;
                                        if (m.includes('gemini')) return 'Gemini Flash Lite';
                                        if (m.includes('gpt-oss-20b')) return 'GPT 20b';
                                        if (m.includes('llama-4-scout')) return 'Llama 4 Scout';
                                        if (m.includes('llama-4-maverick')) return 'Llama 4 Maverick';
                                        if (m.includes('gpt-oss-120b')) return 'GPT 120b';
                                        return m.split('/').pop() || m; // Fallback
                                    })()}
                                </span>
                            )}
                            {task.ai_estimated_minutes && (
                                <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-secondary text-muted-foreground flex items-center gap-1">
                                    <Timer size={12} />
                                    {task.ai_estimated_minutes}m
                                </span>
                            )}
                            {(task.user_deadline || task.deadline) && (
                                <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-orange-500/10 text-orange-600 border border-orange-500/20 flex items-center gap-1">
                                    <CalendarIcon size={12} />
                                    {new Date(task.user_deadline || task.deadline!).toLocaleDateString('en-AU', {
                                        month: 'short',
                                        day: 'numeric'
                                    })}
                                    {task.user_deadline && " (User)"}
                                </span>
                            )}
                            {detectedEvents.length > 0 && (
                                <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20 flex items-center gap-1">
                                    <CalendarIcon size={12} />
                                    {detectedEvents.length} event{detectedEvents.length > 1 ? 's' : ''}
                                </span>
                            )}
                        </div>

                        {/* Subject */}
                        <h3 className="text-base md:text-lg font-semibold text-foreground mb-1 truncate">
                            {task.subject || 'No Subject'}
                        </h3>

                        {/* Sender */}
                        <p className="text-sm text-muted-foreground flex items-center gap-1.5 truncate">
                            <Mail size={14} />
                            {task.real_sender}
                        </p>
                    </div>

                    {/* Expand Toggle */}
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="p-2 rounded-lg hover:bg-accent transition-colors flex-shrink-0"
                        aria-label={isExpanded ? 'Collapse' : 'Expand'}
                    >
                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </button>
                </div>

                {/* Summary */}
                <div className="mt-3 p-3 rounded-lg bg-secondary/50">
                    <p className="text-sm text-foreground/90">
                        {task.ai_summary || 'No summary available'}
                    </p>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                    <div className="mt-4 space-y-4 animate-fade-in">
                        {/* Reasoning */}
                        {task.ai_assessment?.reasoning && (
                            <div className="p-3 rounded-lg bg-accent/50 border border-border">
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                    AI Reasoning
                                </h4>
                                <p className="text-sm text-foreground/80">
                                    {task.ai_assessment.reasoning}
                                </p>
                            </div>
                        )}

                        {/* Suggested Action */}
                        {task.ai_suggested_action && (
                            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                                <h4 className="text-xs font-semibold text-primary uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                    <Lightbulb size={14} />
                                    Suggested Action
                                </h4>
                                <p className="text-sm text-foreground/90">
                                    {task.ai_suggested_action}
                                </p>
                            </div>
                        )}

                        {/* Multi-Session Chunking Suggestion */}
                        {showChunking && task.ai_assessment?.multi_session && (
                            <SessionsSuggestion
                                suggestion={task.ai_assessment.multi_session}
                                taskId={task.id}
                                deadline={deadline ? new Date(deadline) : undefined}
                                onAccept={() => setShowChunking(false)}
                                onReject={() => setShowChunking(false)}
                            />
                        )}

                        {/* Deadline Control */}
                        <div className="flex flex-wrap items-center gap-3 p-3 bg-blue-50/50 rounded-lg border border-blue-100/50">
                            <div className="flex items-center gap-2 text-sm text-gray-700">
                                <CalendarIcon className="w-4 h-4 text-blue-600" />
                                <span className="font-medium">Deadline:</span>
                                {deadline ? (
                                    <span className={task.user_deadline ? "text-emerald-700 font-medium" : "text-gray-600"}>
                                        {new Date(deadline).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                                        {task.user_deadline && " (User Set)"}
                                    </span>
                                ) : (
                                    <span className="text-gray-400 italic">None set</span>
                                )}
                            </div>
                            <button
                                onClick={() => setIsDeadlinePickerOpen(true)}
                                className="text-xs bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 px-2 py-1 rounded shadow-sm transition-colors"
                            >
                                Edit
                            </button>
                        </div>

                        {isDeadlinePickerOpen && (
                            <div className="mb-4">
                                <DeadlinePicker
                                    initialDate={deadline ? new Date(deadline) : undefined}
                                    onSave={async (date) => {
                                        setIsDeadlinePickerOpen(false)
                                        // Optimistic update
                                        setDeadline(date.toISOString())
                                        // Server action
                                        const { updateTaskDeadline } = await import('@/lib/actions/tasks')
                                        await updateTaskDeadline(task.id, date.toISOString())
                                        toast.success('Deadline updated')
                                    }}
                                    onCancel={() => setIsDeadlinePickerOpen(false)}
                                />
                            </div>
                        )}

                        {/* Detected Calendar Events */}
                        {detectedEvents.length > 0 && (
                            <div>
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                                    <CalendarIcon size={14} />
                                    Detected Calendar Events
                                </h4>
                                <div className="space-y-2">
                                    {detectedEvents.map(event => (
                                        <CalendarEventCard key={event.id} event={event} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Original Email Content */}
                        {task.original_content && (
                            <div className="mt-4 border-t border-border pt-4">
                                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide list-none mb-3">
                                    <Mail size={14} />
                                    Original Email Content
                                </div>
                                <div className="p-3 rounded-lg bg-muted/30 border border-border">
                                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed max-h-[400px] overflow-y-auto">
                                        {task.original_content}
                                    </pre>
                                </div>
                            </div>
                        )}

                        {/* Phase 5: Intelligent Draft Editor */}
                        {(showDraftEditor || task.draft_response || task.is_simple_response) && (
                            <div className="animate-slide-in-down">
                                <DraftEditor task={task} />
                            </div>
                        )}

                        {/* Tweak Controls */}
                        {isTweaking && (
                            <div className="p-4 rounded-lg bg-secondary border border-border space-y-4 animate-slide-in-right">
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Change Priority</label>
                                    <div className="flex flex-wrap gap-2">
                                        {(Object.keys(priorityConfig) as Priority[]).map((p) => {
                                            const isSelected = tweakUpdates.priority === p
                                            const isCurrentValue = !tweakUpdates.priority && task.ai_priority === p
                                            return (
                                                <button
                                                    key={p}
                                                    onClick={() => setTweakUpdates(prev => ({ ...prev, priority: p }))}
                                                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all duration-150 active:scale-95 ${isSelected
                                                        ? 'bg-primary border-primary text-primary-foreground ring-2 ring-primary/30 shadow-md'
                                                        : isCurrentValue
                                                            ? 'bg-primary/10 border-primary/50 text-primary'
                                                            : 'bg-card border-border text-muted-foreground hover:bg-secondary/80 hover:border-primary/30'
                                                        }`}
                                                >
                                                    {isSelected && <Check size={12} className="inline mr-1" />}
                                                    {p}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Change Domain</label>
                                    <div className="flex flex-wrap gap-2">
                                        {(Object.keys(domainConfig) as Domain[]).map((d) => {
                                            const isSelected = tweakUpdates.domain === d
                                            const isCurrentValue = !tweakUpdates.domain && task.ai_domain === d
                                            return (
                                                <button
                                                    key={d}
                                                    onClick={() => setTweakUpdates(prev => ({ ...prev, domain: d }))}
                                                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all duration-150 active:scale-95 ${isSelected
                                                        ? 'bg-primary border-primary text-primary-foreground ring-2 ring-primary/30 shadow-md'
                                                        : isCurrentValue
                                                            ? 'bg-primary/10 border-primary/50 text-primary'
                                                            : 'bg-card border-border text-muted-foreground hover:bg-secondary/80 hover:border-primary/30'
                                                        }`}
                                                >
                                                    {isSelected && <Check size={12} className="inline mr-1" />}
                                                    {domainConfig[d].icon} {d}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>

                                {/* Estimated Time Control */}
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                                        <Timer size={14} />
                                        Estimated Time
                                    </label>
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-1 bg-card rounded-lg border border-border p-1">
                                            <button
                                                onClick={() => {
                                                    const current = tweakUpdates.estimatedMinutes ?? task.ai_estimated_minutes ?? 30
                                                    setTweakUpdates(prev => ({ ...prev, estimatedMinutes: Math.max(5, current - 5) }))
                                                }}
                                                className="p-1.5 rounded hover:bg-secondary/80 transition-colors active:scale-95"
                                                aria-label="Decrease time"
                                            >
                                                <Minus size={16} />
                                            </button>
                                            <span className="min-w-[4rem] text-center font-medium text-sm">
                                                {tweakUpdates.estimatedMinutes ?? task.ai_estimated_minutes ?? 30} min
                                            </span>
                                            <button
                                                onClick={() => {
                                                    const current = tweakUpdates.estimatedMinutes ?? task.ai_estimated_minutes ?? 30
                                                    setTweakUpdates(prev => ({ ...prev, estimatedMinutes: Math.min(240, current + 5) }))
                                                }}
                                                className="p-1.5 rounded hover:bg-secondary/80 transition-colors active:scale-95"
                                                aria-label="Increase time"
                                            >
                                                <Plus size={16} />
                                            </button>
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                            {[5, 15, 30, 45, 60, 90, 120].map((mins) => {
                                                const isSelected = tweakUpdates.estimatedMinutes === mins
                                                const isCurrentValue = tweakUpdates.estimatedMinutes === undefined && task.ai_estimated_minutes === mins
                                                return (
                                                    <button
                                                        key={mins}
                                                        onClick={() => setTweakUpdates(prev => ({ ...prev, estimatedMinutes: mins }))}
                                                        className={`px-2 py-1 rounded text-xs font-medium border transition-all duration-150 active:scale-95 ${isSelected
                                                            ? 'bg-primary border-primary text-primary-foreground shadow-sm'
                                                            : isCurrentValue
                                                                ? 'bg-primary/10 border-primary/50 text-primary'
                                                                : 'bg-card border-border text-muted-foreground hover:bg-secondary/80'
                                                            }`}
                                                    >
                                                        {mins}m
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {/* Tweak Actions */}
                                <div className="flex gap-2 mt-4">
                                    <button
                                        onClick={handleTweak}
                                        disabled={isLoading || (!tweakUpdates.priority && !tweakUpdates.domain && tweakUpdates.estimatedMinutes === undefined)}
                                        className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Apply Changes
                                    </button>
                                    <button
                                        onClick={() => {
                                            setIsTweaking(false)
                                            setTweakUpdates({})
                                        }}
                                        className="btn-ghost text-sm"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="px-4 md:px-5 py-3 border-t border-border/50 flex flex-wrap gap-2 justify-end">
                <button
                    onClick={() => handleAction('reject')}
                    disabled={isLoading}
                    className="btn-ghost text-sm flex items-center gap-1.5 text-destructive hover:bg-destructive/10"
                >
                    <X size={16} />
                    <span className="hidden sm:inline">Reject</span>
                </button>

                <button
                    onClick={() => handleAction('snooze')}
                    disabled={isLoading}
                    className="btn-ghost text-sm flex items-center gap-1.5"
                >
                    <Clock size={16} />
                    <span className="hidden sm:inline">Snooze</span>
                </button>

                <button
                    onClick={() => {
                        if (!showDraftEditor) setIsExpanded(true)
                        setShowDraftEditor(!showDraftEditor)
                    }}
                    disabled={isLoading}
                    className={`btn-ghost text-sm flex items-center gap-1.5 ${showDraftEditor ? 'bg-accent' : ''}`}
                >
                    <Edit3 size={16} />
                    <span className="hidden sm:inline">Draft</span>
                </button>

                <button
                    onClick={() => {
                        if (!isTweaking) setIsExpanded(true)
                        setIsTweaking(!isTweaking)
                    }}
                    disabled={isLoading}
                    className={`btn-ghost text-sm flex items-center gap-1.5 ${isTweaking ? 'bg-accent' : ''}`}
                >
                    <SlidersHorizontal size={16} />
                    <span className="hidden sm:inline">Tweak</span>
                </button>

                <button
                    onClick={() => handleAction('approve')}
                    disabled={isLoading}
                    className="flex-1 btn-primary py-2 text-sm font-medium flex items-center justify-center gap-2"
                >
                    <Check size={16} />
                    <span>Approve</span>
                </button>
            </div>
        </div>
    )
}
