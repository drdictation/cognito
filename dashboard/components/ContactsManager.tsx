'use client'

import { useState } from 'react'
import { Contact, Domain, Priority } from '@/lib/types/database'
import { createContact, deleteContact } from '@/lib/actions/knowledge'
import { Plus, Trash2, User, Mail, ShieldAlert } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface ContactsManagerProps {
    contacts: Contact[]
}

const DOMAINS: Domain[] = ['Clinical', 'Research', 'Admin', 'Home', 'Hobby']
const PRIORITIES: Priority[] = ['Critical', 'High', 'Normal', 'Low']

export function ContactsManager({ contacts }: ContactsManagerProps) {
    const router = useRouter()
    const [isAdding, setIsAdding] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Form State
    const [newName, setNewName] = useState('')
    const [newEmail, setNewEmail] = useState('')
    const [newDomain, setNewDomain] = useState<Domain>('Clinical')
    const [newRole, setNewRole] = useState('')
    const [newPriority, setNewPriority] = useState<Priority>('Normal')

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newName) return

        setIsSubmitting(true)
        const result = await createContact({
            name: newName,
            email: newEmail || undefined,
            domain: newDomain,
            role: newRole || undefined,
            priority_boost: newPriority
        })
        setIsSubmitting(false)

        if (result.success) {
            setIsAdding(false)
            setNewName('')
            setNewEmail('')
            setNewRole('')
            router.refresh()
        } else {
            alert('Failed to add contact: ' + result.error)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this contact?')) return
        await deleteContact(id)
        router.refresh()
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">Key Contacts</h3>
                <button
                    onClick={() => setIsAdding(!isAdding)}
                    className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
                >
                    <Plus size={16} />
                    Add Contact
                </button>
            </div>

            {/* Add Contact Form */}
            {isAdding && (
                <form onSubmit={handleSubmit} className="glass-card p-4 space-y-4 border border-primary/20 bg-primary/5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-2xs text-muted-foreground uppercase tracking-widest">Name</label>
                            <input
                                type="text"
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                                placeholder="e.g. Dr. Sarah Chen"
                                required
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-2xs text-muted-foreground uppercase tracking-widest">Email (Optional)</label>
                            <input
                                type="email"
                                value={newEmail}
                                onChange={e => setNewEmail(e.target.value)}
                                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                                placeholder="sarah@hospital.org"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-2xs text-muted-foreground uppercase tracking-widest">Domain</label>
                            <select
                                value={newDomain}
                                onChange={e => setNewDomain(e.target.value as Domain)}
                                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                            >
                                {DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-2xs text-muted-foreground uppercase tracking-widest">Priority Boost</label>
                            <select
                                value={newPriority}
                                onChange={e => setNewPriority(e.target.value as Priority)}
                                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                            >
                                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={() => setIsAdding(false)}
                            className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="px-4 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90 transition-colors"
                        >
                            {isSubmitting ? 'Adding...' : 'Save Contact'}
                        </button>
                    </div>
                </form>
            )}

            {/* Contacts Lists */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {contacts.map(contact => (
                    <div key={contact.id} className="glass-card p-3 group relative hover:border-white/10 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                            <div className={`
                                text-xs font-bold px-2 py-0.5 rounded-full border
                                ${contact.domain === 'Clinical' ? 'border-red-500/30 text-red-400 bg-red-500/10' :
                                    contact.domain === 'Research' ? 'border-purple-500/30 text-purple-400 bg-purple-500/10' :
                                        contact.domain === 'Admin' ? 'border-blue-500/30 text-blue-400 bg-blue-500/10' :
                                            contact.domain === 'Home' ? 'border-green-500/30 text-green-400 bg-green-500/10' :
                                                'border-orange-500/30 text-orange-400 bg-orange-500/10'}
                            `}>
                                {contact.domain}
                            </div>
                            <button
                                onClick={() => handleDelete(contact.id)}
                                className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>

                        <div className="flex items-start gap-3">
                            <div className="p-2 rounded-full bg-white/5 text-muted-foreground">
                                <User size={16} />
                            </div>
                            <div>
                                <h4 className="font-medium text-foreground text-sm">{contact.name}</h4>
                                {contact.email && (
                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                                        <Mail size={10} />
                                        <span>{contact.email}</span>
                                    </div>
                                )}
                                {contact.priority_boost && contact.priority_boost !== 'Normal' && (
                                    <div className="flex items-center gap-1 text-xs text-amber-400 mt-2 font-medium">
                                        <ShieldAlert size={10} />
                                        <span>Boosts to {contact.priority_boost}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}

                {contacts.length === 0 && !isAdding && (
                    <div className="col-span-full py-8 text-center text-muted-foreground text-sm border border-dashed border-white/10 rounded-xl">
                        No key contacts added yet.
                    </div>
                )}
            </div>
        </div>
    )
}
