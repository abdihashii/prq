import { THEME_KEY } from '@/lib/theme-storage/theme-storage'

/**
 * Synchronous IIFE injected into `<head>` via TanStack's `ScriptOnce`. Runs
 * before React hydrates and applies the resolved theme to `<html>` so the
 * first paint matches the user's preference and no flash occurs.
 *
 * Resolution order:
 *   1. `localStorage[THEME_KEY]` (user override; source of truth)
 *   2. `matchMedia('(prefers-color-scheme: dark)')` (system fallback)
 *
 * Adds the `dark` class when the resolved theme is dark and always sets
 * `style.colorScheme` so UA-styled controls (scrollbars, native form
 * controls) match the active palette.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark')document.documentElement.classList.add('dark');document.documentElement.style.colorScheme=t;}catch(e){}})();`
