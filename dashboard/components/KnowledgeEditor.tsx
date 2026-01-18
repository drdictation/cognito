'use client'

import { useState, useEffect } from 'react'
import { Domain, DomainKnowledge } from '@/lib/types/database'
import { saveKnowledge } from '@/lib/actions/knowledge'
import { Check, Save, AlertTriangle, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface KnowledgeEditorProps {
    initialKnowledge: DomainKnowledge[]
}

const DOMAINS: Domain[] = ['Clinical', 'Research', 'Admin', 'Home', 'Hobby']

export function KnowledgeEditor({ initialKnowledge }: KnowledgeEditorProps) {
    const router = useRouter()
    const [activeDomain, setActiveDomain] = useState<Domain>('Clinical')
    const [content, setContent] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [lastSaved, setLastSaved] = useState<Date | null>(null)
    const [isDirty, setIsDirty] = useState(false)

    // Load content when domain changes
    useEffect(() => {
        const domainData = initialKnowledge.find(k => k.domain === activeDomain)
        setContent(domainData?.content || '')
        setIsDirty(false)
        setLastSaved(domainData?.updated_at ? new Date(domainData.updated_at) : null)
    }, [activeDomain, initialKnowledge])

    const handleSave = async () => {
        if (!isDirty) return

        setIsSaving(true)
        const result = await saveKnowledge(activeDomain, content)
        setIsSaving(false)

        if (result.success) {
            setLastSaved(new Date())
            setIsDirty(false)
            router.refresh()
        } else {
            console.error(result.error)
            alert('Failed to save')
        }
    }

    // Auto-save (debounced) could go here, but manual for now to be safe

    return (
        <div className="glass-card flex flex-col h-[600px]">
            {/* Domain Tabs */}
            <div className="flex border-b border-white/10 overflow-x-auto">
                {DOMAINS.map(domain => (
                    <button
                        key={domain}
                        onClick={() => setActiveDomain(domain)}
                        className={`
                            px-6 py-4 text-sm font-medium transition-colors
                            border-b-2 whitespace-nowrap
                            ${activeDomain === domain
                                ? 'border-primary text-primary bg-primary/5'
                                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-white/5'
                            }
                        `}
                    >
                        {domain}
                    </button>
                ))}
            </div>

            {/* Editor Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-black/20">
                <span className="text-xs text-muted-foreground font-mono">
                    {activeDomain.toUpperCase()} KNOWLEDGE
                </span>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                        {isSaving ? (
                            <span className="flex items-center gap-1 text-primary">
                                <Loader2 size={12} className="animate-spin" /> Saving...
                            </span>
                        ) : isDirty ? (
                            <span className="text-amber-400 flex items-center gap-1">
                                <AlertTriangle size={12} /> Unsaved changes
                            </span>
                        ) : lastSaved ? (
                            <span className="flex items-center gap-1 text-green-400">
                                <Check size={12} /> Saved {lastSaved.toLocaleTimeString()}
                            </span>
                        ) : null}
                    </span>
                    <button
                        onClick={handleSave}
                        disabled={!isDirty || isSaving}
                        className={`
                            flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold
                            transition-all
                            ${!isDirty
                                ? 'opacity-50 cursor-not-allowed bg-white/5 text-muted-foreground'
                                : 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20'
                            }
                        `}
                    >
                        <Save size={14} />
                        Save Changes
                    </button>
                </div>
            </div>

            {/* Markdown Textarea */}
            <div className="flex-1 relative">
                {content ? (
                    <textarea
                        value={content}
                        onChange={(e) => {
                            setContent(e.target.value)
                            setIsDirty(true)
                        }}
                        className="w-full h-full p-6 bg-transparent text-base font-mono text-foreground resize-none focus:outline-none"
                        placeholder={`Enter knowledge for ${activeDomain}...`}
                        spellCheck={false}
                    />
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground p-6">
                        <AlertTriangle size={32} className="mb-2 opacity-50" />
                        <p>No knowledge configured for {activeDomain} yet.</p>
                        <button
                            onClick={() => {
                                setContent(`# ${activeDomain} Domain Knowledge\n\n`)
                                setIsDirty(true)
                            }}
                            className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
                        >
                            Start from Template
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
