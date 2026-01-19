'use client'

import { useState } from 'react'
import { Calendar as CalendarIcon, Check, X } from 'lucide-react'

interface DeadlinePickerProps {
    initialDate?: Date
    onSave: (date: Date) => void
    onCancel: () => void
}

export function DeadlinePicker({ initialDate, onSave, onCancel }: DeadlinePickerProps) {
    // Default to tomorrow if no initial date
    const [date, setDate] = useState<string>(
        (initialDate || new Date(Date.now() + 86400000)).toISOString().split('T')[0]
    )
    const [time, setTime] = useState<string>(
        initialDate ? initialDate.toTimeString().slice(0, 5) : '17:00'
    )

    const handleSave = () => {
        const fullDate = new Date(`${date}T${time}:00`)
        onSave(fullDate)
    }

    return (
        <div className="bg-white border rounded-lg p-4 shadow-sm animate-in fade-in zoom-in-95 duration-200">
            <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-blue-600" />
                Set Explicit Deadline
            </h4>

            <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                    <label className="block text-xs text-gray-500 mb-1">Date</label>
                    <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-full text-sm border rounded px-2 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
                <div>
                    <label className="block text-xs text-gray-500 mb-1">Time</label>
                    <input
                        type="time"
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                        className="w-full text-sm border rounded px-2 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
            </div>

            <div className="flex justify-end gap-2">
                <button
                    onClick={onCancel}
                    className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded border border-gray-200 transition-colors flex items-center gap-1"
                >
                    <X className="w-3 h-3" />
                    Cancel
                </button>
                <button
                    onClick={handleSave}
                    className="px-3 py-1.5 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded shadow-sm transition-colors flex items-center gap-1"
                >
                    <Check className="w-3 h-3" />
                    Save Deadline
                </button>
            </div>
        </div>
    )
}
