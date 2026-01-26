import { Suspense } from 'react'
import CalendarView from '@/components/CalendarView'

export default function CalendarPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
            <div className="container mx-auto px-4 py-8">
                <div className="mb-8">
                    <h1 className="text-4xl font-bold text-white mb-2">
                        📅 Calendar & Time Tracking
                    </h1>
                    <p className="text-slate-300">
                        Manage your scheduled tasks and track time spent
                    </p>
                </div>

                <Suspense fallback={
                    <div className="flex items-center justify-center h-96">
                        <div className="text-white text-xl">Loading calendar...</div>
                    </div>
                }>
                    <CalendarView />
                </Suspense>
            </div>
        </div>
    )
}
