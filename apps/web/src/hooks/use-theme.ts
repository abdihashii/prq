import { useEffect, useState } from 'react'
import type { Theme } from '@prq/shared'
import { readTheme, writeTheme } from '@/lib/theme-storage/theme-storage'

export interface UseThemeReturn {
  resolvedTheme: Theme
  setTheme: (next: Theme) => void
}

const DARK_QUERY = '(prefers-color-scheme: dark)'

function getInitialSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

// Suppress CSS transitions during a theme swap so every element flips
// instantly together instead of staggering (some have transition-colors,
// some don't). Same pattern as next-themes. Only `transition` is
// suppressed, not `animation`: keyframe animations are used by Radix
// primitives (Sheet, Drawer) for their open/close motion and must keep
// running. Style stays in the DOM for one macrotask, long enough for the
// browser to compute new styles + paint without transitions, then is
// removed.
function suppressTransitions(): () => void {
  const style = document.createElement('style')
  style.appendChild(
    document.createTextNode(
      '*,*::before,*::after{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}',
    ),
  )
  document.head.appendChild(style)
  return () => {
    window.getComputedStyle(document.body)
    setTimeout(() => {
      document.head.removeChild(style)
    }, 1)
  }
}

export function useTheme(): UseThemeReturn {
  const [theme, setThemeState] = useState<Theme | null>(() => readTheme())
  const [systemTheme, setSystemTheme] = useState<Theme>(getInitialSystemTheme)

  useEffect(() => {
    const mql = window.matchMedia(DARK_QUERY)
    const onChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light')
    }
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  const resolvedTheme: Theme = theme ?? systemTheme

  useEffect(() => {
    const restore = suppressTransitions()
    const root = document.documentElement
    if (resolvedTheme === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
    root.style.colorScheme = resolvedTheme
    restore()
  }, [resolvedTheme])

  const setTheme = (next: Theme) => {
    setThemeState(next)
    writeTheme(next)
  }

  return { resolvedTheme, setTheme }
}
