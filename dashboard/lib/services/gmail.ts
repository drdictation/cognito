/**
 * Gmail API Service
 * Handles email fetching and operations
 */

import { getGmailClient } from './google-auth'

export interface Email {
    id: string
    message_id: string
    subject: string
    from: string
    date: string
    body: string
    headers: Record<string, string>
}

/**
 * Fetch unread emails from Gmail
 */
export async function fetchUnreadEmails(maxResults: number = 50): Promise<Email[]> {
    const gmail = await getGmailClient()
    if (!gmail) {
        console.error('Gmail client not available')
        return []
    }

    try {
        const response = await gmail.users.messages.list({
            userId: 'me',
            q: 'is:unread',
            maxResults
        })

        const messages = response.data.messages || []
        console.log(`Found ${messages.length} unread emails`)

        const emails: Email[] = []
        for (const msg of messages) {
            if (msg.id) {
                const email = await getEmailDetails(msg.id)
                if (email) {
                    emails.push(email)
                }
            }
        }

        return emails
    } catch (error) {
        console.error('Gmail API error:', error)
        return []
    }
}

/**
 * Get email details from Gmail message
 */
export async function getEmailDetails(messageId: string): Promise<Email | null> {
    const gmail = await getGmailClient()
    if (!gmail) {
        return null
    }

    try {
        const response = await gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full'
        })

        const message = response.data
        const headers: Record<string, string> = {}

        if (message.payload?.headers) {
            for (const header of message.payload.headers) {
                if (header.name && header.value) {
                    headers[header.name] = header.value
                }
            }
        }

        // Extract body
        let body = ''
        if (message.payload?.parts) {
            for (const part of message.payload.parts) {
                if (part.mimeType === 'text/plain' && part.body?.data) {
                    body = Buffer.from(part.body.data, 'base64').toString('utf-8')
                    break
                }
            }
        } else if (message.payload?.body?.data) {
            body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8')
        }

        return {
            id: messageId,
            message_id: headers['Message-ID'] || messageId,
            subject: headers['Subject'] || 'No Subject',
            from: headers['From'] || 'Unknown',
            date: headers['Date'] || '',
            body,
            headers
        }
    } catch (error) {
        console.error(`Error fetching email ${messageId}:`, error)
        return null
    }
}

/**
 * Mark email as read in Gmail
 */
export async function markEmailAsRead(messageId: string): Promise<void> {
    const gmail = await getGmailClient()
    if (!gmail) {
        return
    }

    try {
        await gmail.users.messages.modify({
            userId: 'me',
            id: messageId,
            requestBody: {
                removeLabelIds: ['UNREAD']
            }
        })
        console.log(`Marked email ${messageId} as read`)
    } catch (error) {
        console.error('Error marking email as read:', error)
    }
}
