import { getAllKnowledge, getContacts, getSuggestions } from '@/lib/actions/knowledge'
import { KnowledgeEditor } from '@/lib/../components/KnowledgeEditor'
import { ContactsManager } from '@/lib/../components/ContactsManager'
import { SuggestionsList } from '@/lib/../components/SuggestionsList'
import { BookOpen, Users } from 'lucide-react'

// Force dynamic rendering to avoid build-time Supabase errors
export const dynamic = 'force-dynamic'

export default async function KnowledgePage() {
    const knowledge = await getAllKnowledge()
    const contactsResult = await getContacts()
    const suggestions = await getSuggestions()

    const contacts = contactsResult.success ? contactsResult.data || [] : []

    return (
        <div className="py-6 space-y-8 pb-20">
            {/* Header */}
            <header className="animate-fade-in">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-xl bg-primary/20">
                        <BookOpen size={24} className="text-primary" />
                    </div>
                    <h1 className="text-3xl md:text-4xl font-bold text-foreground">
                        Knowledge Base
                    </h1>
                </div>
                <p className="text-muted-foreground">
                    Teach Cognito about your preferences, key contacts, and priorities.
                </p>
            </header>

            {/* AI Suggestions (if any) */}
            <SuggestionsList suggestions={suggestions || []} />

            {/* Knowledge Editor */}
            <section className="animate-fade-in stagger-1">
                <KnowledgeEditor initialKnowledge={knowledge || []} />
            </section>

            {/* Contacts Manager */}
            <section className="animate-fade-in stagger-2 space-y-4">
                <header className="flex items-center gap-2 text-muted-foreground pb-2 border-b border-white/5">
                    <Users size={18} />
                    <h2 className="text-lg font-semibold text-foreground">People & Roles</h2>
                </header>

                <ContactsManager contacts={contacts} />
            </section>
        </div>
    )
}
