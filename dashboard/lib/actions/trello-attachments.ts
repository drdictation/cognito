'use server'

import { getGmailClient } from '@/lib/services/google-auth'

/**
 * Phase 10: Trello Attachment Upload
 * Downloads attachments from Gmail and uploads them to Trello cards
 */

const TRELLO_API_KEY = process.env.TRELLO_API_KEY
const TRELLO_TOKEN = process.env.TRELLO_TOKEN
const TRELLO_BASE_URL = 'https://api.trello.com/1'
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024 // 10MB (Trello free tier limit)

interface AttachmentInfo {
    filename: string
    mimeType: string
    size: number
    attachmentId: string
}

export async function uploadAttachmentsToTrello(
    messageId: string,
    cardId: string,
    attachments: AttachmentInfo[]
): Promise<{ uploaded: number; skipped: number; errors: string[] }> {
    const gmail = await getGmailClient()

    if (!gmail) {
        return { uploaded: 0, skipped: 0, errors: ['Gmail client not available'] }
    }

    if (!TRELLO_API_KEY || !TRELLO_TOKEN) {
        return { uploaded: 0, skipped: 0, errors: ['Trello credentials not configured'] }
    }

    let uploaded = 0
    let skipped = 0
    const errors: string[] = []

    for (const attachment of attachments) {
        try {
            // Skip large files
            if (attachment.size > MAX_ATTACHMENT_SIZE) {
                console.warn(`Skipping large attachment: ${attachment.filename} (${(attachment.size / 1024 / 1024).toFixed(2)}MB)`)
                skipped++
                errors.push(`${attachment.filename}: Too large (${(attachment.size / 1024 / 1024).toFixed(2)}MB > 10MB)`)
                continue
            }

            // Download attachment from Gmail
            const response = await gmail.users.messages.attachments.get({
                userId: 'me',
                messageId: messageId,
                id: attachment.attachmentId
            })

            if (!response.data.data) {
                errors.push(`${attachment.filename}: No data received from Gmail`)
                continue
            }

            // Convert base64url to base64
            const base64Data = response.data.data.replace(/-/g, '+').replace(/_/g, '/')
            const buffer = Buffer.from(base64Data, 'base64')

            // Create form data for Trello upload
            const formData = new FormData()
            const blob = new Blob([buffer], { type: attachment.mimeType })
            formData.append('file', blob, attachment.filename)
            formData.append('key', TRELLO_API_KEY!)
            formData.append('token', TRELLO_TOKEN!)

            // Upload to Trello
            const trelloResponse = await fetch(
                `${TRELLO_BASE_URL}/cards/${cardId}/attachments`,
                {
                    method: 'POST',
                    body: formData
                }
            )

            if (trelloResponse.ok) {
                console.log(`Uploaded attachment: ${attachment.filename}`)
                uploaded++
            } else {
                const errorText = await trelloResponse.text()
                errors.push(`${attachment.filename}: Trello upload failed - ${errorText}`)
            }
        } catch (error) {
            console.error(`Error uploading attachment ${attachment.filename}:`, error)
            errors.push(`${attachment.filename}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
    }

    return { uploaded, skipped, errors }
}
