// Query approved tasks to check Trello/Calendar status
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^['"](.*)['"]$/, '$1');
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function query() {
    const { data, error } = await supabase
        .from('inbox_queue')
        .select('id, subject, status, execution_status, calendar_event_id, trello_card_id, ai_priority')
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.log('Error:', error);
        return;
    }

    console.log('=== APPROVED TASKS ===\n');
    let withCal = 0, noCal = 0, withTrello = 0;

    data.forEach(t => {
        const hasCal = !!t.calendar_event_id;
        const hasTrello = !!t.trello_card_id;
        if (hasCal) withCal++; else noCal++;
        if (hasTrello) withTrello++;

        console.log(`${t.subject?.substring(0, 50)}`);
        console.log(`  Priority: ${t.ai_priority || 'unknown'}`);
        console.log(`  Execution: ${t.execution_status || 'N/A'}`);
        console.log(`  Trello: ${hasTrello ? 'YES' : 'NO'}`);
        console.log(`  Calendar: ${hasCal ? 'YES' : 'NO'}`);
        console.log('');
    });

    console.log('=== SUMMARY ===');
    console.log(`Total: ${data.length}`);
    console.log(`With Trello: ${withTrello}`);
    console.log(`With Calendar: ${withCal}`);
    console.log(`WITHOUT Calendar: ${noCal}`);
}

query().catch(console.error);
