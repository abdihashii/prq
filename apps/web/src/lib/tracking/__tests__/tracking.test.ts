import type { TrackableRepo, TrackingState } from '@prq/shared'
import { describe, expect, it } from 'vitest'
import {
  clearRepos,
  seedTracking,
  setMode,
  toggleRepo,
  toReposParam,
  TRACKING_ALL_THRESHOLD,
} from '../tracking'

function repos(slugs: string[]): TrackableRepo[] {
  return slugs.map((slug) => {
    const [owner, name] = slug.split('/')
    return { owner, name, prCount: 0 }
  })
}

describe('seedTracking', () => {
  it('seeds All for an empty universe', () => {
    expect(seedTracking([], TRACKING_ALL_THRESHOLD)).toEqual({ mode: 'all' })
  })

  it('seeds All at exactly the threshold (10)', () => {
    const universe = repos(Array.from({ length: 10 }, (_, i) => `o/r${i}`))
    expect(seedTracking(universe, 10)).toEqual({ mode: 'all' })
  })

  it('seeds empty Custom one past the threshold (11)', () => {
    const universe = repos(Array.from({ length: 11 }, (_, i) => `o/r${i}`))
    expect(seedTracking(universe, 10)).toEqual({ mode: 'custom', repos: [] })
  })
})

describe('toReposParam', () => {
  it('returns null in All mode', () => {
    expect(toReposParam({ mode: 'all' })).toBeNull()
  })

  it('joins selected repos in Custom mode', () => {
    expect(toReposParam({ mode: 'custom', repos: ['a/b', 'c/d'] })).toBe('a/b,c/d')
  })

  it('returns an empty string for empty Custom', () => {
    expect(toReposParam({ mode: 'custom', repos: [] })).toBe('')
  })
})

describe('toggleRepo', () => {
  it('adds a missing slug in Custom mode', () => {
    expect(toggleRepo({ mode: 'custom', repos: ['a/b'] }, 'c/d')).toEqual({
      mode: 'custom',
      repos: ['a/b', 'c/d'],
    })
  })

  it('removes a present slug in Custom mode', () => {
    expect(toggleRepo({ mode: 'custom', repos: ['a/b', 'c/d'] }, 'a/b')).toEqual({
      mode: 'custom',
      repos: ['c/d'],
    })
  })

  it('is a no-op in All mode', () => {
    const state = { mode: 'all' } as const
    expect(toggleRepo(state, 'c/d')).toBe(state)
  })
})

describe('clearRepos', () => {
  it('empties the selection in Custom mode', () => {
    expect(clearRepos({ mode: 'custom', repos: ['a/b', 'c/d'] })).toEqual({
      mode: 'custom',
      repos: [],
    })
  })

  it('is a no-op for already-empty Custom', () => {
    expect(clearRepos({ mode: 'custom', repos: [] })).toEqual({ mode: 'custom', repos: [] })
  })

  it('is a no-op in All mode', () => {
    const state = { mode: 'all' } as const
    expect(clearRepos(state)).toBe(state)
  })
})

describe('setMode', () => {
  it('switches to All, discarding selection', () => {
    expect(setMode({ mode: 'custom', repos: ['a/b'] }, 'all', [])).toEqual({ mode: 'all' })
  })

  it('switching All -> Custom preselects the whole universe', () => {
    expect(setMode({ mode: 'all' }, 'custom', repos(['a/b', 'c/d']))).toEqual({
      mode: 'custom',
      repos: ['a/b', 'c/d'],
    })
  })

  it('Custom -> Custom returns the existing state unchanged', () => {
    const state: TrackingState = { mode: 'custom', repos: ['a/b'] }
    expect(setMode(state, 'custom', repos(['c/d']))).toBe(state)
  })
})
