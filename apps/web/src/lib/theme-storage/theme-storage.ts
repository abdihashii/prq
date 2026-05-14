import type { Theme } from '@prq/shared'
import { ThemeSchema } from '@prq/shared'

export const THEME_KEY = 'prq:theme'

/**
 * Read the user's theme preference from localStorage. Source of truth for
 * the device-level theme override; absence (`null`) means "follow the
 * `prefers-color-scheme` media query."
 *
 * Total function. Returns `null` on any failure (private-mode browsers
 * where `localStorage` access throws, or a value that isn't `'light'` /
 * `'dark'`) so callers can fall back to system pref.
 *
 * @returns The stored theme, or `null` when unset or unreadable.
 */
export function readTheme(): Theme | null {
  try {
    const raw = window.localStorage.getItem(THEME_KEY)
    if (raw === null) return null
    const parsed = ThemeSchema.safeParse(raw)
    return parsed.success ? parsed.data : null
  }
  catch {
    return null
  }
}

/**
 * Persist the user's theme preference to localStorage. Caller is
 * responsible for passing a valid `Theme`; no validation here since the
 * read side gates with `ThemeSchema.safeParse`.
 *
 * @param theme - Theme to store.
 */
export function writeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_KEY, theme)
  }
  catch {
    // Private-mode browsers, quota exceeded, etc. Harmless: the next paint
    // falls back to matchMedia and the user can re-toggle.
  }
}
