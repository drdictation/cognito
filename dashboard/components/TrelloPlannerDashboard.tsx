'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
    BrainCircuit,
    CheckSquare,
    Clock3,
    ExternalLink,
    LoaderCircle,
    MoveRight,
    RefreshCcw,
    Sparkles,
    Target,
} from 'lucide-react'
import { confirmPlanAction, enrichInboxCardsAction, generatePlanAction } from '@/lib/actions/trello-planner'
import { PlanFilters, PlannerSnapshot, PlanSuggestion, TrelloCardView } from '@/lib/types/trello-planner'

interface TrelloPlannerDashboardProps {
    snapshot: PlannerSnapshot
    error?: string
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint: string }) {
    return (
        <div className="glass-card p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
            <p className="mt-2 text-3xl font-semibold text-foreground">{value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
        </div>
    )
}

function formatDueDate(date: string | null): string {
    if (!date) return 'No due date'
    const parsed = new Date(date)
    if (Number.isNaN(parsed.getTime())) return date
    return parsed.toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'short',
    })
}

function CardChip({ children }: { children: React.ReactNode }) {
    return (
        <span className="rounded-full border border-border/70 bg-secondary/70 px-2.5 py-1 text-xs text-muted-foreground">
            {children}
        </span>
    )
}

function TaskCard({ card }: { card: TrelloCardView }) {
    return (
        <article className="rounded-2xl border border-border/60 bg-black/10 p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-base font-semibold text-foreground">{card.enrichment?.title || card.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {card.enrichment?.summary || 'Raw Trello card awaiting enrichment.'}
                    </p>
                </div>
                <a
                    href={card.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-border/70 p-2 text-muted-foreground transition hover:text-foreground"
                    aria-label="Open Trello card"
                >
                    <ExternalLink size={16} />
                </a>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
                <CardChip>{card.listName}</CardChip>
                <CardChip>{card.processed ? 'Processed' : 'Needs enrichment'}</CardChip>
                {card.enrichment?.taskType ? <CardChip>{card.enrichment.taskType}</CardChip> : null}
                {card.enrichment?.effort ? <CardChip>{card.enrichment.effort}</CardChip> : null}
                {card.enrichment?.priority ? <CardChip>{card.enrichment.priority}</CardChip> : null}
                <CardChip>{formatDueDate(card.enrichment?.dueDate || card.due)}</CardChip>
            </div>

            {card.enrichment?.nextAction ? (
                <div className="mt-3 rounded-xl bg-secondary/40 p-3 text-sm text-foreground/90">
                    <span className="font-medium text-foreground">Next:</span> {card.enrichment.nextAction}
                </div>
            ) : null}
        </article>
    )
}

export function TrelloPlannerDashboard({ snapshot, error }: TrelloPlannerDashboardProps) {
    const router = useRouter()
    const [isEnriching, startEnriching] = useTransition()
    const [isGeneratingPlan, startGeneratingPlan] = useTransition()
    const [isConfirmingPlan, startConfirmingPlan] = useTransition()
    const [plan, setPlan] = useState<PlanSuggestion | null>(null)
    const [selectedPlanCards, setSelectedPlanCards] = useState<string[]>([])
    const [filters, setFilters] = useState<PlanFilters>({
        mode: 'evening',
        timeBudgetMinutes: 90,
        energy: 'any',
        urgentOnly: false,
        excludeReplies: false,
        deepWorkOnly: false,
    })

    const unenrichedCount = snapshot.inbox.filter((card) => !card.processed).length
    const processedCount = snapshot.inbox.length - unenrichedCount
    const openCount = snapshot.inbox.length + snapshot.today.length + snapshot.thisWeek.length + snapshot.waiting.length + snapshot.later.length

    const previewCards = useMemo(
        () => snapshot.inbox.slice(0, 6),
        [snapshot.inbox],
    )

    function updateFilter<K extends keyof PlanFilters>(key: K, value: PlanFilters[K]) {
        setFilters((current) => ({ ...current, [key]: value }))
    }

    function toggleSelected(cardId: string) {
        setSelectedPlanCards((current) =>
            current.includes(cardId)
                ? current.filter((id) => id !== cardId)
                : [...current, cardId],
        )
    }

    function runEnrichment() {
        startEnriching(async () => {
            const result = await enrichInboxCardsAction(10)
            if (result.success || result.enriched > 0) {
                toast.success(`Enriched ${result.enriched} Inbox card${result.enriched === 1 ? '' : 's'}.`)
            } else {
                toast.error(result.errors[0] || 'Inbox enrichment failed.')
            }

            if (result.errors.length > 0) {
                toast.error(result.errors[0])
            }

            router.refresh()
        })
    }

    function runPlanner() {
        startGeneratingPlan(async () => {
            const result = await generatePlanAction(filters)
            if (!result.success || !result.plan) {
                toast.error(result.error || 'Could not generate a plan.')
                return
            }

            setPlan(result.plan)
            setSelectedPlanCards(result.plan.items.map((item) => item.cardId))
            toast.success(`Generated a ${result.plan.totalMinutes}-minute plan.`)
        })
    }

    function confirmPlan() {
        startConfirmingPlan(async () => {
            const result = await confirmPlanAction(selectedPlanCards)
            if (!result.success) {
                toast.error(result.error || 'Could not move cards into Today.')
                return
            }

            toast.success(`Moved ${result.moved} card${result.moved === 1 ? '' : 's'} into Today.`)
            setPlan(null)
            setSelectedPlanCards([])
            router.refresh()
        })
    }

    return (
        <div className="space-y-6 py-6">
            <section className="glass-card overflow-hidden">
                <div className="border-b border-border/60 bg-[linear-gradient(135deg,rgba(59,130,246,0.16),rgba(16,185,129,0.1))] p-6">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <div className="max-w-3xl">
                            <p className="text-xs uppercase tracking-[0.25em] text-sky-200/80">Trello Planning Layer</p>
                            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
                                Capture in Trello. Enrich in place. Plan before moving work into Today.
                            </h1>
                            <p className="mt-3 text-base text-muted-foreground">
                                Outlook stays the inbox. Trello is the durable task store. Cognito operates after capture by cleaning up Inbox cards and proposing realistic execution plans.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <button
                                onClick={runEnrichment}
                                disabled={isEnriching}
                                className="btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                                {isEnriching ? <LoaderCircle className="animate-spin" size={16} /> : <Sparkles size={16} />}
                                Enrich Inbox
                            </button>
                            <button
                                onClick={() => router.refresh()}
                                className="btn-ghost inline-flex items-center gap-2"
                            >
                                <RefreshCcw size={16} />
                                Refresh
                            </button>
                        </div>
                    </div>
                </div>

                <div className="grid gap-4 p-6 md:grid-cols-4">
                    <StatCard label="Open Cards" value={openCount} hint={`${snapshot.board.name}`} />
                    <StatCard label="Inbox" value={snapshot.inbox.length} hint={`${unenrichedCount} still need enrichment`} />
                    <StatCard label="Today" value={snapshot.today.length} hint="Current execution list" />
                    <StatCard label="Processed" value={processedCount} hint="Inbox cards already marked by Cognito" />
                </div>
            </section>

            {error ? (
                <div className="glass-card border border-red-500/30 p-4 text-sm text-red-200">
                    {error}
                </div>
            ) : null}

            <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
                <section className="space-y-4">
                    <div className="glass-card p-5">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h2 className="text-xl font-semibold text-foreground">Inbox</h2>
                                <p className="text-sm text-muted-foreground">
                                    Newly forwarded task-intent cards land here. Cognito rewrites titles and prepends AI context without touching attachments.
                                </p>
                            </div>
                            <div className="rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground">
                                {snapshot.inbox.length} cards
                            </div>
                        </div>

                        <div className="mt-4 space-y-3">
                            {previewCards.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-border/60 p-6 text-sm text-muted-foreground">
                                    Inbox is empty.
                                </div>
                            ) : (
                                previewCards.map((card) => <TaskCard key={card.id} card={card} />)
                            )}
                        </div>

                        {snapshot.inbox.length > previewCards.length ? (
                            <p className="mt-3 text-sm text-muted-foreground">
                                Showing {previewCards.length} of {snapshot.inbox.length} Inbox cards.
                            </p>
                        ) : null}
                    </div>

                    <div className="glass-card p-5">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h2 className="text-xl font-semibold text-foreground">Today</h2>
                                <p className="text-sm text-muted-foreground">
                                    Cards already committed for execution.
                                </p>
                            </div>
                            <div className="rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground">
                                {snapshot.today.length} cards
                            </div>
                        </div>

                        <div className="mt-4 space-y-3">
                            {snapshot.today.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-border/60 p-6 text-sm text-muted-foreground">
                                    Nothing is in Today yet.
                                </div>
                            ) : (
                                snapshot.today.slice(0, 4).map((card) => <TaskCard key={card.id} card={card} />)
                            )}
                        </div>
                    </div>
                </section>

                <section className="space-y-4">
                    <div className="glass-card p-5">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-xl font-semibold text-foreground">Plan Generator</h2>
                                <p className="text-sm text-muted-foreground">
                                    Build an evening plan or “I have X minutes” shortlist, then confirm the cards you want moved into Today.
                                </p>
                            </div>
                            <BrainCircuit className="text-sky-300" size={22} />
                        </div>

                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                            <label className="space-y-2">
                                <span className="text-sm text-muted-foreground">Mode</span>
                                <select
                                    value={filters.mode}
                                    onChange={(event) => updateFilter('mode', event.target.value as PlanFilters['mode'])}
                                    className="input-premium"
                                >
                                    <option value="evening">Evening plan</option>
                                    <option value="window">I have X minutes</option>
                                </select>
                            </label>

                            <label className="space-y-2">
                                <span className="text-sm text-muted-foreground">Time budget</span>
                                <select
                                    value={filters.timeBudgetMinutes}
                                    onChange={(event) => updateFilter('timeBudgetMinutes', Number(event.target.value))}
                                    className="input-premium"
                                >
                                    <option value={20}>20 min</option>
                                    <option value={40}>40 min</option>
                                    <option value={60}>60 min</option>
                                    <option value={90}>90 min</option>
                                    <option value={120}>120 min</option>
                                </select>
                            </label>

                            <label className="space-y-2">
                                <span className="text-sm text-muted-foreground">Energy</span>
                                <select
                                    value={filters.energy}
                                    onChange={(event) => updateFilter('energy', event.target.value as PlanFilters['energy'])}
                                    className="input-premium"
                                >
                                    <option value="any">Any</option>
                                    <option value="low">Low energy</option>
                                    <option value="high">High energy</option>
                                </select>
                            </label>

                            <div className="space-y-2">
                                <span className="text-sm text-muted-foreground">Filters</span>
                                <div className="grid gap-2 rounded-2xl border border-border/60 bg-black/10 p-3 text-sm">
                                    <label className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={filters.urgentOnly}
                                            onChange={(event) => updateFilter('urgentOnly', event.target.checked)}
                                        />
                                        Urgent only
                                    </label>
                                    <label className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={filters.excludeReplies}
                                            onChange={(event) => updateFilter('excludeReplies', event.target.checked)}
                                        />
                                        Exclude replies
                                    </label>
                                    <label className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={filters.deepWorkOnly}
                                            onChange={(event) => updateFilter('deepWorkOnly', event.target.checked)}
                                        />
                                        Deep work only
                                    </label>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={runPlanner}
                            disabled={isGeneratingPlan}
                            className="btn-success mt-5 inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                            {isGeneratingPlan ? <LoaderCircle className="animate-spin" size={16} /> : <Target size={16} />}
                            Generate Plan
                        </button>
                    </div>

                    <div className="glass-card p-5">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-xl font-semibold text-foreground">Proposed Selection</h2>
                                <p className="text-sm text-muted-foreground">
                                    Review the shortlist, deselect anything you do not want, then move the final selection into Today.
                                </p>
                            </div>
                            <CheckSquare className="text-emerald-300" size={22} />
                        </div>

                        {!plan ? (
                            <div className="mt-4 rounded-2xl border border-dashed border-border/60 p-6 text-sm text-muted-foreground">
                                No plan yet. Generate one from the current Trello state.
                            </div>
                        ) : (
                            <div className="mt-4 space-y-4">
                                <div className="rounded-2xl border border-border/60 bg-black/10 p-4">
                                    <p className="text-sm font-medium text-foreground">{plan.summary}</p>
                                    <p className="mt-2 text-sm text-muted-foreground">{plan.rationale}</p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <CardChip>{plan.totalMinutes} min selected</CardChip>
                                        <CardChip>{plan.items.length} cards</CardChip>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    {plan.items.map((item) => {
                                        const checked = selectedPlanCards.includes(item.cardId)
                                        return (
                                            <label
                                                key={item.cardId}
                                                className="flex gap-3 rounded-2xl border border-border/60 bg-black/10 p-4"
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="mt-1"
                                                    checked={checked}
                                                    onChange={() => toggleSelected(item.cardId)}
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div>
                                                            <p className="font-medium text-foreground">{item.title}</p>
                                                            <p className="mt-1 text-sm text-muted-foreground">{item.nextAction}</p>
                                                        </div>
                                                        <a
                                                            href={item.url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="rounded-lg border border-border/70 p-2 text-muted-foreground transition hover:text-foreground"
                                                        >
                                                            <ExternalLink size={16} />
                                                        </a>
                                                    </div>

                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                        <CardChip>{item.taskType}</CardChip>
                                                        <CardChip>{item.effort}</CardChip>
                                                        <CardChip>{item.priority}</CardChip>
                                                        <CardChip>{item.listName}</CardChip>
                                                        <CardChip>{formatDueDate(item.dueDate)}</CardChip>
                                                    </div>

                                                    <p className="mt-3 text-sm text-muted-foreground">
                                                        Why this made the cut: {item.why}
                                                    </p>
                                                </div>
                                            </label>
                                        )
                                    })}
                                </div>

                                <button
                                    onClick={confirmPlan}
                                    disabled={isConfirmingPlan || selectedPlanCards.length === 0}
                                    className="btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                    {isConfirmingPlan ? <LoaderCircle className="animate-spin" size={16} /> : <MoveRight size={16} />}
                                    Move Selected Into Today
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="glass-card p-5">
                        <div className="flex items-center gap-3">
                            <Clock3 className="text-amber-300" size={20} />
                            <div>
                                <h2 className="text-lg font-semibold text-foreground">Design Guardrails</h2>
                                <p className="text-sm text-muted-foreground">
                                    Capture stays native to Trello, enrichment is additive, and moving work into Today always requires confirmation.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    )
}
