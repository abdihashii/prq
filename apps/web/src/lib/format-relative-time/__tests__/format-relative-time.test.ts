import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from '../format-relative-time.js'

const now = new Date('2026-05-03T12:00:00.000Z')

function ago(seconds: number): string {
  return new Date(now.getTime() - seconds * 1000).toISOString()
}

describe('formatRelativeTime', () => {
  it('renders 0s for an instant ago', () => {
    expect(formatRelativeTime(ago(0), now)).toBe('0s ago')
  })

  it('renders seconds for diffs under 1 minute', () => {
    expect(formatRelativeTime(ago(30), now)).toBe('30s ago')
    expect(formatRelativeTime(ago(59), now)).toBe('59s ago')
  })

  it('crosses to minutes at 60s', () => {
    expect(formatRelativeTime(ago(60), now)).toBe('1m ago')
    expect(formatRelativeTime(ago(60 * 59), now)).toBe('59m ago')
  })

  it('crosses to hours at 60m', () => {
    expect(formatRelativeTime(ago(60 * 60), now)).toBe('1h ago')
    expect(formatRelativeTime(ago(60 * 60 * 23), now)).toBe('23h ago')
  })

  it('crosses to days at 24h', () => {
    expect(formatRelativeTime(ago(60 * 60 * 24), now)).toBe('1d ago')
    expect(formatRelativeTime(ago(60 * 60 * 24 * 7), now)).toBe('7d ago')
  })

  it('clamps future dates to 0s ago', () => {
    const future = new Date(now.getTime() + 5000).toISOString()
    expect(formatRelativeTime(future, now)).toBe('0s ago')
  })
})
