import { differenceInDays, differenceInHours, differenceInMinutes, differenceInSeconds } from 'date-fns'

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  if (then > now) return '0s ago'
  const seconds = differenceInSeconds(now, then)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = differenceInMinutes(now, then)
  if (minutes < 60) return `${minutes}m ago`
  const hours = differenceInHours(now, then)
  if (hours < 24) return `${hours}h ago`
  return `${differenceInDays(now, then)}d ago`
}
