import { getPendingTasks } from '@/lib/actions/tasks'
import { BriefingView } from '@/components/BriefingView'
import { NoFlyZoneIndicator } from '@/components/NoFlyZoneIndicator'
import { RefreshButton } from '@/components/RefreshButton'
import { AddTaskButton } from '@/components/AddTaskButton'
import { PendingEventsList } from '@/components/PendingEventsList'
import { Calendar } from 'lucide-react'


// Revalidate every 30 seconds
// Force dynamic rendering to avoid build-time Supabase errors
export const dynamic = 'force-dynamic'

export default async function DailyBriefingPage() {
  const { tasks, error } = await getPendingTasks()

  const today = new Date().toLocaleDateString('en-AU', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="py-6 space-y-6">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 animate-fade-in">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <Calendar size={16} />
            <time>{today}</time>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">
            Daily Briefing
          </h1>
          <p className="text-muted-foreground mt-1">
            Review and triage your pending tasks
          </p>
        </div>

        <RefreshButton />
      </header>

      {/* No-Fly Zone Status */}
      <NoFlyZoneIndicator />

      {/* Error State */}
      {error && (
        <div className="glass-card p-4 border-l-4 border-l-destructive animate-fade-in">
          <h3 className="font-semibold text-destructive">Error Loading Tasks</h3>
          <p className="text-sm text-muted-foreground mt-1">{error}</p>
        </div>
      )}

      {/* Pending Calendar Events */}
      <PendingEventsList />

      {/* Briefing Content */}
      <BriefingView tasks={tasks} />

      {/* Floating Add Task Button */}
      <AddTaskButton />
    </div>
  )
}
