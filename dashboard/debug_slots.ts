
import { google, calendar_v3 } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import * as fs from 'fs'
import * as path from 'path'

// LOGIC COPY FROM calendar.ts
const WORK_START_HOUR = 20  // 8pm
const WORK_END_HOUR = 21    // 9pm
const WORK_END_MINUTE = 30  // 9:30pm
const TIMEZONE = 'Australia/Melbourne'
const WORK_DAYS = [0, 1, 2, 3, 4]

// Path to credentials (relative to project root)
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json')
const TOKEN_PATH = path.join(process.cwd(), 'token.json')

function getMelbourneHour(date: Date): number {
    return parseInt(date.toLocaleString('en-AU', {
        timeZone: TIMEZONE,
        hour: 'numeric',
        hour12: false
    }))
}

function getMelbourneDayOfWeek(date: Date): number {
    const dayStr = date.toLocaleString('en-AU', {
        timeZone: TIMEZONE,
        weekday: 'short'
    })
    const days: Record<string, number> = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 }
    return days[dayStr] ?? 0
}

async function getCalendarClient(): Promise<calendar_v3.Calendar | null> {
    try {
        if (!fs.existsSync(CREDENTIALS_PATH) || !fs.existsSync(TOKEN_PATH)) {
            console.error('Credentials/Token not found')
            return null
        }
        const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'))
        const clientConfig = credentials.installed || credentials.web
        const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'))

        const auth = new OAuth2Client(clientConfig.client_id, clientConfig.client_secret, credentials.installed?.redirect_uris?.[0])
        auth.setCredentials({ access_token: token.token, refresh_token: token.refresh_token, expiry_date: token.expiry ? new Date(token.expiry).getTime() : undefined })

        return google.calendar({ version: 'v3', auth })
    } catch (e) { console.error(e); return null }
}

async function main() {
    console.log("=== CALENDAR SLOT DEBUGGER ===")
    console.log(`System Time: ${new Date().toString()}`)
    console.log(`Melbourne Time: ${new Date().toLocaleString('en-AU', { timeZone: TIMEZONE })}`)

    const calendar = await getCalendarClient()
    if (!calendar) return

    const now = new Date()
    const searchDays = 14
    const searchEnd = new Date(now)
    searchEnd.setDate(searchEnd.getDate() + searchDays)

    console.log(`\nFetching busy times from ${now.toISOString()} to ${searchEnd.toISOString()}...`)

    // 1. Get Busy Times
    const calendarListRes = await calendar.calendarList.list()
    const calendars = calendarListRes.data.items || []
    const calendarIds = calendars.filter(c => c.id).map(c => ({ id: c.id! }))
    if (calendarIds.length === 0) calendarIds.push({ id: 'primary' })

    const freeBusyRes = await calendar.freebusy.query({
        requestBody: {
            timeMin: now.toISOString(),
            timeMax: searchEnd.toISOString(),
            items: calendarIds
        }
    })

    const busyTimes: { start: Date, end: Date }[] = []
    const calendarsData = freeBusyRes.data.calendars || {}
    for (const calId of Object.keys(calendarsData)) {
        const calData = calendarsData[calId]
        for (const busy of calData.busy || []) {
            if (busy.start && busy.end) {
                busyTimes.push({ start: new Date(busy.start), end: new Date(busy.end) })
            }
        }
    }
    busyTimes.sort((a, b) => a.start.getTime() - b.start.getTime())

    console.log(`Found ${busyTimes.length} busy blocks.`)
    busyTimes.forEach(b => console.log(`BUSY: ${b.start.toLocaleString('en-AU', { timeZone: TIMEZONE })} - ${b.end.toLocaleString('en-AU', { timeZone: TIMEZONE })}`))

    // 2. Simulate Slot Finding
    console.log("\n--- Simulating Logic ---")
    let current = new Date(now)
    current.setMinutes(Math.ceil(current.getMinutes() / 30) * 30, 0, 0)

    const durationMinutes = 30
    const durationMs = durationMinutes * 60 * 1000

    let checks = 0
    while (current < searchEnd && checks < 100) {  // Limit output
        const melbourneHour = getMelbourneHour(current)
        const melbourneDayOfWeek = getMelbourneDayOfWeek(current)

        const debugTime = current.toLocaleString('en-AU', { timeZone: TIMEZONE })

        console.log(`Checking: ${debugTime} (Day: ${melbourneDayOfWeek}, Hour: ${melbourneHour})`)

        if (!WORK_DAYS.includes(melbourneDayOfWeek)) {
            console.log(`  -> SKIP: Non-work day (${melbourneDayOfWeek})`)
            current.setDate(current.getDate() + 1)
            current.setHours(WORK_START_HOUR, 0, 0, 0)
            continue
        }

        if (melbourneHour < WORK_START_HOUR) {
            console.log(`  -> SKIP: Too early`)
            current.setHours(current.getHours() + (WORK_START_HOUR - melbourneHour), 0, 0, 0)
            continue
        }

        if (melbourneHour > WORK_END_HOUR || (melbourneHour === WORK_END_HOUR && current.getMinutes() >= WORK_END_MINUTE)) {
            console.log(`  -> SKIP: Too late`)
            current.setDate(current.getDate() + 1)
            current.setHours(WORK_START_HOUR, 0, 0, 0)
            continue
        }

        const slotEnd = new Date(current.getTime() + durationMs)
        const slotEndMelbourneHour = getMelbourneHour(slotEnd)
        const slotEndMinute = slotEnd.getMinutes()

        if (slotEndMelbourneHour > WORK_END_HOUR ||
            (slotEndMelbourneHour === WORK_END_HOUR && slotEndMinute > WORK_END_MINUTE)) {
            console.log(`  -> SKIP: Ends too late`)
            current.setDate(current.getDate() + 1)
            current.setHours(WORK_START_HOUR, 0, 0, 0)
            continue
        }

        let hasConflict = false
        for (const busy of busyTimes) {
            if (current < busy.end && slotEnd > busy.start) {
                console.log(`  -> CONFLICT with busy slot: ${busy.start.toLocaleString('en-AU', { timeZone: TIMEZONE })}`)
                hasConflict = true
                current = new Date(busy.end)
                break
            }
        }

        if (!hasConflict) {
            console.log(`\n✅ FOUND VALID SLOT: ${current.toLocaleString('en-AU', { timeZone: TIMEZONE })}`)
            return
        }

        checks++
    }
}

main().catch(console.error)
