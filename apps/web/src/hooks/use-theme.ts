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
    const root = document.documentElement
    if (resolvedTheme === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
    root.style.colorScheme = resolvedTheme
  }, [resolvedTheme])

  const setTheme = (next: Theme) => {
    setThemeState(next)
    writeTheme(next)
  }

  return { resolvedTheme, setTheme }
}
