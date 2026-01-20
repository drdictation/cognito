export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

// AI Assessment structure from Gemini
export interface DetectedEvent {
    event_type: 'meeting' | 'deadline' | 'appointment' | 'reminder'
    title: string
    proposed_start: string | null  // ISO8601
    proposed_end: string | null     // ISO8601
    duration_minutes: number
    location: string | null
    attendees: string[]
    confidence: number
    source_text: string
}

export interface MultiSessionSuggestion {
    suggested_sessions: number
    session_duration_minutes: number
    cadence_days: number
    rationale: string
}

export interface AIAssessment {
    domain: 'Clinical' | 'Research' | 'Admin' | 'Home' | 'Hobby'
    priority: 'Critical' | 'High' | 'Normal' | 'Low'
    summary: string
    reasoning: string
    suggested_action: string
    estimated_minutes: number
    // Phase 7b: Calendar intelligence
    detected_events?: DetectedEvent[]
    inferred_deadline?: string | null
    deadline_confidence?: number
    deadline_source?: string | null
    // Phase 9b: Multi-session chunking
    multi_session?: MultiSessionSuggestion | null
}

export type TaskStatus = 'pending' | 'approved' | 'rejected' | 'snoozed'
export type Priority = 'Critical' | 'High' | 'Normal' | 'Low'
export type Domain = 'Clinical' | 'Research' | 'Admin' | 'Home' | 'Hobby'

export interface InboxTask {
    id: string
    created_at: string
    message_id: string
    original_source_email: string | null
    real_sender: string
    subject: string | null
    received_at: string | null
    source: string
    original_content: string
    forwarded_from: string | null
    ai_assessment: AIAssessment | null
    ai_domain: Domain | null
    ai_priority: Priority | null
    ai_summary: string | null
    ai_suggested_action: string | null
    ai_estimated_minutes: number | null
    status: TaskStatus
    snoozed_until: string | null
    processing_error: string | null
    retry_count: number
    // Phase 3a: Deadline inference
    ai_inferred_deadline: string | null
    ai_deadline_confidence: number | null
    ai_deadline_source: string | null
    // Phase 7b: Deadline (consolidated)
    deadline: string | null
    deadline_source: 'extracted' | 'default' | 'user_override' | null
    // Phase 9a: Explicit Deadlines
    user_deadline: string | null
    // Phase 3a/3c: Execution tracking
    execution_status: 'pending' | 'scheduled' | 'completed' | 'failed' | null
    trello_card_id: string | null
    trello_card_url: string | null
    executed_at: string | null
    // Phase 3c: Calendar scheduling
    calendar_event_id: string | null
    scheduled_start: string | null
    scheduled_end: string | null
    double_book_warning: string | null // Phase 10: Warning if force-scheduled
    // Phase 4c: Model Tracking
    model_used: string | null
    // Phase 5: Intelligent Drafting
    is_simple_response: boolean
    draft_response: string | null
}

export interface BlocklistEntry {
    id: string
    email_pattern: string
    reason: string | null
    created_at: string
    is_active: boolean
}

export interface DecisionLog {
    id: string
    task_id: string
    ai_prediction: Json
    user_correction: Json | null
    correction_type: string | null
    timestamp: string
}


export interface DomainKnowledge {
    id: string
    domain: Domain
    content: string
    expires_at: string | null
    updated_at: string
}

export interface Contact {
    id: string
    name: string
    email: string | null
    role: string | null
    domain: Domain
    priority_boost: Priority | null
    notes: string | null
    created_at: string
}

export interface KnowledgeSuggestion {
    id: string
    domain: Domain
    suggestion_type: 'contact' | 'priority_rule' | 'general' | null
    suggested_content: string
    source_task_id: string | null
    status: 'pending' | 'approved' | 'rejected'
    created_at: string
}

// Phase 7b: Smart Calendar System
export type EventType = 'meeting' | 'deadline' | 'appointment' | 'reminder'
export type EventStatus = 'pending' | 'approved' | 'rejected' | 'conflict'

