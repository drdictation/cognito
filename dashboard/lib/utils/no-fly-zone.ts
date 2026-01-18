/**
 * No-Fly Zone Logic
 * Rule: Friday 17:00 - Sunday 18:00 → Silent mode (no notifications)
 * Exception: Home/Hobby domain emails bypass the block
 */

export interface NoFlyZoneStatus {
    isActive: boolean
    message: string
    endsAt?: Date
    startsAt?: Date
}

export function getNoFlyZoneStatus(now: Date = new Date()): NoFlyZoneStatus {
    const dayOfWeek = now.getDay() // 0 = Sunday, 5 = Friday, 6 = Saturday
    const hour = now.getHours()

    // Friday after 17:00
    if (dayOfWeek === 5 && hour >= 17) {
        // Calculate when it ends (Sunday 18:00)
        const endsAt = new Date(now)
        endsAt.setDate(now.getDate() + 2) // Sunday
        endsAt.setHours(18, 0, 0, 0)

        return {
            isActive: true,
            message: 'No-Fly Zone: Weekend quiet time active',
            endsAt,
        }
    }

    // Saturday (all day)
    if (dayOfWeek === 6) {
        const endsAt = new Date(now)
        endsAt.setDate(now.getDate() + 1) // Sunday
        endsAt.setHours(18, 0, 0, 0)

        return {
            isActive: true,
            message: 'No-Fly Zone: Weekend quiet time active',
            endsAt,
        }
    }

    // Sunday before 18:00
    if (dayOfWeek === 0 && hour < 18) {
        const endsAt = new Date(now)
        endsAt.setHours(18, 0, 0, 0)

        return {
            isActive: true,
            message: 'No-Fly Zone: Weekend quiet time active',
            endsAt,
        }
    }

    // Calculate next No-Fly Zone start
    const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7
    const startsAt = new Date(now)
    startsAt.setDate(now.getDate() + (dayOfWeek === 5 ? 0 : daysUntilFriday))
    startsAt.setHours(17, 0, 0, 0)

    // If we're on Friday before 17:00
    if (dayOfWeek === 5 && hour < 17) {
        startsAt.setDate(now.getDate())
    }

    return {
        isActive: false,
        message: 'Active hours - notifications enabled',
        startsAt,
    }
}

export function formatTimeUntil(targetDate: Date, now: Date = new Date()): string {
    const diff = targetDate.getTime() - now.getTime()

    if (diff <= 0) return 'now'

    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

    if (hours > 24) {
        const days = Math.floor(hours / 24)
        return `${days}d ${hours % 24}h`
    }

    if (hours > 0) {
        return `${hours}h ${minutes}m`
    }

    return `${minutes}m`
}
