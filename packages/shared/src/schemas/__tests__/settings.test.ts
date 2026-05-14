import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  POLLING_OPTIONS,
  PollingMsSchema,
  SettingsSchema,
  ThemeSchema,
  TrackedReposSchema,
} from '../settings'

describe('PollingMsSchema', () => {
  it.each([30_000, 60_000, 120_000, 300_000])('accepts %i', (ms) => {
    expect(PollingMsSchema.parse(ms)).toBe(ms)
  })

  it.each([0, 15_000, 45_000, 100, 999_999])('rejects %i', (ms) => {
    expect(() => PollingMsSchema.parse(ms)).toThrow()
  })
})

describe('TrackedReposSchema', () => {
  it('accepts empty array', () => {
    expect(TrackedReposSchema.parse([])).toEqual([])
  })

  it('accepts valid owner/repo strings', () => {
    expect(TrackedReposSchema.parse(['vercel/next.js', 'facebook/react'])).toEqual([
      'vercel/next.js',
      'facebook/react',
    ])
  })

  it.each([
    ['no-slash'],
    ['too/many/slashes'],
    ['has space/repo'],
    ['/leading-slash'],
    ['trailing/'],
    [''],
  ])('rejects %j', (bad) => {
    expect(() => TrackedReposSchema.parse([bad])).toThrow()
  })
})

describe('ThemeSchema', () => {
  it.each(['light', 'dark'] as const)('accepts %j', (theme) => {
    expect(ThemeSchema.parse(theme)).toBe(theme)
  })

  it.each(['system', '', 'Light', 'DARK', null, undefined, 0, 1])('rejects %j', (bad) => {
    expect(() => ThemeSchema.parse(bad)).toThrow()
  })
})

describe('SettingsSchema', () => {
  it('parses valid settings round-trip', () => {
    const valid = { pollingMs: 60_000, trackedRepos: ['foo/bar'] }
    expect(SettingsSchema.parse(valid)).toEqual(valid)
  })

  it('parses with theme: light', () => {
    const valid = { pollingMs: 30_000, trackedRepos: [], theme: 'light' as const }
    expect(SettingsSchema.parse(valid)).toEqual(valid)
  })

  it('parses with theme: dark', () => {
    const valid = { pollingMs: 30_000, trackedRepos: [], theme: 'dark' as const }
    expect(SettingsSchema.parse(valid)).toEqual(valid)
  })

  it('parses with theme omitted (round-trips without theme)', () => {
    const valid = { pollingMs: 30_000, trackedRepos: [] }
    expect(SettingsSchema.parse(valid)).toEqual(valid)
  })

  it('falls back to DEFAULT_SETTINGS on empty object', () => {
    expect(SettingsSchema.parse({})).toEqual(DEFAULT_SETTINGS)
  })

  it('falls back to DEFAULT_SETTINGS on invalid pollingMs', () => {
    expect(SettingsSchema.parse({ pollingMs: 99, trackedRepos: [] })).toEqual(DEFAULT_SETTINGS)
  })

  it('falls back to DEFAULT_SETTINGS on invalid trackedRepos entry', () => {
    expect(
      SettingsSchema.parse({ pollingMs: 30_000, trackedRepos: ['no-slash'] }),
    ).toEqual(DEFAULT_SETTINGS)
  })

  it('falls back to DEFAULT_SETTINGS on invalid theme', () => {
    expect(
      SettingsSchema.parse({ pollingMs: 30_000, trackedRepos: [], theme: 'system' }),
    ).toEqual(DEFAULT_SETTINGS)
  })

  it('falls back to DEFAULT_SETTINGS on null', () => {
    expect(SettingsSchema.parse(null)).toEqual(DEFAULT_SETTINGS)
  })

  it('falls back to DEFAULT_SETTINGS on garbage', () => {
    expect(SettingsSchema.parse('not an object')).toEqual(DEFAULT_SETTINGS)
  })
})

describe('POLLING_OPTIONS', () => {
  it('lists all four supported cadences', () => {
    expect(POLLING_OPTIONS.map(o => o.value)).toEqual([30_000, 60_000, 120_000, 300_000])
  })

  it('every value parses as PollingMs', () => {
    for (const opt of POLLING_OPTIONS) {
      expect(PollingMsSchema.parse(opt.value)).toBe(opt.value)
    }
  })

  it('every option has a non-empty label', () => {
    for (const opt of POLLING_OPTIONS) {
      expect(opt.label.length).toBeGreaterThan(0)
    }
  })
})

describe('DEFAULT_SETTINGS', () => {
  it('is itself valid against SettingsSchema', () => {
    expect(SettingsSchema.parse(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS)
  })
})
