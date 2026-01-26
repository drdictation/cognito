'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { InboxTask } from '@/lib/types/database'

interface TasksContextType {
    tasks: InboxTask[]
    removeTask: (taskId: string) => void
    updateTask: (taskId: string, updates: Partial<InboxTask>) => void
    refreshTasks: (newTasks: InboxTask[]) => void
}

const TasksContext = createContext<TasksContextType | null>(null)

export function TasksProvider({ initialTasks, children }: { initialTasks: InboxTask[], children: ReactNode }) {
    const [tasks, setTasks] = useState(initialTasks)

    const removeTask = useCallback((taskId: string) => {
        setTasks(prev => prev.filter(t => t.id !== taskId))
    }, [])

    const updateTask = useCallback((taskId: string, updates: Partial<InboxTask>) => {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t))
    }, [])

    const refreshTasks = useCallback((newTasks: InboxTask[]) => {
        setTasks(newTasks)
    }, [])

    return (
        <TasksContext.Provider value={{ tasks, removeTask, updateTask, refreshTasks }}>
            {children}
        </TasksContext.Provider>
    )
}

export function useTasks() {
    const context = useContext(TasksContext)
    if (!context) throw new Error('useTasks must be used within TasksProvider')
    return context
}
