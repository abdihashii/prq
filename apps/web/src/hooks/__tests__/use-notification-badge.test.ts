// @vitest-environment jsdom

import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useNotificationBadge } from '../use-notification-badge'

function getIconLink(): HTMLLinkElement {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) throw new Error('icon link not found')
  return link
}

describe('useNotificationBadge', () => {
  beforeEach(() => {
    const link = document.createElement('link')
    link.rel = 'icon'
    link.setAttribute('href', '/favicon.svg')
    document.head.appendChild(link)
    document.title = 'prq'
  })

  afterEach(() => {
    getIconLink().remove()
    document.title = ''
  })

  it('keeps plain title and default favicon when count is 0', () => {
    renderHook(() => useNotificationBadge(0))

    expect(document.title).toBe('prq')
    expect(getIconLink().getAttribute('href')).toBe('/favicon.svg')
  })

  it('sets count badge title and alert favicon when count is positive', () => {
    renderHook(() => useNotificationBadge(3))

    expect(document.title).toBe('(3) prq')
    expect(getIconLink().getAttribute('href')).toBe('/favicon-alert.svg')
  })

  it('reverts to plain title and default favicon when count drops to 0', () => {
    const { rerender } = renderHook(({ count }) => useNotificationBadge(count), {
      initialProps: { count: 3 },
    })

    rerender({ count: 0 })

    expect(document.title).toBe('prq')
    expect(getIconLink().getAttribute('href')).toBe('/favicon.svg')
  })

  it('updates digits when count changes between positive values', () => {
    const { rerender } = renderHook(({ count }) => useNotificationBadge(count), {
      initialProps: { count: 1 },
    })

    rerender({ count: 5 })

    expect(document.title).toBe('(5) prq')
    expect(getIconLink().getAttribute('href')).toBe('/favicon-alert.svg')
  })
})
