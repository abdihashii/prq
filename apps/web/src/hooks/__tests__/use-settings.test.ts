// @vitest-environment jsdom

import { DEFAULT_SETTINGS } from '@prq/shared'
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSettings } from '../use-settings'

afterEach(() => {
  window.localStorage.clear()
})

describe('useSettings', () => {
  it('returns DEFAULT_SETTINGS while viewerLogin is null', () => {
    const { result } = renderHook(() => useSettings(null))
    expect(result.current.pollingMs).toBe(DEFAULT_SETTINGS.pollingMs)
    expect(result.current.tracking).toEqual(DEFAULT_SETTINGS.tracking)
  })

  it('does not touch localStorage while viewerLogin is null', () => {
    const { result } = renderHook(() => useSettings(null))
    act(() => {
      result.current.setPollingMs(60_000)
    })
    expect(window.localStorage.length).toBe(0)
  })

  it('hydrates from localStorage once viewerLogin resolves', () => {
    window.localStorage.setItem(
      'prq:settings:haji',
      JSON.stringify({ pollingMs: 120_000, tracking: { mode: 'custom', repos: ['foo/bar'] } }),
    )
    const { result } = renderHook(() => useSettings('haji'))
    expect(result.current.pollingMs).toBe(120_000)
    expect(result.current.tracking).toEqual({ mode: 'custom', repos: ['foo/bar'] })
  })

  it('persists setPollingMs to the viewer-keyed storage', () => {
    const { result } = renderHook(() => useSettings('haji'))
    act(() => {
      result.current.setPollingMs(300_000)
    })
    expect(result.current.pollingMs).toBe(300_000)
    expect(
      JSON.parse(window.localStorage.getItem('prq:settings:haji') ?? '{}'),
    ).toEqual({ pollingMs: 300_000, tracking: null })
  })

  it('persists setTracking to the viewer-keyed storage', () => {
    const { result } = renderHook(() => useSettings('haji'))
    act(() => {
      result.current.setTracking({ mode: 'custom', repos: ['vercel/next.js'] })
    })
    expect(result.current.tracking).toEqual({ mode: 'custom', repos: ['vercel/next.js'] })
    expect(
      JSON.parse(window.localStorage.getItem('prq:settings:haji') ?? '{}'),
    ).toEqual({ pollingMs: 30_000, tracking: { mode: 'custom', repos: ['vercel/next.js'] } })
  })

  it('re-hydrates when viewerLogin changes (account swap)', () => {
    window.localStorage.setItem(
      'prq:settings:haji',
      JSON.stringify({ pollingMs: 60_000, tracking: { mode: 'custom', repos: ['a/b'] } }),
    )
    window.localStorage.setItem(
      'prq:settings:work-haji',
      JSON.stringify({ pollingMs: 300_000, tracking: { mode: 'custom', repos: ['c/d'] } }),
    )

    const { result, rerender } = renderHook(
      ({ viewer }: { viewer: string | null }) => useSettings(viewer),
      { initialProps: { viewer: 'haji' } },
    )
    expect(result.current.pollingMs).toBe(60_000)

    rerender({ viewer: 'work-haji' })
    expect(result.current.pollingMs).toBe(300_000)
    expect(result.current.tracking).toEqual({ mode: 'custom', repos: ['c/d'] })
  })

  it('does not write previous viewer\'s in-memory settings under the new viewer\'s key on swap', () => {
    window.localStorage.setItem(
      'prq:settings:viewer-a',
      JSON.stringify({ pollingMs: 60_000, tracking: { mode: 'custom', repos: ['a/repo1'] } }),
    )
    window.localStorage.setItem(
      'prq:settings:viewer-b',
      JSON.stringify({ pollingMs: 300_000, tracking: { mode: 'custom', repos: ['b/repo2'] } }),
    )

    const { result, rerender } = renderHook(
      ({ viewer }: { viewer: string | null }) => useSettings(viewer),
      { initialProps: { viewer: 'viewer-a' satisfies string | null } },
    )

    // Mutate in-memory state for viewer-a so it diverges from any other key.
    act(() => {
      result.current.setTracking({ mode: 'custom', repos: ['a/repo1', 'a/repo3'] })
    })

    // Spy AFTER the in-memory mutation lands so we only observe writes
    // triggered by the swap.
    const setItemSpy = vi.spyOn(window.localStorage, 'setItem')
    rerender({ viewer: 'viewer-b' })

    const writesToB = setItemSpy.mock.calls.filter(
      ([key]) => key === 'prq:settings:viewer-b',
    )
    for (const [, value] of writesToB) {
      const parsed = JSON.parse(value)
      const repos = parsed.tracking?.repos ?? []
      expect(
        repos,
        `viewer-b storage written with viewer-a-tainted data: ${value}`,
      ).not.toContain('a/repo3')
      expect(repos).not.toContain('a/repo1')
    }

    setItemSpy.mockRestore()
  })
})
