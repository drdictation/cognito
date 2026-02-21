import { NextRequest, NextResponse } from 'next/server'
import { processEmails } from '@/lib/services/ingestion'

function getBearerToken(req: NextRequest): string | null {
    const header = req.headers.get('authorization') || ''
    if (!header.toLowerCase().startsWith('bearer ')) return null
    return header.slice('bearer '.length).trim() || null
}

function isAuthorized(req: NextRequest): { ok: boolean; error?: string } {
    const secret = process.env.CRON_SECRET

    // In production we require a secret to avoid exposing ingestion publicly.
    if (process.env.NODE_ENV === 'production' && !secret) {
        return { ok: false, error: 'CRON_SECRET is not configured' }
    }

    // If no secret is configured (local/dev), allow the call.
    if (!secret) return { ok: true }

    const token = getBearerToken(req) || req.nextUrl.searchParams.get('token')
    if (!token) return { ok: false, error: 'Missing token' }
    if (token !== secret) return { ok: false, error: 'Invalid token' }
    return { ok: true }
}

export async function GET(req: NextRequest) {
    const auth = isAuthorized(req)
    if (!auth.ok) {
        return NextResponse.json(
            { success: false, error: auth.error || 'Unauthorized' },
            { status: auth.error === 'CRON_SECRET is not configured' ? 500 : 401 }
        )
    }

    const startedAt = Date.now()
    try {
        const result = await processEmails()
        return NextResponse.json({
            success: result.success,
            message: result.message,
            stats: {
                processed: result.processed,
                blocked: result.blocked,
                errors: result.errors,
            },
            duration_ms: Date.now() - startedAt,
            ran_at: new Date().toISOString(),
        })
    } catch (error: unknown) {
        console.error('Cron ingestion failed:', error)
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Cron ingestion failed' },
            { status: 500 }
        )
    }
}
