import {
    PlannerSnapshot,
    TrelloCard,
    TrelloCardEnrichment,
    TrelloCardView,
    TrelloLabel,
    TrelloList,
    TrelloListKey,
} from '@/lib/types/trello-planner'

const TRELLO_API_KEY = process.env.TRELLO_API_KEY
const TRELLO_TOKEN = process.env.TRELLO_TOKEN
const TRELLO_BOARD_NAME = process.env.TRELLO_BOARD_NAME || 'Cognito Task Queue'
const TRELLO_BASE_URL = 'https://api.trello.com/1'

const LIST_NAME_BY_KEY: Record<TrelloListKey, string> = {
    inbox: 'Inbox',
    today: 'Today',
    thisWeek: 'This Week',
    waiting: 'Waiting',
    later: 'Later',
    done: 'Done',
}

const LIST_KEY_BY_NAME = new Map<string, TrelloListKey>(
    Object.entries(LIST_NAME_BY_KEY).flatMap(([key, name]) => [
        [name.toLowerCase(), key as TrelloListKey],
        [`🔥 ${name}`.toLowerCase(), key as TrelloListKey],
        [`📅 ${name}`.toLowerCase(), key as TrelloListKey],
        [`📆 ${name}`.toLowerCase(), key as TrelloListKey],
        [`🗓️ ${name}`.toLowerCase(), key as TrelloListKey],
        [`✅ ${name}`.toLowerCase(), key as TrelloListKey],
    ]),
)

export const AI_PROCESSED_LABEL = 'AI Processed'
export const AI_MARKER = '<!-- COGNITO_PROCESSED_V2 -->'
export const AI_SUMMARY_HEADER = '=== AI SUMMARY ==='
export const ORIGINAL_EMAIL_HEADER = '=== ORIGINAL EMAIL ==='

function assertTrelloConfigured() {
    if (!TRELLO_API_KEY || !TRELLO_TOKEN) {
        throw new Error('Trello credentials are not configured.')
    }
}

