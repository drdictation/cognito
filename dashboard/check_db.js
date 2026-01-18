
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manually load env vars
const envPath = path.resolve(__dirname, '..', '.env');
const envConfig = {};
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            envConfig[match[1].trim()] = match[2].trim().replace(/^['"](.*)['"]$/, '$1');
        }
    });
}

const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL || envConfig.SUPABASE_URL;
const supabaseKey = envConfig.SUPABASE_SERVICE_ROLE_KEY || envConfig.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env');
    console.log('Available keys:', Object.keys(envConfig));
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkEvents() {
    console.log('Checking database table detected_events...');

    try {
        const { count, error } = await supabase
            .from('detected_events')
            .select('*', { count: 'exact', head: true });

        if (error) {
            console.error('Error querying table detected_events:', error.message);

            // If table doesn't exist, code is usually '42P01'
            if (error.code === '42P01') {
                console.log('TABLE DOES NOT EXIST. Migration needed.');
            }
            return;
        }
        console.log(`Table exists. Total rows: ${count}`);

        // Search for the specific task about ward rounds
        console.log('\nSearching for ward round tasks...');
        const { data: tasks, error: taskError } = await supabase
            .from('inbox_queue')
            .select('id, subject, status, ai_assessment')
            .ilike('subject', '%ward round%')
            .order('created_at', { ascending: false })
            .limit(5);

        if (taskError) {
            console.error('Error searching tasks:', taskError);
        } else {
            console.log(`Found ${tasks.length} related tasks:`);
            for (const task of tasks) {
                console.log(`- Task ID: ${task.id}`);
                console.log(`  Subject: ${task.subject}`);
                console.log(`  Status: ${task.status}`);

                // Check if events are in the JSON
                const assessment = task.ai_assessment;
                const jsonEvents = assessment?.detected_events || [];
                console.log(`  Detected events in JSON: ${jsonEvents.length}`);

                // Check if events exist in the table for this task
                const { data: savedEvents, error: eventError } = await supabase
                    .from('detected_events')
                    .select('*')
                    .eq('task_id', task.id);

                if (eventError) {
                    console.log(`  Error fetching saved events: ${eventError.message}`);
                } else {
                    console.log(`  Saved events in 'detected_events' table: ${savedEvents?.length || 0}`);
                    if (savedEvents?.length > 0) {
                        savedEvents.forEach(e => {
                            console.log(`    - [${e.status}] ${e.title} (${e.proposed_start})`);
                        });
                    }
                }
                console.log('');
            }
        }

    } catch (e) {
        console.error('Unexpected error:', e);
    }
}

checkEvents();