export interface DetectedEventRow {
    id: string
    task_id: string
    event_type: EventType
    title: string
    proposed_start: string | null
    proposed_end: string | null
    duration_minutes: number
    location: string | null
    attendees: string[] | null
    is_all_day: boolean
    confidence: number
    source_text: string | null
    status: EventStatus
    conflict_event_id: string | null
    conflict_summary: string | null
    google_event_id: string | null
    created_at: string
}

export interface CognitoEventRow {
    id: string
    task_id: string | null
    google_event_id: string
    title: string
    scheduled_start: string
    scheduled_end: string
    priority: Priority
    deadline: string | null
    original_start: string | null
    original_end: string | null
    bumped_by: string | null
    bump_count: number
    is_active: boolean
    created_at: string
    updated_at: string
}

export interface SchedulingWindow {
    id: string
    name: string
    day_of_week: number  // 0=Sunday, 6=Saturday
    start_time: string   // HH:MM format
    end_time: string     // HH:MM format
    priority_level: 'all' | 'critical_only'
    is_active: boolean
    description: string | null
}

export type SessionStatus = 'pending' | 'scheduled' | 'completed' | 'skipped'

export interface TaskSession {
    id: string
    parent_task_id: string
    session_number: number
    title: string
    duration_minutes: number
    scheduled_start: string | null
    scheduled_end: string | null
    google_event_id: string | null
    status: SessionStatus
    notes: string | null
    priority: Priority  // Phase 10: Last 50% of sessions are Critical
    created_at: string
    updated_at: string
}

export interface ProtectedCalendar {
    id: string
    calendar_name: string
    description: string | null
    created_at: string
}

export interface Database {
    public: {
        Tables: {
            inbox_queue: {
                Row: InboxTask
                Insert: Omit<InboxTask, 'id' | 'created_at'>
                Update: Partial<Omit<InboxTask, 'id'>>
            }
            blocklist: {
                Row: BlocklistEntry
                Insert: Omit<BlocklistEntry, 'id' | 'created_at'>
                Update: Partial<Omit<BlocklistEntry, 'id'>>
            }
            decision_log: {
                Row: DecisionLog
                Insert: Omit<DecisionLog, 'id' | 'timestamp'>
                Update: Partial<Omit<DecisionLog, 'id'>>
            }
            domain_knowledge: {
                Row: DomainKnowledge
                Insert: Omit<DomainKnowledge, 'id' | 'updated_at'>
                Update: Partial<Omit<DomainKnowledge, 'id' | 'updated_at'>>
            }
            contacts: {
                Row: Contact
                Insert: Omit<Contact, 'id' | 'created_at'>
                Update: Partial<Omit<Contact, 'id' | 'created_at'>>
            }
            knowledge_suggestions: {
                Row: KnowledgeSuggestion
                Insert: Omit<KnowledgeSuggestion, 'id' | 'created_at'>
                Update: Partial<Omit<KnowledgeSuggestion, 'id' | 'created_at'>>
            }
            detected_events: {
                Row: DetectedEventRow
                Insert: Omit<DetectedEventRow, 'id' | 'created_at'>
                Update: Partial<Omit<DetectedEventRow, 'id' | 'created_at'>>
            }
            cognito_events: {
                Row: CognitoEventRow
                Insert: Omit<CognitoEventRow, 'id' | 'created_at' | 'updated_at'>
                Update: Partial<Omit<CognitoEventRow, 'id' | 'created_at'>>
            }
            scheduling_windows: {
                Row: SchedulingWindow
                Insert: Omit<SchedulingWindow, 'id'>
                Update: Partial<Omit<SchedulingWindow, 'id'>>
            }
            task_sessions: {
                Row: TaskSession
                Insert: Omit<TaskSession, 'id' | 'created_at' | 'updated_at'>
                Update: Partial<Omit<TaskSession, 'id' | 'created_at'>>
            }
            protected_calendars: {
                Row: ProtectedCalendar
                Insert: Omit<ProtectedCalendar, 'id' | 'created_at'>
                Update: Partial<Omit<ProtectedCalendar, 'id' | 'created_at'>>
            }
        }
    }
}
