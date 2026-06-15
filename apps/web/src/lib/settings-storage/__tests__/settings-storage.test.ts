// @vitest-environment jsdom

import type { Settings } from '@prq/shared'
import { DEFAULT_SETTINGS } from '@prq/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { readSettings, storageKey, writeSettings } from '../settings-storage'

afterEach(() => {
  window.localStorage.clear()
})

describe('storageKey', () => {
  it('prefixes the viewer login', () => {
    expect(storageKey('haji')).toBe('prq:settings:haji')
  })
})

describe('readSettings', () => {
  it('returns DEFAULT_SETTINGS when localStorage has nothing', () => {
    expect(readSettings('haji')).toEqual(DEFAULT_SETTINGS)
  })

  it('returns persisted settings when present and valid', () => {
    const valid = { pollingMs: 60_000, tracking: { mode: 'custom', repos: ['foo/bar'] } }
    window.localStorage.setItem('prq:settings:haji', JSON.stringify(valid))
    expect(readSettings('haji')).toEqual(valid)
  })

  it('returns DEFAULT_SETTINGS on corrupt JSON', () => {
    window.localStorage.setItem('prq:settings:haji', '{not json')
    expect(readSettings('haji')).toEqual(DEFAULT_SETTINGS)
  })

  it('returns DEFAULT_SETTINGS on schema-invalid JSON (via .catch)', () => {
    window.localStorage.setItem(
      'prq:settings:haji',
      JSON.stringify({ pollingMs: 99, tracking: null }),
    )
    expect(readSettings('haji')).toEqual(DEFAULT_SETTINGS)
  })

  it('migrates a legacy non-empty trackedRepos to custom tracking', () => {
    window.localStorage.setItem(
      'prq:settings:haji',
      JSON.stringify({ pollingMs: 60_000, trackedRepos: ['a/b'] }),
    )
    expect(readSettings('haji')).toEqual({
      pollingMs: 60_000,
      tracking: { mode: 'custom', repos: ['a/b'] },
    })
  })

  it('migrates a legacy empty trackedRepos to unseeded tracking (null)', () => {
    window.localStorage.setItem(
      'prq:settings:haji',
      JSON.stringify({ pollingMs: 120_000, trackedRepos: [] }),
    )
    expect(readSettings('haji')).toEqual({ pollingMs: 120_000, tracking: null })
  })

  it('is namespaced by viewer login', () => {
    const a = { pollingMs: 60_000, tracking: { mode: 'custom', repos: ['foo/bar'] } }
    const b = { pollingMs: 120_000, tracking: { mode: 'custom', repos: ['baz/qux'] } }
    window.localStorage.setItem('prq:settings:haji', JSON.stringify(a))
    window.localStorage.setItem('prq:settings:work-haji', JSON.stringify(b))
    expect(readSettings('haji')).toEqual(a)
    expect(readSettings('work-haji')).toEqual(b)
  })
})

describe('writeSettings', () => {
  it('round-trips with readSettings', () => {
    const value: Settings = { pollingMs: 300_000, tracking: { mode: 'custom', repos: ['vercel/next.js'] } }
    writeSettings('haji', value)
    expect(readSettings('haji')).toEqual(value)
  })

  it('overwrites prior values', () => {
    writeSettings('haji', { pollingMs: 30_000, tracking: { mode: 'all' } })
    writeSettings('haji', { pollingMs: 60_000, tracking: { mode: 'custom', repos: ['a/b'] } })
    expect(readSettings('haji')).toEqual({
      pollingMs: 60_000,
      tracking: { mode: 'custom', repos: ['a/b'] },
    })
  })

  it('writes under the namespaced key (other viewers untouched)', () => {
    writeSettings('haji', { pollingMs: 60_000, tracking: null })
    expect(window.localStorage.getItem('prq:settings:work-haji')).toBeNull()
  })
})
