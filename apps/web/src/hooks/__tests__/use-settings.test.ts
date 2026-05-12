// @vitest-environment jsdom

import { DEFAULT_SETTINGS } from '@prq/shared'
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useSettings } from '../use-settings'

afterEach(() => {
  window.localStorage.clear()
})

describe('useSettings', () => {
  it('returns DEFAULT_SETTINGS while viewerLogin is null', () => {
    const { result } = renderHook(() => useSettings(null))
    expect(result.current.pollingMs).toBe(DEFAULT_SETTINGS.pollingMs)
    expect(result.current.trackedRepos).toEqual(DEFAULT_SETTINGS.trackedRepos)
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
      JSON.stringify({ pollingMs: 120_000, trackedRepos: ['foo/bar'] }),
    )
    const { result } = renderHook(() => useSettings('haji'))
    expect(result.current.pollingMs).toBe(120_000)
    expect(result.current.trackedRepos).toEqual(['foo/bar'])
  })

  it('persists setPollingMs to the viewer-keyed storage', () => {
    const { result } = renderHook(() => useSettings('haji'))
    act(() => {
      result.current.setPollingMs(300_000)
    })
    expect(result.current.pollingMs).toBe(300_000)
    expect(
      JSON.parse(window.localStorage.getItem('prq:settings:haji') ?? '{}'),
    ).toEqual({ pollingMs: 300_000, trackedRepos: [] })
  })

  it('persists setTrackedRepos to the viewer-keyed storage', () => {
    const { result } = renderHook(() => useSettings('haji'))
    act(() => {
      result.current.setTrackedRepos(['vercel/next.js'])
    })
    expect(result.current.trackedRepos).toEqual(['vercel/next.js'])
    expect(
      JSON.parse(window.localStorage.getItem('prq:settings:haji') ?? '{}'),
    ).toEqual({ pollingMs: 30_000, trackedRepos: ['vercel/next.js'] })
  })

  it('re-hydrates when viewerLogin changes (PAT swap)', () => {
    window.localStorage.setItem(
      'prq:settings:haji',
      JSON.stringify({ pollingMs: 60_000, trackedRepos: ['a/b'] }),
    )
    window.localStorage.setItem(
      'prq:settings:work-haji',
      JSON.stringify({ pollingMs: 300_000, trackedRepos: ['c/d'] }),
    )

    const { result, rerender } = renderHook(
      ({ viewer }: { viewer: string | null }) => useSettings(viewer),
      { initialProps: { viewer: 'haji' } },
    )
    expect(result.current.pollingMs).toBe(60_000)

    rerender({ viewer: 'work-haji' })
    expect(result.current.pollingMs).toBe(300_000)
    expect(result.current.trackedRepos).toEqual(['c/d'])
  })
})
