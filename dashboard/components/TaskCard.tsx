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
    const [tweakUpdates, setTweakUpdates] = useState<{ priority?: Priority; domain?: Domain }>({})
    const [detectedEvents, setDetectedEvents] = useState<DetectedEventRow[]>([])

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
        if (!tweakUpdates.priority && !tweakUpdates.domain) {
            setIsTweaking(false)
            return
        }

        setIsLoading(true)
        try {
            const updates: { priority?: Priority; domain?: Domain } = {}
            if (tweakUpdates.priority) updates.priority = tweakUpdates.priority
            if (tweakUpdates.domain) updates.domain = tweakUpdates.domain

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
                            {task.deadline && (
                                <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-orange-500/10 text-orange-600 border border-orange-500/20 flex items-center gap-1">
                                    <CalendarIcon size={12} />
                                    {new Date(task.deadline).toLocaleDateString('en-AU', {
                                        month: 'short',
                                        day: 'numeric'
                                    })}
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
                                        {(Object.keys(priorityConfig) as Priority[]).map((p) => (
                                            <button
                                                key={p}
                                                onClick={() => setTweakUpdates(prev => ({ ...prev, priority: p }))}
                                                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${(tweakUpdates.priority || task.ai_priority) === p
                                                    ? 'bg-primary/20 border-primary text-primary'
                                                    : 'bg-card border-border text-muted-foreground hover:bg-secondary/80'
                                                    }`}
                                            >
                                                {p}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Change Domain</label>
                                    <div className="flex flex-wrap gap-2">
                                        {(Object.keys(domainConfig) as Domain[]).map((d) => (
                                            <button
                                                key={d}
                                                onClick={() => setTweakUpdates(prev => ({ ...prev, domain: d }))}
                                                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${(tweakUpdates.domain || task.ai_domain) === d
                                                    ? 'bg-primary/20 border-primary text-primary'
                                                    : 'bg-card border-border text-muted-foreground hover:bg-secondary/80'
                                                    }`}
                                            >
                                                {domainConfig[d].icon} {d}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Tweak Actions */}
                                <div className="flex gap-2 mt-4">
                                    <button
                                        onClick={handleTweak}
                                        disabled={isLoading || (!tweakUpdates.priority && !tweakUpdates.domain)}
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
