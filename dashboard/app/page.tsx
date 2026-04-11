import { TrelloPlannerDashboard } from '@/components/TrelloPlannerDashboard'
import { getPlannerSnapshot } from '@/lib/services/trello'
import { PlannerSnapshot } from '@/lib/types/trello-planner'

export const dynamic = 'force-dynamic'

export default async function PlannerPage() {
    const emptySnapshot: PlannerSnapshot = {
        board: { id: '', name: 'Unavailable' },
        lists: {
            inbox: { id: 'inbox', name: 'Inbox', key: 'inbox' },
            today: { id: 'today', name: 'Today', key: 'today' },
            thisWeek: { id: 'this-week', name: 'This Week', key: 'thisWeek' },
            waiting: { id: 'waiting', name: 'Waiting', key: 'waiting' },
            later: { id: 'later', name: 'Later', key: 'later' },
            done: { id: 'done', name: 'Done', key: 'done' },
        },
        inbox: [],
        today: [],
        thisWeek: [],
        waiting: [],
        later: [],
        done: [],
    }

    let snapshot = emptySnapshot
    let errorMessage: string | undefined

    try {
        snapshot = await getPlannerSnapshot()
    } catch (error) {
        errorMessage = error instanceof Error ? error.message : 'Failed to load Trello planner.'
    }

    return <TrelloPlannerDashboard snapshot={snapshot} error={errorMessage} />
}
