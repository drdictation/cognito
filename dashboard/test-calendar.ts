/**
 * Test script for Calendar Service
 * Run with: npx tsx test-calendar.ts
 */

import { scheduleTask, createTimeBlockEvent } from './lib/services/calendar'
import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import * as fs from 'fs'
import * as path from 'path'

// Redefine getCalendarClient here to debug credential loading
const CREDENTIALS_PATH = path.join(process.cwd(), '..', 'credentials.json')
const TOKEN_PATH = path.join(process.cwd(), '..', 'token.json')

async function testCalendar() {
    console.log('--- STARTING CALENDAR DEBUG ---')
    console.log('Current Time:', new Date().toLocaleString())
    console.log('Credentials Path:', CREDENTIALS_PATH)
    console.log('Token Path:', TOKEN_PATH)

    if (!fs.existsSync(CREDENTIALS_PATH)) console.error('❌ Credentials missing!')
    if (!fs.existsSync(TOKEN_PATH)) console.error('❌ Token missing!')

    console.log('\n--- ATTEMPTING TO SCHEDULE TEST TASK ---')
    try {
        const result = await scheduleTask(
            'test-task-id',
            'Debug Calendar Integration',
            'Admin',
            'Testing why calendar events are not appearing',
            'Check logs and API responses',
            30, // 30 mins
            'https://trello.com/c/example'
        )

        if (result) {
            console.log('✅ SUCCESS! Event created:')
            console.log('Event URL:', result.eventUrl)
            console.log('Start:', result.scheduledStart)
            console.log('End:', result.scheduledEnd)
        } else {
            console.error('❌ FAILED: No event created (returned null)')
        }
    } catch (e) {
        console.error('❌ EXCEPTION:', e)
    }
}

testCalendar()
