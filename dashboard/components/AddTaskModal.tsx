'use client'

import { useState, useTransition } from 'react'
import { X, PenLine, Mic, Loader2, Sparkles, Check } from 'lucide-react'
import { AudioRecorder } from './AudioRecorder'
import { createManualTask } from '@/lib/actions/manual-tasks'

interface AddTaskModalProps {
    isOpen: boolean
    onClose: () => void
}

type TabType = 'write' | 'dictate'

export function AddTaskModal({ isOpen, onClose }: AddTaskModalProps) {
    const [activeTab, setActiveTab] = useState<TabType>('write')
    const [content, setContent] = useState('')
    const [isPending, startTransition] = useTransition()
    const [success, setSuccess] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleTranscription = (text: string) => {
        setContent(prev => prev ? `${prev}\n\n${text}` : text)
        setError(null)
    }

    const handleSubmit = () => {
        if (!content.trim()) {
            setError('Please enter or dictate some content first')
            return
        }

        setError(null)

        startTransition(async () => {
            const result = await createManualTask(content)

            if (result.success) {
                setSuccess(true)
                setTimeout(() => {
                    setContent('')
                    setSuccess(false)
                    onClose()
                }, 1500)
            } else {
                setError(result.error || 'Failed to create task')
            }
        })
    }

    const handleClose = () => {
        if (!isPending) {
            setContent('')
            setError(null)
            setSuccess(false)
            onClose()
        }
    }

    if (!isOpen) return null

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-fade-in"
                onClick={handleClose}
            />

            {/* Modal */}
            <div className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-lg z-50 animate-scale-in">
                <div className="glass-card h-full md:h-auto max-h-[80vh] flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-border">
                        <h2 className="text-lg font-bold text-foreground">Add Task</h2>
                        <button
                            onClick={handleClose}
                            disabled={isPending}
                            className="p-2 rounded-lg hover:bg-secondary transition-colors"
                        >
                            <X size={20} className="text-muted-foreground" />
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b border-border">
                        <button
                            onClick={() => setActiveTab('write')}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${activeTab === 'write'
                                    ? 'text-primary border-b-2 border-primary'
                                    : 'text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            <PenLine size={18} />
                            Write
                        </button>
                        <button
                            onClick={() => setActiveTab('dictate')}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${activeTab === 'dictate'
                                    ? 'text-primary border-b-2 border-primary'
                                    : 'text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            <Mic size={18} />
                            Dictate
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-4">
                        {activeTab === 'write' ? (
                            <div className="space-y-4">
                                <p className="text-sm text-muted-foreground">
                                    Write freely — AI will analyze and classify your task automatically.
                                </p>
                                <textarea
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    placeholder="e.g., Need to review Sarah's IBD manuscript by Friday. She's waiting for feedback on the methodology section..."
                                    disabled={isPending}
                                    className="w-full h-48 p-4 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                                />
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <p className="text-sm text-muted-foreground text-center">
                                    Tap the microphone and speak your task. You can record multiple times to add more content.
                                </p>

                                <AudioRecorder
                                    onTranscription={handleTranscription}
                                    disabled={isPending}
                                />

                                {content && (
                                    <div className="space-y-2">
                                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Transcribed Text</p>
                                        <div className="p-3 rounded-lg bg-secondary border border-border">
                                            <p className="text-sm text-foreground whitespace-pre-wrap">{content}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Error */}
                        {error && (
                            <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                                <p className="text-sm text-red-400">{error}</p>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-border">
                        <button
                            onClick={handleSubmit}
                            disabled={isPending || !content.trim() || success}
                            className={`w-full py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-all ${success
                                    ? 'bg-emerald-500 text-white'
                                    : 'bg-primary hover:bg-primary/90 text-white'
                                } ${(isPending || !content.trim()) && !success ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {success ? (
                                <>
                                    <Check size={20} />
                                    Task Added!
                                </>
                            ) : isPending ? (
                                <>
                                    <Loader2 size={20} className="animate-spin" />
                                    Analyzing...
                                </>
                            ) : (
                                <>
                                    <Sparkles size={20} />
                                    Analyze & Add Task
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </>
    )
}
