'use server'

import { revalidatePath } from 'next/cache'
import { analyzeTrelloCard } from '@/lib/services/trello-llm'
import { generatePlan } from '@/lib/services/planner'
import {
    addLabelToCard,
    AI_PROCESSED_LABEL,
    buildEnrichedDescription,
    ensureLabel,
    getPlannerSnapshot,
    moveCardToList,
    updateCard,
} from '@/lib/services/trello'
import { PlanFilters, PlanSuggestion, TrelloCardEnrichment } from '@/lib/types/trello-planner'

function stripReplyPrefixes(title: string): string {
    return title.replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, '').trim()
}

function fallbackEnrichment(title: string, rawContent: string, dueDate: string | null): TrelloCardEnrichment {
    const cleanTitle = stripReplyPrefixes(title) || 'Clarify next step'
    const preview = rawContent.replace(/\s+/g, ' ').trim().slice(0, 180)

    return {
        title: cleanTitle,
        summary: preview || 'Forwarded task card awaiting manual clarification.',
        nextAction: 'Review the forwarded email and define the first concrete step.',
        taskType: 'Admin',
        effort: preview.length > 120 ? '30 min' : '15 min',
        dueDate,
        priority: dueDate ? 'High' : 'Medium',
        source: 'Trello email-to-board',
    }
}

export async function enrichInboxCardsAction(limit = 10): Promise<{
    success: boolean
    enriched: number
    skipped: number
    errors: string[]
}> {
    try {
        const snapshot = await getPlannerSnapshot()
        const cards = snapshot.inbox.filter((card) => !card.processed).slice(0, Math.max(1, limit))
        const processedLabel = await ensureLabel(snapshot.board.id, AI_PROCESSED_LABEL, 'green')

        let enriched = 0
        let skipped = 0
        const errors: string[] = []

        for (const card of cards) {
            try {
                const dueDate = card.due ? new Date(card.due).toISOString().slice(0, 10) : null
                const enrichment = await analyzeTrelloCard(card.name, card.rawContent)
                const finalEnrichment = enrichment || fallbackEnrichment(card.name, card.rawContent, dueDate)
                const description = buildEnrichedDescription(finalEnrichment, card.rawContent)

                await updateCard(card.id, {
                    name: finalEnrichment.title,
                    desc: description,
                    due: finalEnrichment.dueDate ? new Date(finalEnrichment.dueDate).toISOString() : card.due,
                })

                if (!card.labels.some((label) => label.name === AI_PROCESSED_LABEL)) {
                    await addLabelToCard(card.id, processedLabel.id)
                }

                enriched += 1
            } catch (error) {
                console.error(`Failed to enrich Trello card ${card.id}:`, error)
                errors.push(`${card.name}: ${error instanceof Error ? error.message : 'Unknown error'}`)
            }
        }

        skipped = snapshot.inbox.length - cards.length
        revalidatePath('/')

        return { success: errors.length === 0, enriched, skipped, errors }
    } catch (error) {
        console.error('Failed to enrich inbox cards:', error)
        return {
            success: false,
            enriched: 0,
            skipped: 0,
            errors: [error instanceof Error ? error.message : 'Unknown error'],
        }
    }
}

export async function generatePlanAction(filters: PlanFilters): Promise<{
    success: boolean
    plan?: PlanSuggestion
    error?: string
}> {
    try {
        const snapshot = await getPlannerSnapshot()
        const plan = generatePlan(snapshot, filters)
        return { success: true, plan }
    } catch (error) {
        console.error('Failed to generate plan:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to generate plan',
        }
    }
}

export async function confirmPlanAction(cardIds: string[]): Promise<{
    success: boolean
    moved: number
    error?: string
}> {
    try {
        if (cardIds.length === 0) {
            return { success: false, moved: 0, error: 'Select at least one card to move into Today.' }
        }

        const snapshot = await getPlannerSnapshot()
        const todayList = snapshot.lists.today

        let moved = 0
        for (const cardId of cardIds) {
            await moveCardToList(cardId, todayList.id)
            moved += 1
        }

        revalidatePath('/')
        return { success: true, moved }
    } catch (error) {
        console.error('Failed to confirm plan:', error)
        return {
            success: false,
            moved: 0,
            error: error instanceof Error ? error.message : 'Failed to move cards into Today',
        }
    }
}
