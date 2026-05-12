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
    const valid = { pollingMs: 60_000, trackedRepos: ['foo/bar'] }
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
      JSON.stringify({ pollingMs: 99, trackedRepos: [] }),
    )
    expect(readSettings('haji')).toEqual(DEFAULT_SETTINGS)
  })

  it('is namespaced by viewer login', () => {
    const a = { pollingMs: 60_000, trackedRepos: ['foo/bar'] }
    const b = { pollingMs: 120_000, trackedRepos: ['baz/qux'] }
    window.localStorage.setItem('prq:settings:haji', JSON.stringify(a))
    window.localStorage.setItem('prq:settings:work-haji', JSON.stringify(b))
    expect(readSettings('haji')).toEqual(a)
    expect(readSettings('work-haji')).toEqual(b)
  })
})

describe('writeSettings', () => {
  it('round-trips with readSettings', () => {
    const value: Settings = { pollingMs: 300_000, trackedRepos: ['vercel/next.js'] }
    writeSettings('haji', value)
    expect(readSettings('haji')).toEqual(value)
  })

  it('overwrites prior values', () => {
    writeSettings('haji', { pollingMs: 30_000, trackedRepos: [] })
    writeSettings('haji', { pollingMs: 60_000, trackedRepos: ['a/b'] })
    expect(readSettings('haji')).toEqual({ pollingMs: 60_000, trackedRepos: ['a/b'] })
  })

  it('writes under the namespaced key (other viewers untouched)', () => {
    writeSettings('haji', { pollingMs: 60_000, trackedRepos: [] })
    expect(window.localStorage.getItem('prq:settings:work-haji')).toBeNull()
  })
})
