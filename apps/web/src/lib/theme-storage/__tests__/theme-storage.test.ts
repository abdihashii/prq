// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { readTheme, THEME_KEY, writeTheme } from '../theme-storage'

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('readTheme', () => {
  it('returns null when storage is empty', () => {
    expect(readTheme()).toBeNull()
  })

  it.each(['light', 'dark'] as const)('returns %j when stored', (theme) => {
    window.localStorage.setItem(THEME_KEY, theme)
    expect(readTheme()).toBe(theme)
  })

  it('returns null when stored value is unparseable', () => {
    window.localStorage.setItem(THEME_KEY, 'banana')
    expect(readTheme()).toBeNull()
  })

  it('returns null when localStorage throws', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readTheme()).toBeNull()
  })
})

describe('writeTheme', () => {
  it('round-trips through readTheme', () => {
    writeTheme('light')
    expect(readTheme()).toBe('light')
    writeTheme('dark')
    expect(readTheme()).toBe('dark')
  })

  it('does not throw when localStorage rejects writes', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => writeTheme('dark')).not.toThrow()
  })
})
