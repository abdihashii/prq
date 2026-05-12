import { differenceInDays, differenceInHours, differenceInMinutes, differenceInSeconds } from 'date-fns'

export interface RelativeTime {
  digits: string
  unit: 's ago' | 'm ago' | 'h ago' | 'd ago'
}

export function formatRelativeTime(iso: string, now: Date = new Date()): RelativeTime {
  const then = new Date(iso)
  if (then > now) return { digits: '0', unit: 's ago' }
  const seconds = differenceInSeconds(now, then)
  if (seconds < 60) return { digits: String(seconds), unit: 's ago' }
  const minutes = differenceInMinutes(now, then)
  if (minutes < 60) return { digits: String(minutes), unit: 'm ago' }
  const hours = differenceInHours(now, then)
  if (hours < 24) return { digits: String(hours), unit: 'h ago' }
  return { digits: String(differenceInDays(now, then)), unit: 'd ago' }
}
