'use client'

import { useState } from 'react'
import { BlocklistEntry } from '@/lib/types/database'
import { addToBlocklist, toggleBlocklistEntry, deleteFromBlocklist } from '@/lib/actions/blocklist'
import { Plus, Trash2, ToggleLeft, ToggleRight, Shield, Mail } from 'lucide-react'
import { toast } from 'sonner'

interface BlocklistManagerProps {
    entries: BlocklistEntry[]
}

export function BlocklistManager({ entries }: BlocklistManagerProps) {
    const [isAdding, setIsAdding] = useState(false)
    const [newPattern, setNewPattern] = useState('')
    const [newReason, setNewReason] = useState('')
    const [isLoading, setIsLoading] = useState(false)

    async function handleAdd(e: React.FormEvent) {
        e.preventDefault()
        if (!newPattern.trim()) return

        setIsLoading(true)
        try {
            const result = await addToBlocklist(newPattern.trim(), newReason.trim() || undefined)
            if (result.success) {
                toast.success('Pattern added to blocklist')
                setNewPattern('')
                setNewReason('')
                setIsAdding(false)
            } else {
                toast.error(result.error || 'Failed to add pattern')
            }
        } catch (error) {
            toast.error('An error occurred')
            console.error(error)
        } finally {
            setIsLoading(false)
        }
    }

    async function handleToggle(entry: BlocklistEntry) {
        try {
            const result = await toggleBlocklistEntry(entry.id, !entry.is_active)
            if (result.success) {
                toast.success(`Pattern ${entry.is_active ? 'disabled' : 'enabled'}`)
            } else {
                toast.error(result.error || 'Failed to update')
            }
        } catch (error) {
            toast.error('An error occurred')
            console.error(error)
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('Are you sure you want to delete this blocklist entry?')) return

        try {
            const result = await deleteFromBlocklist(id)
            if (result.success) {
                toast.success('Pattern removed from blocklist')
            } else {
                toast.error(result.error || 'Failed to delete')
            }
        } catch (error) {
            toast.error('An error occurred')
            console.error(error)
        }
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                        <Shield size={24} className="text-primary" />
                        Email Blocklist
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Emails matching these patterns are filtered before AI processing
                    </p>
                </div>

                <button
                    onClick={() => setIsAdding(!isAdding)}
                    className="btn-primary flex items-center gap-2"
                >
                    <Plus size={18} />
                    Add Pattern
                </button>
            </div>

            {/* Add Form */}
            {isAdding && (
                <form
                    onSubmit={handleAdd}
                    className="glass-card p-4 space-y-4 animate-slide-in-right"
                >
                    <div>
                        <label className="text-sm font-medium text-foreground block mb-2">
                            Email Pattern
                        </label>
                        <input
                            type="text"
                            value={newPattern}
                            onChange={(e) => setNewPattern(e.target.value)}
                            placeholder="%noreply%, %@marketing.com%"
                            className="input-premium"
                            required
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            Use % as wildcard. Examples: %noreply%, %newsletter%, %@example.com%
                        </p>
                    </div>

                    <div>
                        <label className="text-sm font-medium text-foreground block mb-2">
                            Reason (optional)
                        </label>
                        <input
                            type="text"
                            value={newReason}
                            onChange={(e) => setNewReason(e.target.value)}
                            placeholder="e.g., Automated marketing emails"
                            className="input-premium"
                        />
                    </div>

                    <div className="flex gap-2">
                        <button
                            type="submit"
                            disabled={isLoading || !newPattern.trim()}
                            className="btn-primary disabled:opacity-50"
                        >
                            {isLoading ? 'Adding...' : 'Add to Blocklist'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsAdding(false)}
                            className="btn-ghost"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            )}

            {/* Entries List */}
            <div className="space-y-3">
                {entries.length === 0 ? (
                    <div className="glass-card p-8 text-center">
                        <Mail size={40} className="mx-auto text-muted-foreground mb-3" />
                        <p className="text-muted-foreground">
                            No blocklist patterns yet. Add patterns to filter spam and newsletters.
                        </p>
                    </div>
                ) : (
                    entries.map((entry, index) => (
                        <div
                            key={entry.id}
                            className={`glass-card p-4 flex items-center gap-4 animate-fade-in opacity-0 stagger-${Math.min(index + 1, 6)} ${!entry.is_active ? 'opacity-50' : ''
                                }`}
                        >
                            <button
                                onClick={() => handleToggle(entry)}
                                className={`p-2 rounded-lg transition-colors ${entry.is_active
                                        ? 'text-emerald-400 hover:bg-emerald-500/20'
                                        : 'text-muted-foreground hover:bg-accent'
                                    }`}
                                title={entry.is_active ? 'Disable' : 'Enable'}
                            >
                                {entry.is_active ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                            </button>

                            <div className="flex-1 min-w-0">
                                <code className="text-sm font-mono text-foreground bg-secondary px-2 py-1 rounded">
                                    {entry.email_pattern}
                                </code>
                                {entry.reason && (
                                    <p className="text-xs text-muted-foreground mt-1 truncate">
                                        {entry.reason}
                                    </p>
                                )}
                            </div>

                            <button
                                onClick={() => handleDelete(entry.id)}
                                className="p-2 rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
                                title="Delete"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
