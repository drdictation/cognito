
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function debug() {
    console.log('Fetching last modified approved task...')
    const { data: task, error } = await supabase
        .from('inbox_queue')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

    if (error) {
        console.error(error)
        return
    }

    console.log('Task:', {
        id: task.id,
        subject: task.subject,
        deadline: task.deadline,
        user_deadline: task.user_deadline,
        ai_inferred_deadline: task.ai_inferred_deadline,
        created_at: task.created_at
    })

    const { data: sessions } = await supabase
        .from('task_sessions')
        .select('*')
        .eq('parent_task_id', task.id)
        .order('session_number', { ascending: true })

    console.log(`Found ${sessions?.length} sessions:`)
    sessions?.forEach(s => {
        console.log(`Session ${s.session_number}:`, {
            title: s.title,
            cadence: s.cadence_days,
            scheduled_start: s.scheduled_start,
            scheduled_end: s.scheduled_end,
            status: s.status
        })
    })

    // Simulate Math
    if (sessions && sessions.length > 0) {
        console.log('\n--- Simulation ---')
        const cadence = sessions[0].cadence_days || 3
        const deadline = task.user_deadline
            ? new Date(task.user_deadline)
            : task.deadline
                ? new Date(task.deadline)
                : task.ai_inferred_deadline
                    ? new Date(task.ai_inferred_deadline)
                    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

        console.log('Deadline Date:', deadline.toString())

        sessions.forEach((s, i) => {
            const daysBefore = (sessions.length - 1 - i) * cadence
            const target = new Date(deadline)
            target.setDate(target.getDate() - daysBefore)
            console.log(`Session ${i + 1} Target: ${target.toDateString()} (${daysBefore} days before)`)
        })
    }
}

debug()
