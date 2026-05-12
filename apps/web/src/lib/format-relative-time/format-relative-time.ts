import { differenceInDays, differenceInHours, differenceInMinutes, differenceInSeconds } from 'date-fns'

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  if (then > now) return `${pad(0)}s ago`
  const seconds = differenceInSeconds(now, then)
  if (seconds < 60) return `${pad(seconds)}s ago`
  const minutes = differenceInMinutes(now, then)
  if (minutes < 60) return `${pad(minutes)}m ago`
  const hours = differenceInHours(now, then)
  if (hours < 24) return `${pad(hours)}h ago`
  return `${pad(differenceInDays(now, then))}d ago`
}
