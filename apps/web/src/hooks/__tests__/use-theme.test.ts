// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { THEME_KEY } from '@/lib/theme-storage/theme-storage'
import { useTheme } from '../use-theme'

const root = document.documentElement

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
  root.classList.remove('dark')
  root.style.colorScheme = ''
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useTheme', () => {
  it('resolves system dark when no override is stored', () => {
    stubMatchMedia(true)
    const { result } = renderHook(() => useTheme())
    expect(result.current.resolvedTheme).toBe('dark')
    expect(root.classList.contains('dark')).toBe(true)
    expect(root.style.colorScheme).toBe('dark')
  })

  it('resolves system light when no override is stored', () => {
    stubMatchMedia(false)
    const { result } = renderHook(() => useTheme())
    expect(result.current.resolvedTheme).toBe('light')
    expect(root.classList.contains('dark')).toBe(false)
    expect(root.style.colorScheme).toBe('light')
  })

  it('hydrates override from localStorage', () => {
    window.localStorage.setItem(THEME_KEY, 'dark')
    stubMatchMedia(false)
    const { result } = renderHook(() => useTheme())
    expect(result.current.resolvedTheme).toBe('dark')
    expect(root.classList.contains('dark')).toBe(true)
  })

  it('override beats system preference', () => {
    stubMatchMedia(true)
    window.localStorage.setItem(THEME_KEY, 'light')
    const { result } = renderHook(() => useTheme())
    expect(result.current.resolvedTheme).toBe('light')
    expect(root.classList.contains('dark')).toBe(false)
  })

  it('setTheme persists to localStorage and applies immediately', () => {
    stubMatchMedia(false)
    const { result } = renderHook(() => useTheme())

    act(() => {
      result.current.setTheme('dark')
    })

    expect(result.current.resolvedTheme).toBe('dark')
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark')
    expect(root.classList.contains('dark')).toBe(true)
  })

  it('flips applied class when setTheme changes', () => {
    stubMatchMedia(false)
    const { result } = renderHook(() => useTheme())

    act(() => {
      result.current.setTheme('dark')
    })
    expect(root.classList.contains('dark')).toBe(true)

    act(() => {
      result.current.setTheme('light')
    })
    expect(root.classList.contains('dark')).toBe(false)
  })

  it('follows matchMedia change when no override', () => {
    let captured: ((event: MediaQueryListEvent) => void) | undefined
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
        captured = listener
      }),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    const { result } = renderHook(() => useTheme())
    expect(result.current.resolvedTheme).toBe('light')

    act(() => {
      captured?.({ matches: true } as MediaQueryListEvent)
    })

    expect(result.current.resolvedTheme).toBe('dark')
    expect(root.classList.contains('dark')).toBe(true)
  })

  it('ignores matchMedia change when override is set', () => {
    let captured: ((event: MediaQueryListEvent) => void) | undefined
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
        captured = listener
      }),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    window.localStorage.setItem(THEME_KEY, 'light')
    const { result } = renderHook(() => useTheme())
    expect(result.current.resolvedTheme).toBe('light')

    act(() => {
      captured?.({ matches: true } as MediaQueryListEvent)
    })

    expect(result.current.resolvedTheme).toBe('light')
    expect(root.classList.contains('dark')).toBe(false)
  })
})
