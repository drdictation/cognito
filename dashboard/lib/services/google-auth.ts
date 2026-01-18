/**
 * Shared Google OAuth Authentication
 * Provides authenticated clients for Calendar and Gmail APIs
 * Uses environment variables instead of filesystem for Vercel compatibility
 */

import { google, calendar_v3, gmail_v1 } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'

/**
 * Get authenticated Google Calendar client
 */
export async function getCalendarClient(): Promise<calendar_v3.Calendar | null> {
    try {
        const clientId = process.env.GOOGLE_CLIENT_ID
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET
        const refreshToken = process.env.GOOGLE_REFRESH_TOKEN

        if (!clientId || !clientSecret || !refreshToken) {
            console.error('Missing Google OAuth credentials in environment variables')
            console.error('Required: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN')
            return null
        }

        const auth = new OAuth2Client(clientId, clientSecret)

        auth.setCredentials({
            refresh_token: refreshToken
        })

        return google.calendar({ version: 'v3', auth })
    } catch (e) {
        console.error('Failed to initialize calendar client:', e)
        return null
    }
}

/**
 * Get authenticated Gmail client
 */
export async function getGmailClient(): Promise<gmail_v1.Gmail | null> {
    try {
        const clientId = process.env.GOOGLE_CLIENT_ID
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET
        const refreshToken = process.env.GOOGLE_REFRESH_TOKEN

        if (!clientId || !clientSecret || !refreshToken) {
            console.error('Missing Google OAuth credentials in environment variables')
            console.error('Required: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN')
            return null
        }

        const auth = new OAuth2Client(clientId, clientSecret)

        auth.setCredentials({
            refresh_token: refreshToken
        })

        return google.gmail({ version: 'v1', auth })
    } catch (e) {
        console.error('Failed to initialize Gmail client:', e)
        return null
    }
}
