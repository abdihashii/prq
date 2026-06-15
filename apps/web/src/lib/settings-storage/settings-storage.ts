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
 * // => { pollingMs: 30000, tracking: null } (first read, no storage yet)
 *
 * @example
 * // After writeSettings('haji', { pollingMs: 60000, tracking: { mode: 'custom', repos: ['a/b'] } })
 * readSettings('haji')
 * // => { pollingMs: 60000, tracking: { mode: 'custom', repos: ['a/b'] } }
 */
export function readSettings(viewerLogin: string): Settings {
  try {
    const raw = window.localStorage.getItem(storageKey(viewerLogin))
    if (raw === null) return DEFAULT_SETTINGS
    return SettingsSchema.parse(migrateLegacy(JSON.parse(raw)))
  }
  catch {
    return DEFAULT_SETTINGS
  }
}

/**
 * Migrate a legacy stored value (pre two-mode tracking) into the current
 * `Settings` shape. A legacy value has a `trackedRepos` array and no
 * `tracking` key; it becomes Custom tracking when non-empty, else unseeded
 * (`tracking: null`). Non-legacy values pass through untouched.
 *
 * @param raw - Parsed JSON read from storage.
 * @returns The migrated object, or `raw` when no migration applies.
 *
 * @example
 * migrateLegacy({ pollingMs: 60000, trackedRepos: ['a/b'] })
 * // => { pollingMs: 60000, tracking: { mode: 'custom', repos: ['a/b'] } }
 *
 * @example
 * migrateLegacy({ pollingMs: 60000, trackedRepos: [] })
 * // => { pollingMs: 60000, tracking: null }
 */
function migrateLegacy(raw: unknown): unknown {
  if (
    typeof raw === 'object'
    && raw !== null
    && Array.isArray((raw as { trackedRepos?: unknown }).trackedRepos)
    && !('tracking' in raw)
  ) {
    const legacy = raw as { pollingMs: unknown, trackedRepos: string[] }
    return {
      pollingMs: legacy.pollingMs,
      tracking: legacy.trackedRepos.length > 0
        ? { mode: 'custom', repos: legacy.trackedRepos }
        : null,
    }
  }
  return raw
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
