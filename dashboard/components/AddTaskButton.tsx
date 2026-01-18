'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { AddTaskModal } from './AddTaskModal'

export function AddTaskButton() {
    const [isModalOpen, setIsModalOpen] = useState(false)

    return (
        <>
            {/* Floating Action Button */}
            <button
                onClick={() => setIsModalOpen(true)}
                className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/25 flex items-center justify-center transition-all hover:scale-105 active:scale-95 z-30"
                aria-label="Add new task"
            >
                <Plus size={28} />
            </button>

            {/* Modal */}
            <AddTaskModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
            />
        </>
    )
}
