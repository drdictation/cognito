import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData()
        const audioFile = formData.get('audio') as File

        if (!audioFile) {
            return NextResponse.json(
                { error: 'No audio file provided' },
                { status: 400 }
            )
        }

        const groqApiKey = process.env.GROQ_API_KEY
        if (!groqApiKey) {
            console.error('GROQ_API_KEY not configured')
            return NextResponse.json(
                { error: 'Transcription service not configured' },
                { status: 500 }
            )
        }

        // Create form data for Groq API
        const groqFormData = new FormData()
        groqFormData.append('file', audioFile)
        groqFormData.append('model', 'whisper-large-v3')
        groqFormData.append('response_format', 'json')

        // Call Groq Whisper API
        const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${groqApiKey}`,
            },
            body: groqFormData,
        })

        if (!response.ok) {
            const errorText = await response.text()
            console.error('Groq API error:', response.status, errorText)
            return NextResponse.json(
                { error: 'Transcription failed' },
                { status: response.status }
            )
        }

        const result = await response.json()

        return NextResponse.json({
            text: result.text,
            success: true
        })

    } catch (error) {
        console.error('Transcription error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
