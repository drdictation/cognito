import {
    PlanFilters,
    PlannerCandidate,
    PlannerSnapshot,
    PlanSuggestion,
    PlanSuggestionItem,
    PlanningPriority,
    TaskType,
    TrelloCardView,
} from '@/lib/types/trello-planner'

const EFFORT_MINUTES: Record<string, number> = {
    '5 min': 5,
    '15 min': 15,
    '30 min': 30,
    '60 min': 60,
    '90+ min': 90,
}

const PRIORITY_SCORE: Record<PlanningPriority, number> = {
    High: 90,
    Medium: 55,
    Low: 25,
}

const TASK_TYPE_SCORE: Record<TaskType, number> = {
    Reply: 18,
    Admin: 14,
    Review: 22,
    'Deep Work': 28,
    Waiting: -40,
    Personal: 10,
}

function daysUntil(dateString: string | null): number | null {
    if (!dateString) return null
    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) return null
    const now = new Date()
    const diff = date.getTime() - now.getTime()
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function effortMinutes(card: TrelloCardView): number {
    return EFFORT_MINUTES[card.enrichment?.effort || '30 min'] || 30
}

function filterEligibleCards(snapshot: PlannerSnapshot, filters: PlanFilters): TrelloCardView[] {
    const candidates = [...snapshot.inbox, ...snapshot.thisWeek, ...snapshot.later]

    return candidates.filter((card) => {
        const type = card.enrichment?.taskType || 'Admin'
        const priority = card.enrichment?.priority || 'Medium'
        const dueInDays = daysUntil(card.enrichment?.dueDate || card.due || null)

        if (filters.excludeReplies && type === 'Reply') return false
        if (filters.deepWorkOnly && type !== 'Deep Work') return false
        if (filters.urgentOnly && priority !== 'High' && (dueInDays === null || dueInDays > 3)) return false
        if (type === 'Waiting') return false

        if (filters.energy === 'low' && !['Reply', 'Admin', 'Personal'].includes(type)) return false
        if (filters.energy === 'high' && !['Deep Work', 'Review'].includes(type)) return false

        return true
    })
}

function scoreCard(card: TrelloCardView, filters: PlanFilters): PlannerCandidate {
    const priority = card.enrichment?.priority || 'Medium'
    const taskType = card.enrichment?.taskType || 'Admin'
    const minutes = effortMinutes(card)
    const dueInDays = daysUntil(card.enrichment?.dueDate || card.due || null)

    let score = PRIORITY_SCORE[priority] + TASK_TYPE_SCORE[taskType]

    if (card.listKey === 'inbox') score += 14
    if (card.listKey === 'thisWeek') score += 8
    if (card.listKey === 'later') score -= 4

    if (dueInDays !== null) {
        if (dueInDays <= 0) score += 30
        else if (dueInDays <= 2) score += 22
        else if (dueInDays <= 7) score += 12
    }

    if (filters.mode === 'evening' && taskType === 'Deep Work') score += 8
    if (filters.energy === 'low' && minutes <= 30) score += 12
    if (filters.energy === 'high' && minutes >= 60) score += 12

    if (minutes > filters.timeBudgetMinutes) score -= 18

    return {
        ...card,
        score,
        effortMinutes: minutes,
    }
}

function buildWhy(card: PlannerCandidate): string {
    const parts: string[] = []
    if (card.enrichment?.priority === 'High') parts.push('high priority')
    if (card.enrichment?.dueDate) parts.push(`due ${card.enrichment.dueDate}`)
    if (card.listKey === 'inbox') parts.push('still in Inbox')
    if (card.enrichment?.taskType === 'Deep Work') parts.push('good focus block')
    if (card.enrichment?.taskType === 'Reply' || card.enrichment?.taskType === 'Admin') parts.push('easy win')
    return parts.length > 0 ? parts.join(', ') : 'best fit for the current plan window'
}

function summarizePlan(items: PlanSuggestionItem[], filters: PlanFilters): { summary: string; rationale: string } {
    if (items.length === 0) {
        return {
            summary: 'No cards fit the current filters.',
            rationale: 'Try relaxing the urgency or energy filters, or enrich more Inbox cards first.',
        }
    }

    const mix = items.reduce(
        (acc, item) => {
            acc[item.taskType] = (acc[item.taskType] || 0) + 1
            return acc
        },
        {} as Partial<Record<TaskType, number>>,
    )

    const segments: string[] = []
    if (mix.Admin) segments.push(`${mix.Admin} admin`)
    if (mix.Reply) segments.push(`${mix.Reply} reply`)
    if (mix.Review) segments.push(`${mix.Review} review`)
    if (mix['Deep Work']) segments.push(`${mix['Deep Work']} deep-work`)
    if (mix.Personal) segments.push(`${mix.Personal} personal`)

    const windowLabel = filters.mode === 'evening'
        ? `evening block (${filters.timeBudgetMinutes} min)`
        : `${filters.timeBudgetMinutes}-minute window`

    return {
        summary: `Plan for your ${windowLabel}: ${segments.join(', ')}.`,
        rationale: 'Selection favors clear next actions, near-term urgency, and a workable mix for the available time rather than raw backlog order.',
    }
}

export function generatePlan(snapshot: PlannerSnapshot, filters: PlanFilters): PlanSuggestion {
    const eligible = filterEligibleCards(snapshot, filters).map((card) => scoreCard(card, filters))
    eligible.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return a.effortMinutes - b.effortMinutes
    })

    const selected: PlannerCandidate[] = []
    let usedMinutes = 0

    for (const candidate of eligible) {
        const nextMinutes = usedMinutes + candidate.effortMinutes
        if (selected.length > 0 && nextMinutes > filters.timeBudgetMinutes) continue
        if (selected.length === 0 && candidate.effortMinutes > filters.timeBudgetMinutes && filters.mode === 'window') continue

        selected.push(candidate)
        usedMinutes = nextMinutes

        if (usedMinutes >= filters.timeBudgetMinutes) break
    }

    const items: PlanSuggestionItem[] = selected.map((card) => ({
        cardId: card.id,
        title: card.enrichment?.title || card.name,
        url: card.url,
        taskType: card.enrichment?.taskType || 'Admin',
        effort: card.enrichment?.effort || '30 min',
        effortMinutes: card.effortMinutes,
        priority: card.enrichment?.priority || 'Medium',
        dueDate: card.enrichment?.dueDate || card.due || null,
        listName: card.listName,
        nextAction: card.enrichment?.nextAction || 'Review card details and define the first concrete step.',
        why: buildWhy(card),
    }))

    const { summary, rationale } = summarizePlan(items, filters)

    return {
        summary,
        rationale,
        totalMinutes: items.reduce((sum, item) => sum + item.effortMinutes, 0),
        filters,
        items,
    }
}
