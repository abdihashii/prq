// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMediaQuery } from '../use-media-query'

let currentMatches = false
let currentListener: ((event: MediaQueryListEvent) => void) | null = null

function makeMatchMedia(matches: boolean) {
  return {
    matches,
    media: '',
    onchange: null,
    addEventListener: (_type: 'change', handler: (event: MediaQueryListEvent) => void) => {
      currentListener = handler
    },
    removeEventListener: () => {
      currentListener = null
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }
}

describe('useMediaQuery', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn(() => makeMatchMedia(currentMatches)))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    currentListener = null
    currentMatches = false
  })

  it('returns the initial match value from matchMedia', () => {
    currentMatches = true
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    expect(result.current).toBe(true)
  })

  it('returns false when the query does not match', () => {
    currentMatches = false
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    expect(result.current).toBe(false)
  })

  it('updates when the listener fires', () => {
    currentMatches = false
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    expect(result.current).toBe(false)

    act(() => {
      currentListener?.({ matches: true } as MediaQueryListEvent)
    })
    expect(result.current).toBe(true)
  })

  it('cleans up the listener on unmount', () => {
    currentMatches = false
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    expect(currentListener).not.toBeNull()
    unmount()
    expect(currentListener).toBeNull()
  })
})
