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
    attachments: EmailAttachment[]
}

export interface EmailAttachment {
    filename: string
    mimeType: string
    size: number
    attachmentId: string
}


// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GmailPart = any

/**
 * Recursively extract text content from email parts.
 * Handles nested multipart MIME structures (common in forwarded emails).
 * Prefers text/plain, falls back to text/html (stripped of tags).
 */
function extractTextFromParts(part: GmailPart | null | undefined): string {
    if (!part) return ''

    // If this part has direct body data
    if (part.body?.data) {
        const content = Buffer.from(part.body.data, 'base64').toString('utf-8')

        if (part.mimeType === 'text/plain') {
            return content
        } else if (part.mimeType === 'text/html') {
            // Strip HTML tags as a fallback
            return content
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                .replace(/<[^>]+>/g, '')
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/\s+/g, ' ')
                .trim()
        }
    }

    // Recursively search nested parts
    if (part.parts && Array.isArray(part.parts)) {
        // First pass: look for text/plain
        for (const subPart of part.parts) {
            if (subPart.mimeType === 'text/plain' && subPart.body?.data) {
                return Buffer.from(subPart.body.data, 'base64').toString('utf-8')
            }
        }

        // Second pass: recursively search each part (for deeply nested structures)
        for (const subPart of part.parts) {
            const text = extractTextFromParts(subPart)
            if (text) return text
        }
    }

    return ''
}

/**
 * Extract attachments from email parts
 */
function extractAttachments(part: GmailPart | null | undefined, attachments: EmailAttachment[] = []): EmailAttachment[] {
    if (!part) return attachments

    // Check if this part is an attachment
    if (part.filename && part.body?.attachmentId) {
        attachments.push({
            filename: part.filename,
            mimeType: part.mimeType || 'application/octet-stream',
            size: part.body.size || 0,
            attachmentId: part.body.attachmentId
        })
    }

    // Recursively search nested parts
    if (part.parts && Array.isArray(part.parts)) {
        for (const subPart of part.parts) {
            extractAttachments(subPart, attachments)
        }
    }

    return attachments
}

/**
 * Fetch unprocessed emails (either unread or subject:COGNITO, without processed label)
 */
export async function fetchUnprocessedEmails(maxResults: number = 50): Promise<Email[]> {
    const gmail = await getGmailClient()
    if (!gmail) {
        console.error('Gmail client not available')
        return []
    }

    try {
        const query = '(is:unread OR subject:COGNITO) -label:Cognito-Processed'
        const response = await gmail.users.messages.list({
            userId: 'me',
            q: query,
            maxResults
        })

        const messages = response.data.messages || []
        console.log(`Found ${messages.length} unprocessed emails with query: ${query}`)

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

        // Extract body using recursive helper for nested multipart emails
        const body = extractTextFromParts(message.payload) || ''

        // Extract attachments
        const attachments = extractAttachments(message.payload)

        return {
            id: messageId,
            message_id: headers['Message-ID'] || messageId,
            subject: headers['Subject'] || 'No Subject',
            from: headers['From'] || 'Unknown',
            date: headers['Date'] || '',
            body,
            headers,
            attachments
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

/**
 * Ensures the Cognito-Processed label exists, creates it if not, and returns its ID
 */
export async function getOrCreateProcessedLabel(): Promise<string | null> {
    const gmail = await getGmailClient()
    if (!gmail) return null

    try {
        const res = await gmail.users.labels.list({ userId: 'me' })
        const labels = res.data.labels || []
        const existing = labels.find(l => l.name === 'Cognito-Processed')

        if (existing && existing.id) {
            return existing.id
        }

        const createRes = await gmail.users.labels.create({
            userId: 'me',
            requestBody: {
                name: 'Cognito-Processed',
                labelListVisibility: 'labelShow',
                messageListVisibility: 'show'
            }
        })
        return createRes.data.id || null
    } catch (error) {
        console.error('Error getting/creating Cognito-Processed label:', error)
        return null
    }
}

/**
 * Adds the Cognito-Processed label to an email (and marks as read)
 */
export async function labelEmailAsProcessed(messageId: string): Promise<void> {
    const gmail = await getGmailClient()
    if (!gmail) return

    try {
        const labelId = await getOrCreateProcessedLabel()
        if (!labelId) {
            console.error('Could not get label ID to process email')
            await markEmailAsRead(messageId) // Fallback
            return
        }

        await gmail.users.messages.modify({
            userId: 'me',
            id: messageId,
            requestBody: {
                addLabelIds: [labelId],
                removeLabelIds: ['UNREAD']
            }
        })
        console.log(`Applied Cognito-Processed label to email ${messageId}`)
    } catch (error) {
        console.error(`Error applying processed label to ${messageId}:`, error)
        await markEmailAsRead(messageId) // Fallback
    }
}