async function trelloFetch<T>(path: string, init?: RequestInit): Promise<T> {
    assertTrelloConfigured()

    const separator = path.includes('?') ? '&' : '?'
    const url = `${TRELLO_BASE_URL}${path}${separator}key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
    const response = await fetch(url, {
        ...init,
        headers: {
            Accept: 'application/json',
            ...(init?.headers || {}),
        },
        cache: 'no-store',
    })

    if (!response.ok) {
        const text = await response.text()
        throw new Error(`Trello request failed (${response.status}): ${text || response.statusText}`)
    }

    return response.json() as Promise<T>
}

interface TrelloBoard {
    id: string
    name: string
}

export async function findOrCreatePlanningBoard(): Promise<TrelloBoard> {
    const boards = await trelloFetch<TrelloBoard[]>('/members/me/boards?fields=name,id')
    const existing = boards.find((board) => board.name === TRELLO_BOARD_NAME)
    if (existing) return existing

    return trelloFetch<TrelloBoard>(
        `/boards?name=${encodeURIComponent(TRELLO_BOARD_NAME)}&defaultLists=false`,
        { method: 'POST' },
    )
}

export async function ensurePlanningLists(boardId: string): Promise<Record<TrelloListKey, TrelloList>> {
    const currentLists = await trelloFetch<Array<{ id: string; name: string }>>(
        `/boards/${boardId}/lists?fields=name,id`,
    )

    const byKey = {} as Record<TrelloListKey, TrelloList>

    for (const [key, expectedName] of Object.entries(LIST_NAME_BY_KEY) as Array<[TrelloListKey, string]>) {
        const existing = currentLists.find((list) => {
            const normalized = list.name.trim().toLowerCase()
            return normalized === expectedName.toLowerCase() || LIST_KEY_BY_NAME.get(normalized) === key
        })

        if (existing) {
            byKey[key] = { id: existing.id, name: existing.name, key }
            continue
        }

        const created = await trelloFetch<{ id: string; name: string }>(
            `/lists?name=${encodeURIComponent(expectedName)}&idBoard=${boardId}`,
            { method: 'POST' },
        )
        byKey[key] = { id: created.id, name: created.name, key }
    }

    return byKey
}

export async function fetchBoardCards(boardId: string): Promise<TrelloCard[]> {
    const cards = await trelloFetch<TrelloCard[]>(
        `/boards/${boardId}/cards/open?fields=name,desc,url,due,idList,dateLastActivity,idAttachmentCover&attachments=false&members=false&labels=all`,
    )

    return (cards || []).map((card) => ({
        ...card,
        name: card?.name || 'Untitled card',
        desc: card?.desc || '',
        url: card?.url || '',
        due: card?.due || null,
        idList: card?.idList || '',
        dateLastActivity: card?.dateLastActivity || new Date(0).toISOString(),
        idAttachmentCover: card?.idAttachmentCover || null,
        labels: Array.isArray(card?.labels) ? card.labels : [],
    }))
}

export async function moveCardToList(cardId: string, listId: string): Promise<void> {
    await trelloFetch(`/cards/${cardId}?idList=${listId}`, { method: 'PUT' })
}

export async function updateCard(cardId: string, updates: { name?: string; desc?: string; due?: string | null }): Promise<void> {
    const params = new URLSearchParams()
    if (updates.name !== undefined) params.set('name', updates.name)
    if (updates.desc !== undefined) params.set('desc', updates.desc)
    if (updates.due !== undefined) {
        if (updates.due) {
            params.set('due', updates.due)
        } else {
            params.set('due', 'null')
        }
    }

    await trelloFetch(`/cards/${cardId}?${params.toString()}`, { method: 'PUT' })
}

export async function ensureLabel(boardId: string, name: string, color: string): Promise<TrelloLabel> {
    const labels = await trelloFetch<TrelloLabel[]>(`/boards/${boardId}/labels?fields=name,color`)
    const safeLabels = Array.isArray(labels) ? labels : []
    const existing = safeLabels.find((label) => label.name === name)
    if (existing) return existing

    return trelloFetch<TrelloLabel>(
        `/labels?name=${encodeURIComponent(name)}&color=${color}&idBoard=${boardId}`,
        { method: 'POST' },
    )
}

export async function addLabelToCard(cardId: string, labelId: string): Promise<void> {
    await trelloFetch(`/cards/${cardId}/idLabels?value=${labelId}`, { method: 'POST' })
}

export function hasProcessedMarker(card: Pick<TrelloCard, 'desc' | 'labels'>): boolean {
    const description = card?.desc || ''
    const labels = Array.isArray(card?.labels) ? card.labels : []

    if (description.includes(AI_MARKER) || description.includes(AI_SUMMARY_HEADER)) {
        return true
    }
    return labels.some((label) => label.name === AI_PROCESSED_LABEL)
}

export function extractOriginalContent(description: string): string {
    if (!description) return ''

    const markerIndex = description.indexOf(ORIGINAL_EMAIL_HEADER)
    if (markerIndex >= 0) {
        return description
            .slice(markerIndex + ORIGINAL_EMAIL_HEADER.length)
            .replace(/^\s+/, '')
    }

    return description
}

function normalizeValue(value: string): string {
    return value.replace(/\r/g, '').trim()
}

export function parseEnrichmentBlock(description: string): TrelloCardEnrichment | null {
    if (!description.includes(AI_SUMMARY_HEADER)) return null

    const blockEnd = description.indexOf(ORIGINAL_EMAIL_HEADER)
    const block = description.slice(0, blockEnd >= 0 ? blockEnd : undefined)
    const lines = block
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)

    const values = new Map<string, string>()
    for (const line of lines) {
        const separator = line.indexOf(':')
        if (separator <= 0) continue
        const key = line.slice(0, separator).trim().toLowerCase()
        const value = normalizeValue(line.slice(separator + 1))
        values.set(key, value)
    }

    const title = values.get('title') || null
    const summary = values.get('summary') || null
    const nextAction = values.get('next action') || null
    const taskType = values.get('task type') || null
    const effort = values.get('estimated effort') || null
    const priority = values.get('priority') || null
    const dueDate = values.get('due date') || null

    if (!title || !summary || !nextAction || !taskType || !effort || !priority) {
        return null
    }

    return {
        title,
        summary,
        nextAction,
        taskType: taskType as TrelloCardEnrichment['taskType'],
        effort: effort as TrelloCardEnrichment['effort'],
        dueDate: dueDate && dueDate !== 'None found' ? dueDate : null,
        priority: priority as TrelloCardEnrichment['priority'],
        source: values.get('source') || null,
    }
}

export function buildEnrichedDescription(
    enrichment: TrelloCardEnrichment,
    originalContent: string,
): string {
    const dueDate = enrichment.dueDate || 'None found'
    const source = enrichment.source || 'Trello email-to-board'
    const rawContent = originalContent.trim() || '(No captured email body found on this card.)'

    return [
        AI_MARKER,
        AI_SUMMARY_HEADER,
        `Title: ${enrichment.title}`,
        `Summary: ${enrichment.summary}`,
        `Next action: ${enrichment.nextAction}`,
        `Task type: ${enrichment.taskType}`,
        `Estimated effort: ${enrichment.effort}`,
        `Due date: ${dueDate}`,
        `Priority: ${enrichment.priority}`,
        `Source: ${source}`,
        '',
        ORIGINAL_EMAIL_HEADER,
        rawContent,
    ].join('\n')
}

export function mapCardsToSnapshot(
    board: TrelloBoard,
    lists: Record<TrelloListKey, TrelloList>,
    cards: TrelloCard[],
): PlannerSnapshot {
    const listById = new Map<string, TrelloList>(Object.values(lists).map((list) => [list.id, list]))

    const mapped = cards
        .map((card) => {
            const list = listById.get(card.idList)
            if (!list) return null

            const rawContent = extractOriginalContent(card.desc)
            const enrichment = parseEnrichmentBlock(card.desc)

            const view: TrelloCardView = {
                ...card,
                listKey: list.key,
                listName: list.name,
                processed: hasProcessedMarker(card),
                rawContent,
                enrichment,
            }
            return view
        })
        .filter((card): card is TrelloCardView => card !== null)

    const grouped = {
        inbox: [] as TrelloCardView[],
        today: [] as TrelloCardView[],
        thisWeek: [] as TrelloCardView[],
        waiting: [] as TrelloCardView[],
        later: [] as TrelloCardView[],
        done: [] as TrelloCardView[],
    }

    for (const card of mapped) {
        grouped[card.listKey].push(card)
    }

    for (const key of Object.keys(grouped) as Array<TrelloListKey>) {
        grouped[key].sort((a, b) => {
            const aTime = new Date(a.dateLastActivity).getTime()
            const bTime = new Date(b.dateLastActivity).getTime()
            return bTime - aTime
        })
    }

    return {
        board,
        lists,
        ...grouped,
    }
}

export async function getPlannerSnapshot(): Promise<PlannerSnapshot> {
    const board = await findOrCreatePlanningBoard()
    const lists = await ensurePlanningLists(board.id)
    const cards = await fetchBoardCards(board.id)
    return mapCardsToSnapshot(board, lists, cards)
}
