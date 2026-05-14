// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { THEME_KEY } from '@/lib/theme-storage/theme-storage'
import { THEME_INIT_SCRIPT } from '../theme-init-script'

const root = document.documentElement

function runScript() {
  new Function(THEME_INIT_SCRIPT)()
}

function stubMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

beforeEach(() => {
  window.localStorage.clear()
  root.classList.remove('dark')
  root.style.colorScheme = ''
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('THEME_INIT_SCRIPT', () => {
  it('adds dark class when storage is dark', () => {
    window.localStorage.setItem(THEME_KEY, 'dark')
    runScript()
    expect(root.classList.contains('dark')).toBe(true)
    expect(root.style.colorScheme).toBe('dark')
  })

  it('does not add dark class when storage is light', () => {
    window.localStorage.setItem(THEME_KEY, 'light')
    runScript()
    expect(root.classList.contains('dark')).toBe(false)
    expect(root.style.colorScheme).toBe('light')
  })

  it('falls back to matchMedia dark when storage is empty', () => {
    stubMatchMedia(true)
    runScript()
    expect(root.classList.contains('dark')).toBe(true)
    expect(root.style.colorScheme).toBe('dark')
  })

  it('falls back to matchMedia light when storage is empty', () => {
    stubMatchMedia(false)
    runScript()
    expect(root.classList.contains('dark')).toBe(false)
    expect(root.style.colorScheme).toBe('light')
  })

  it('falls back to matchMedia when storage holds garbage', () => {
    window.localStorage.setItem(THEME_KEY, 'banana')
    stubMatchMedia(true)
    runScript()
    expect(root.classList.contains('dark')).toBe(true)
  })

  it('does not throw when localStorage is unavailable', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    stubMatchMedia(false)
    expect(() => runScript()).not.toThrow()
    expect(root.classList.contains('dark')).toBe(false)
  })
})
