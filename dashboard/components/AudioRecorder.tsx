'use client'

import { useState, useRef, useEffect } from 'react'
import { Mic, Square, Loader2 } from 'lucide-react'

interface AudioRecorderProps {
    onTranscription: (text: string) => void
    disabled?: boolean
}

export function AudioRecorder({ onTranscription, disabled }: AudioRecorderProps) {
    const [isRecording, setIsRecording] = useState(false)
    const [isTranscribing, setIsTranscribing] = useState(false)
    const [duration, setDuration] = useState(0)
    const [error, setError] = useState<string | null>(null)

    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const chunksRef = useRef<Blob[]>([])
    const timerRef = useRef<NodeJS.Timeout | null>(null)

    useEffect(() => {
        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current)
            }
            if (mediaRecorderRef.current && isRecording) {
                mediaRecorderRef.current.stop()
            }
        }
    }, [isRecording])

    const startRecording = async () => {
        try {
            setError(null)
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            })

            mediaRecorderRef.current = mediaRecorder
            chunksRef.current = []

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data)
                }
            }

            mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(track => track.stop())

                if (chunksRef.current.length > 0) {
                    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
                    await transcribeAudio(blob)
                }
            }

            mediaRecorder.start(1000) // Collect chunks every second
            setIsRecording(true)
            setDuration(0)

            timerRef.current = setInterval(() => {
                setDuration(d => d + 1)
            }, 1000)

        } catch (err) {
            console.error('Failed to start recording:', err)
            setError('Could not access microphone. Please check permissions.')
        }
    }

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop()
            setIsRecording(false)

            if (timerRef.current) {
                clearInterval(timerRef.current)
                timerRef.current = null
            }
        }
    }

    const transcribeAudio = async (blob: Blob) => {
        setIsTranscribing(true)
        setError(null)

        try {
            const formData = new FormData()
            formData.append('audio', blob, 'recording.webm')

            const response = await fetch('/api/transcribe', {
                method: 'POST',
                body: formData,
            })

            const result = await response.json()

            if (!response.ok) {
                throw new Error(result.error || 'Transcription failed')
            }

            if (result.text) {
                onTranscription(result.text)
            } else {
                setError('No speech detected. Please try again.')
            }

        } catch (err) {
            console.error('Transcription error:', err)
            setError(err instanceof Error ? err.message : 'Transcription failed')
        } finally {
            setIsTranscribing(false)
        }
    }

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    return (
        <div className="flex flex-col items-center gap-4">
            {/* Recording Button */}
            <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={disabled || isTranscribing}
                className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all ${isRecording
                        ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                        : 'bg-primary hover:bg-primary/90'
                    } ${(disabled || isTranscribing) ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                {isTranscribing ? (
                    <Loader2 size={32} className="text-white animate-spin" />
                ) : isRecording ? (
                    <Square size={28} className="text-white" />
                ) : (
                    <Mic size={32} className="text-white" />
                )}

                {/* Pulse ring when recording */}
                {isRecording && (
                    <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-50" />
                )}
            </button>

            {/* Status Text */}
            <div className="text-center">
                {isTranscribing ? (
                    <p className="text-muted-foreground">Transcribing...</p>
                ) : isRecording ? (
                    <div>
                        <p className="text-red-400 font-medium">Recording</p>
                        <p className="text-2xl font-mono text-foreground">{formatDuration(duration)}</p>
                    </div>
                ) : (
                    <p className="text-muted-foreground">Tap to start recording</p>
                )}
            </div>

            {/* Error Message */}
            {error && (
                <p className="text-sm text-red-400 text-center max-w-xs">{error}</p>
            )}
        </div>
    )
}
