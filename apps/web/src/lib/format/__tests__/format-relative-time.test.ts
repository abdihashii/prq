import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from '../format-relative-time.js'

const now = new Date('2026-05-03T12:00:00.000Z')

function ago(seconds: number): string {
  return new Date(now.getTime() - seconds * 1000).toISOString()
}

describe('formatRelativeTime', () => {
  it('renders 0s for an instant ago', () => {
    expect(formatRelativeTime(ago(0), now)).toEqual({ digits: '0', unit: 's ago' })
  })

  it('renders seconds for diffs under 1 minute', () => {
    expect(formatRelativeTime(ago(5), now)).toEqual({ digits: '5', unit: 's ago' })
    expect(formatRelativeTime(ago(30), now)).toEqual({ digits: '30', unit: 's ago' })
    expect(formatRelativeTime(ago(59), now)).toEqual({ digits: '59', unit: 's ago' })
  })

  it('crosses to minutes at 60s', () => {
    expect(formatRelativeTime(ago(60), now)).toEqual({ digits: '1', unit: 'm ago' })
    expect(formatRelativeTime(ago(60 * 59), now)).toEqual({ digits: '59', unit: 'm ago' })
  })

  it('crosses to hours at 60m', () => {
    expect(formatRelativeTime(ago(60 * 60), now)).toEqual({ digits: '1', unit: 'h ago' })
    expect(formatRelativeTime(ago(60 * 60 * 23), now)).toEqual({ digits: '23', unit: 'h ago' })
  })

  it('crosses to days at 24h', () => {
    expect(formatRelativeTime(ago(60 * 60 * 24), now)).toEqual({ digits: '1', unit: 'd ago' })
    expect(formatRelativeTime(ago(60 * 60 * 24 * 7), now)).toEqual({ digits: '7', unit: 'd ago' })
  })

  it('clamps future dates to 0s ago', () => {
    const future = new Date(now.getTime() + 5000).toISOString()
    expect(formatRelativeTime(future, now)).toEqual({ digits: '0', unit: 's ago' })
  })
})
