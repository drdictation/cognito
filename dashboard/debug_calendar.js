// Debug script to check calendar scheduling issues

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manually load env vars
const envPath = path.resolve(__dirname, '..', '.env');
const envLocalPath = path.resolve(__dirname, '.env.local');
const envConfig = {};

// Load .env.local first (dashboard-specific), then .env (root)
for (const p of [envLocalPath, envPath]) {
    if (fs.existsSync(p)) {
        const envContent = fs.readFileSync(p, 'utf-8');
        envContent.split('\n').forEach(line => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                envConfig[match[1].trim()] = match[2].trim().replace(/^['"](.*)['"]$/, '$1');
            }
        });
    }
}

const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL || envConfig.SUPABASE_URL;
const supabaseKey = envConfig.SUPABASE_SERVICE_ROLE_KEY || envConfig.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    console.log('Available keys:', Object.keys(envConfig));
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
    console.log('=== CALENDAR SCHEDULING DEBUG ===\n');

    // 1. Check scheduling_windows table
    console.log('1. SCHEDULING WINDOWS:');
    const { data: windows, error: windowsError } = await supabase
        .from('scheduling_windows')
        .select('*')
        .eq('is_active', true)
        .order('day_of_week', { ascending: true });

    if (windowsError) {
        console.log('   Error:', windowsError.message);
        if (windowsError.code === '42P01') {
            console.log('   TABLE DOES NOT EXIST - This explains why no calendar events are created!');
        }
    } else {
        console.log(`   Found ${windows?.length || 0} active windows`);
        windows?.forEach(w => {
            console.log(`   - Day ${w.day_of_week}: ${w.name} (${w.start_time} - ${w.end_time})`);
        });
    }
    console.log('');

    // 2. Check cognito_events table
    console.log('2. COGNITO_EVENTS TABLE (recent):');
    const { data: cognitoEvents, error: eventsError } = await supabase
        .from('cognito_events')
        .select('id, title, scheduled_start, priority, is_active')
        .order('created_at', { ascending: false })
        .limit(5);

    if (eventsError) {
        console.log('   Error:', eventsError.message);
        if (eventsError.code === '42P01') {
            console.log('   TABLE DOES NOT EXIST');
        }
    } else {
        console.log(`   Found ${cognitoEvents?.length || 0} recent events`);
        cognitoEvents?.forEach(e => {
            console.log(`   - ${e.title} | ${e.scheduled_start} | ${e.priority} | active=${e.is_active}`);
        });
    }
    console.log('');

    // 3. Check recent approved tasks
    console.log('3. RECENTLY APPROVED TASKS:');
    const { data: approvedTasks, error: tasksError } = await supabase
        .from('inbox_queue')
        .select('id, subject, status, execution_status, calendar_event_id, trello_card_id, scheduled_start')
        .eq('status', 'approved')
        .order('processed_at', { ascending: false })
        .limit(10);

    if (tasksError) {
        console.log('   Error:', tasksError.message);
    } else {
        console.log(`   Found ${approvedTasks?.length || 0} approved tasks`);
        approvedTasks?.forEach(t => {
            console.log(`   - ${t.subject?.substring(0, 50)}`);
            console.log(`     Status: ${t.execution_status || 'not executed'}`);
            console.log(`     Trello: ${t.trello_card_id ? 'YES' : 'NO'}`);
            console.log(`     Calendar: ${t.calendar_event_id ? 'YES' : 'NO'}`);
            if (t.scheduled_start) {
                console.log(`     Scheduled: ${t.scheduled_start}`);
            }
            console.log('');
        });
    }

    // 4. Check Google OAuth credentials
    console.log('4. GOOGLE OAUTH CREDENTIALS:');
    console.log(`   GOOGLE_CLIENT_ID: ${envConfig.GOOGLE_CLIENT_ID ? 'SET' : 'MISSING'}`);
    console.log(`   GOOGLE_CLIENT_SECRET: ${envConfig.GOOGLE_CLIENT_SECRET ? 'SET' : 'MISSING'}`);
    console.log(`   GOOGLE_REFRESH_TOKEN: ${envConfig.GOOGLE_REFRESH_TOKEN ? 'SET' : 'MISSING'}`);
    console.log('');

    // 5. Check protected_calendars table
    console.log('5. PROTECTED_CALENDARS:');
    const { data: protectedCals, error: protectedError } = await supabase
        .from('protected_calendars')
        .select('*');

    if (protectedError) {
        console.log('   Error:', protectedError.message);
        if (protectedError.code === '42P01') {
            console.log('   TABLE DOES NOT EXIST');
        }
    } else {
        console.log(`   Found ${protectedCals?.length || 0} protected calendars`);
        protectedCals?.forEach(c => {
            console.log(`   - ${c.calendar_name}`);
        });
    }
}

debug().catch(console.error);
