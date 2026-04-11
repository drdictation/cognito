export const TRELLO_LIST_ORDER = ['inbox', 'today', 'thisWeek', 'waiting', 'later', 'done'] as const

export type TrelloListKey = typeof TRELLO_LIST_ORDER[number]

export const TASK_TYPES = ['Reply', 'Admin', 'Review', 'Deep Work', 'Waiting', 'Personal'] as const
export type TaskType = typeof TASK_TYPES[number]

export const EFFORT_BUCKETS = ['5 min', '15 min', '30 min', '60 min', '90+ min'] as const
export type EffortBucket = typeof EFFORT_BUCKETS[number]

export const PRIORITY_LEVELS = ['High', 'Medium', 'Low'] as const
export type PlanningPriority = typeof PRIORITY_LEVELS[number]

export interface TrelloLabel {
    id: string
    name: string
    color: string | null
}

export interface TrelloCard {
    id: string
    name: string
    desc: string
    url: string
    due: string | null
    idList: string
    labels: TrelloLabel[]
    dateLastActivity: string
    idAttachmentCover: string | null
}

export interface TrelloList {
    id: string
    name: string
    key: TrelloListKey
}

export interface TrelloCardEnrichment {
    summary: string
    nextAction: string
    taskType: TaskType
    effort: EffortBucket
    dueDate: string | null
    priority: PlanningPriority
    source: string | null
    title: string
}

export interface TrelloCardView extends TrelloCard {
    listKey: TrelloListKey
    listName: string
    processed: boolean
    rawContent: string
    enrichment: TrelloCardEnrichment | null
}

export interface PlannerSnapshot {
    board: {
        id: string
        name: string
    }
    lists: Record<TrelloListKey, TrelloList>
    inbox: TrelloCardView[]
    today: TrelloCardView[]
    thisWeek: TrelloCardView[]
    waiting: TrelloCardView[]
    later: TrelloCardView[]
    done: TrelloCardView[]
}

export interface PlanFilters {
    mode: 'evening' | 'window'
    timeBudgetMinutes: number
    energy: 'any' | 'low' | 'high'
    urgentOnly: boolean
    excludeReplies: boolean
    deepWorkOnly: boolean
}

export interface PlannerCandidate extends TrelloCardView {
    score: number
    effortMinutes: number
}

export interface PlanSuggestionItem {
    cardId: string
    title: string
    url: string
    taskType: TaskType
    effort: EffortBucket
    effortMinutes: number
    priority: PlanningPriority
    dueDate: string | null
    listName: string
    nextAction: string
    why: string
}

export interface PlanSuggestion {
    summary: string
    rationale: string
    totalMinutes: number
    filters: PlanFilters
    items: PlanSuggestionItem[]
}
