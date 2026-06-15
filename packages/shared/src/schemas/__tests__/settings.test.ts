import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  POLLING_OPTIONS,
  PollingMsSchema,
  SettingsSchema,
  ThemeSchema,
  TrackedReposSchema,
  TrackingStateSchema,
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

describe('TrackingStateSchema', () => {
  it('accepts the all variant', () => {
    expect(TrackingStateSchema.parse({ mode: 'all' })).toEqual({ mode: 'all' })
  })

  it('accepts the custom variant with repos', () => {
    const custom = { mode: 'custom', repos: ['foo/bar'] }
    expect(TrackingStateSchema.parse(custom)).toEqual(custom)
  })

  it('accepts the custom variant with empty repos', () => {
    expect(TrackingStateSchema.parse({ mode: 'custom', repos: [] })).toEqual({
      mode: 'custom',
      repos: [],
    })
  })

  it('rejects an unknown mode', () => {
    expect(() => TrackingStateSchema.parse({ mode: 'some-other' })).toThrow()
  })

  it('rejects custom with invalid repo slugs', () => {
    expect(() => TrackingStateSchema.parse({ mode: 'custom', repos: ['no-slash'] })).toThrow()
  })
})

describe('SettingsSchema', () => {
  it('parses valid settings round-trip (custom)', () => {
    const valid = { pollingMs: 60_000, tracking: { mode: 'custom', repos: ['foo/bar'] } }
    expect(SettingsSchema.parse(valid)).toEqual(valid)
  })

  it('parses valid settings round-trip (all)', () => {
    const valid = { pollingMs: 60_000, tracking: { mode: 'all' } }
    expect(SettingsSchema.parse(valid)).toEqual(valid)
  })

  it('parses valid settings round-trip (unseeded tracking)', () => {
    const valid = { pollingMs: 60_000, tracking: null }
    expect(SettingsSchema.parse(valid)).toEqual(valid)
  })

  it('falls back to DEFAULT_SETTINGS on empty object', () => {
    expect(SettingsSchema.parse({})).toEqual(DEFAULT_SETTINGS)
  })

  it('falls back to DEFAULT_SETTINGS on invalid pollingMs', () => {
    expect(SettingsSchema.parse({ pollingMs: 99, tracking: null })).toEqual(DEFAULT_SETTINGS)
  })

  it('falls back to DEFAULT_SETTINGS on invalid tracking', () => {
    expect(
      SettingsSchema.parse({ pollingMs: 30_000, tracking: { mode: 'custom', repos: ['no-slash'] } }),
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
