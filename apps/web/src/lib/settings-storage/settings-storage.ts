import type { Settings } from '@prq/shared'
import { DEFAULT_SETTINGS, SettingsSchema } from '@prq/shared'

const PREFIX = 'prq:settings:'

/**
 * Build the localStorage key for a given viewer login. Namespacing by login
 * means switching the active account loads that account's
 * settings, not the previous account's.
 *
 * @param viewerLogin - GitHub login of the authenticated viewer.
 * @returns Fully-qualified storage key like `"prq:settings:haji"`.
 *
 * @example
 * storageKey('haji') // => 'prq:settings:haji'
 */
export function storageKey(viewerLogin: string): string {
  return `${PREFIX}${viewerLogin}`
}

/**
 * Read persisted settings for a viewer, falling back to defaults on any
 * failure. Two layers of resilience: try/catch around `JSON.parse` (corrupt
 * or truncated stored value) and `SettingsSchema.catch(DEFAULT_SETTINGS)`
 * inside the schema (well-formed JSON but wrong shape). The function is
 * total — it never throws.
 *
 * @param viewerLogin - GitHub login of the authenticated viewer.
 * @returns Parsed `Settings`, or `DEFAULT_SETTINGS` if nothing is stored or
 *   the stored value cannot be recovered.
 *
 * @example
 * readSettings('haji')
 * // => { pollingMs: 30000, trackedRepos: [] } (first read, no storage yet)
 *
 * @example
 * // After writeSettings('haji', { pollingMs: 60000, trackedRepos: ['a/b'] })
 * readSettings('haji')
 * // => { pollingMs: 60000, trackedRepos: ['a/b'] }
 */
export function readSettings(viewerLogin: string): Settings {
  try {
    const raw = window.localStorage.getItem(storageKey(viewerLogin))
    if (raw === null) return DEFAULT_SETTINGS
    return SettingsSchema.parse(JSON.parse(raw))
  }
  catch {
    return DEFAULT_SETTINGS
  }
}

/**
 * Persist settings for a viewer. Caller is responsible for passing a value
 * that passes `SettingsSchema` validation; the function does not validate
 * before writing (the schema is enforced on the read side via `.catch`).
 *
 * @param viewerLogin - GitHub login of the authenticated viewer.
 * @param settings - Settings to persist; serialized as JSON.
 */
export function writeSettings(viewerLogin: string, settings: Settings): void {
  window.localStorage.setItem(storageKey(viewerLogin), JSON.stringify(settings))
}
