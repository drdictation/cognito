import { getBlocklist } from '@/lib/actions/blocklist'
import { BlocklistManager } from '@/components/BlocklistManager'
import { NoFlyZoneIndicator } from '@/components/NoFlyZoneIndicator'
import { Settings } from 'lucide-react'

// Revalidate every 60 seconds
export const revalidate = 60

export default async function AdminPage() {
    const { entries, error } = await getBlocklist()

    return (
        <div className="py-6 space-y-8">
            {/* Header */}
            <header className="animate-fade-in">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-xl bg-primary/20">
                        <Settings size={24} className="text-primary" />
                    </div>
                    <h1 className="text-3xl md:text-4xl font-bold text-foreground">
                        Admin Controls
                    </h1>
                </div>
                <p className="text-muted-foreground">
                    System configuration and monitoring
                </p>
            </header>

            {/* Processing Status */}
            <section className="animate-fade-in stagger-1 opacity-0">
                <h2 className="text-lg font-semibold text-foreground mb-4">Processing Status</h2>
                <NoFlyZoneIndicator />
            </section>

            {/* Blocklist Section */}
            <section className="animate-fade-in stagger-2 opacity-0">
                {error ? (
                    <div className="glass-card p-4 border-l-4 border-l-destructive">
                        <h3 className="font-semibold text-destructive">Error Loading Blocklist</h3>
                        <p className="text-sm text-muted-foreground mt-1">{error}</p>
                    </div>
                ) : (
                    <BlocklistManager entries={entries} />
                )}
            </section>

            {/* System Info */}
            <section className="animate-fade-in stagger-3 opacity-0">
                <h2 className="text-lg font-semibold text-foreground mb-4">System Information</h2>
                <div className="glass-card p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <h3 className="text-sm text-muted-foreground uppercase tracking-wide mb-2">Architecture</h3>
                            <ul className="space-y-2 text-sm">
                                <li className="flex justify-between">
                                    <span className="text-muted-foreground">AI Model</span>
                                    <span className="font-mono text-foreground">gemini-2.5-flash-lite</span>
                                </li>
                                <li className="flex justify-between">
                                    <span className="text-muted-foreground">Database</span>
                                    <span className="font-mono text-foreground">Supabase (PostgreSQL)</span>
                                </li>
                                <li className="flex justify-between">
                                    <span className="text-muted-foreground">Framework</span>
                                    <span className="font-mono text-foreground">Next.js 14</span>
                                </li>
                            </ul>
                        </div>
                        <div>
                            <h3 className="text-sm text-muted-foreground uppercase tracking-wide mb-2">Constraints</h3>
                            <ul className="space-y-2 text-sm">
                                <li className="flex justify-between">
                                    <span className="text-muted-foreground">No-Fly Zone</span>
                                    <span className="text-foreground">Fri 17:00 - Sun 18:00</span>
                                </li>
                                <li className="flex justify-between">
                                    <span className="text-muted-foreground">Bypass Domains</span>
                                    <span className="text-foreground">Home, Hobby</span>
                                </li>
                                <li className="flex justify-between">
                                    <span className="text-muted-foreground">Philosophy</span>
                                    <span className="text-foreground">AI Proposes, User Disposes</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    )
}
