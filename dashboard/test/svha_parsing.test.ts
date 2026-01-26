
import { describe, it, expect } from 'bun:test';

function cleanForwardedContent(subject: string, body: string): { subject: string, body: string } {
    let cleanSubject = subject;
    let cleanBody = body;

    // 1. Clean Subject
    // Remove "FW: " or "Fwd: " case insensitive from start
    cleanSubject = cleanSubject.replace(/^(FW|Fwd):\s*/i, '').trim();

    // 2. Clean Body
    // Common separators
    // Outlook/Exchange often uses:
    // From: Sender <email>
    // Sent: Date
    // To: Recipient
    // Subject: Original Subject

    // We want to remove everything from the start up to the end of the headers.
    // The "From:" line is the start of the forwarded block.
    // The "Subject:" line is usually the last part of the header block.

    // Strategy: Find the "From:" line that starts the forwarding block.
    // Remove everything before it and the header block itself.

    const forwardHeaderPattern = /From:\s*.*?\n(?:Sent|Date):\s*.*?\nTo:\s*.*?\nSubject:\s*.*?\n/s;

    const match = cleanBody.match(forwardHeaderPattern);

    if (match) {
        // Found the block.
        // We want to remove this block AND everything before it (which is usually the forwarder's signature or empty space)

        // Find the index of the match
        const index = match.index;

        if (index !== undefined) {
            // Remove everything up to the end of the matched string
            const endOfMatch = index + match[0].length;
            cleanBody = cleanBody.substring(endOfMatch).trim();
        }
    }

    return { subject: cleanSubject, body: cleanBody };
}

describe('SVHA Email Cleaning', () => {
    it('should clean SVHA forwarded email', () => {
        const originalSubject = "FW: Chamara, we found new jobs you may be interested in";
        const originalBody = `
Chamara Basnayake - SVHM
2:32 PM (11 minutes ago)
to me

From: ResearchGate <no-reply@researchgatemail.net>
Sent: Monday, January 26, 2026 3:31:46 AM
To: Chamara Basnayake - SVHM <Chamara.BASNAYAKE@svha.org.au>
Subject: Chamara, we found new jobs you may be interested in
 
 
ResearchGate	
 
 

 
New jobs in your field
`;

        const { subject, body } = cleanForwardedContent(originalSubject, originalBody);

        expect(subject).toBe("Chamara, we found new jobs you may be interested in");
        expect(body).toContain("New jobs in your field");
        expect(body).not.toContain("From: ResearchGate");
        expect(body).not.toContain("Chamara Basnayake - SVHM");
    });
});
