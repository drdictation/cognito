'use client'

import { useState } from 'react'
import { KnowledgeSuggestion } from '@/lib/types/database'
import { approveSuggestion, rejectSuggestion } from '@/lib/actions/knowledge'
import { Sparkles, Check, X, ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface SuggestionsListProps {
    suggestions: KnowledgeSuggestion[]
}

export function SuggestionsList({ suggestions }: SuggestionsListProps) {
    const router = useRouter()
    const [processingId, setProcessingId] = useState<string | null>(null)

    if (suggestions.length === 0) return null

    const handleAction = async (id: string, action: 'approve' | 'reject') => {
        setProcessingId(id)
        if (action === 'approve') {
            await approveSuggestion(id)
        } else {
            await rejectSuggestion(id)
        }
        setProcessingId(null)
        router.refresh()
    }

    return (
        <section className="space-y-4 animate-fade-in">
            <div className="flex items-center gap-2">
                <Sparkles className="text-amber-400" size={18} />
                <h3 className="text-lg font-semibold text-foreground">AI Learning Suggestions</h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    {suggestions.length} Pending
                </span>
            </div>

            <div className="grid gap-4">
                {suggestions.map(suggestion => (
                    <div key={suggestion.id} className="glass-card p-4 border border-amber-500/20 bg-amber-500/5">
                        <div className="flex items-start justify-between gap-4">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span className="font-bold text-foreground bg-white/10 px-1.5 py-0.5 rounded">
                                        {suggestion.domain}
                                    </span>
                                    <span>suggests adding:</span>
                                </div>

                                <div className="p-3 rounded-lg bg-black/20 text-sm font-mono text-amber-100/90 whitespace-pre-wrap">
                                    {suggestion.suggested_content}
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={() => handleAction(suggestion.id, 'approve')}
                                    disabled={!!processingId}
                                    className="p-2 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors"
                                    title="Approve & Merge"
                                >
                                    <Check size={18} />
                                </button>
                                <button
                                    onClick={() => handleAction(suggestion.id, 'reject')}
                                    disabled={!!processingId}
                                    className="p-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                                    title="Reject"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    )
}
