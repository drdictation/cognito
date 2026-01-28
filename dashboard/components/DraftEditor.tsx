'use client'

import { useState } from 'react'
import { InboxTask } from '@/lib/types/database'
import { saveDraft, regenerateDraft } from '@/lib/actions/drafts'
import { Edit3, Sparkles, Loader2, Save, Send } from 'lucide-react'
import { toast } from 'sonner'

interface DraftEditorProps {
    task: InboxTask
}

export function DraftEditor({ task }: DraftEditorProps) {
    const [draft, setDraft] = useState(task.draft_response || '')
    const [instruction, setInstruction] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [isRegenerating, setIsRegenerating] = useState(false)

    async function handleSave() {
        setIsSaving(true)
        try {
            const result = await saveDraft(task.id, draft)
            if (result.success) {
                // minimal feedback for auto-save, maybe just a checkmark?
            } else {
                toast.error('Failed to save draft')
            }
        } catch (error) {
            console.error(error)
        } finally {
            setIsSaving(false)
        }
    }

    async function handleRegenerate() {
        if (isRegenerating) return

        setIsRegenerating(true)
        try {
            const result = await regenerateDraft(task.id, instruction, draft)
            if (result.success && result.draft) {
                setDraft(result.draft)
                setInstruction('')
                toast.success('Draft regenerated!')
            } else {
                toast.error(result.error || 'Regeneration failed')
            }
        } catch (error) {
            toast.error('An error occurred')
            console.error(error)
        } finally {
            setIsRegenerating(false)
        }
    }

    return (
        <div className="mt-4 border-t border-border pt-4 w-full flex flex-col">
            <div className="flex items-center justify-between mb-3 w-full">
                <div className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wide">
                    <Edit3 size={14} />
                    Draft Response
                </div>
                {isSaving && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1 animate-pulse">
                        <Save size={12} /> Saving...
                    </span>
                )}
            </div>

            <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={handleSave}
                placeholder="Write your response here..."
                className="w-full min-h-[200px] p-4 rounded-lg bg-secondary/50 border border-border text-base font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-primary/20 block"
                disabled={isRegenerating}
            />

            <div className="mt-4 flex gap-2 items-center w-full">
                <div className="flex-1 relative">
                    <input
                        type="text"
                        value={instruction}
                        onChange={(e) => setInstruction(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRegenerate()}
                        placeholder="Instructions for AI (e.g. 'Make it more formal', 'Say I'm busy Tuesday')..."
                        className="w-full pl-3 pr-10 py-2.5 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        disabled={isRegenerating}
                    />
                    <Sparkles
                        size={14}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                    />
                </div>
                <button
                    onClick={handleRegenerate}
                    disabled={isRegenerating}
                    className="btn-secondary text-sm py-2 px-4 flex items-center gap-1.5 shrink-0"
                >
                    {isRegenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    <span className="hidden sm:inline">Regenerate</span>
                </button>
                <button
                    onClick={() => {
                        // 1. Determine the best Subject Line
                        let subjectLine = task.subject || 'No Subject'

                        // Strategy A: Extract TRUE original subject from forwarded headers (Gold Standard)
                        // This fixes the issue where "Smart Subject" replaced the original, confusing recipients.
                        if (task.original_content) {
                            const originalSubjectMatch = task.original_content.match(/Subject:\s*(.+)(\r?\n|$)/i)
                            if (originalSubjectMatch) {
                                subjectLine = originalSubjectMatch[1].trim()
                            }
                        }

                        // Strategy B: If draft itself has a Subject line, uses that as fallback (if A failed)
                        // Also CRITICAL: Remove this line from the body so it doesn't appear twice
                        let mailtoBody = draft
                        const draftSubjectMatch = draft.match(/^Subject:\s*(.+)/i)

                        // Always clean the body of the Subject line
                        if (draftSubjectMatch) {
                            mailtoBody = draft.replace(/^Subject:\s*(.+)(\r?\n|$)/i, '').trim()

                            // Only use as subject fallback if Strategy A failed (and checking if it's not just "No Subject")
                            if (subjectLine === 'No Subject' || subjectLine === task.subject) {
                                // Double check - often the AI writes the original subject here too.
                                // If Strategy A missed it (e.g. malformed headers), this is a good backup.
                                subjectLine = draftSubjectMatch[1].trim()
                            }
                        }

                        // Ensure "Re:" prefix
                        if (!subjectLine.toLowerCase().startsWith('re:')) {
                            subjectLine = `Re: ${subjectLine}`
                        }

                        const subject = encodeURIComponent(subjectLine)
                        const body = encodeURIComponent(mailtoBody)

                        // Reply to the real sender, NOT the user's own email if possible, or leave blank to let them decide
                        // Ideally we reply to task.real_sender, but sometimes it's complex.
                        // Let's rely on the user to check the TO address, but try to pre-fill it.
                        // If task.real_sender contains a name like "John Doe <john@doe.com>", we need to extract the email.
                        let toAddress = task.real_sender
                        const emailMatch = task.real_sender.match(/<([^>]+)>/)
                        if (emailMatch) {
                            toAddress = emailMatch[1]
                        }

                        window.open(`mailto:${toAddress}?subject=${subject}&body=${body}`, '_blank')
                    }}
                    className="btn-primary text-sm py-2 px-4 flex items-center gap-1.5 shrink-0"
                >
                    <Send size={16} />
                    <span className="hidden sm:inline">Reply Now</span>
                </button>
            </div>
        </div>
    )
}
