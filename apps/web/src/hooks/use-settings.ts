import { useEffect, useState } from 'react'
import type { PollingMs, Settings, TrackingState } from '@prq/shared'
import { DEFAULT_SETTINGS } from '@prq/shared'
import { readSettings, writeSettings } from '@/lib/settings-storage/settings-storage'

export interface UseSettingsReturn {
  pollingMs: PollingMs
  tracking: TrackingState | null
  /**
   * Whether `settings` reflects the persisted value for the current viewer
   * (vs. the pre-hydration default). `tracking === null` only means "unseeded"
   * once this is true; before it, null just means "not read yet" and must not
   * be seeded over, or a returning viewer's stored choice gets clobbered.
   */
  hydrated: boolean
  setPollingMs: (next: PollingMs) => void
  setTracking: (next: TrackingState) => void
}

export function useSettings(viewerLogin: string | null): UseSettingsReturn {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  // Track which viewer the in-memory `settings` was last hydrated from. Held
  // as state (not a ref) so the value the write effect closes over lags one
  // render behind the read effect's update — within a single flush triggered
  // by a viewerLogin change, the write effect sees the previous `hydratedFor`
  // and bails out, preventing it from persisting the previous viewer's
  // in-memory settings under the new viewer's storage key. After re-render,
  // hydratedFor === viewerLogin and the write proceeds normally.
  const [hydratedFor, setHydratedFor] = useState<string | null>(null)

  useEffect(() => {
    if (viewerLogin === null) {
      setSettings(DEFAULT_SETTINGS)
      setHydratedFor(null)
      return
    }
    setSettings(readSettings(viewerLogin))
    setHydratedFor(viewerLogin)
  }, [viewerLogin])

  useEffect(() => {
    if (viewerLogin === null || hydratedFor !== viewerLogin) return
    writeSettings(viewerLogin, settings)
  }, [viewerLogin, settings, hydratedFor])

  return {
    pollingMs: settings.pollingMs,
    tracking: settings.tracking,
    hydrated: viewerLogin !== null && hydratedFor === viewerLogin,
    setPollingMs: next => setSettings(prev => ({ ...prev, pollingMs: next })),
    setTracking: next => setSettings(prev => ({ ...prev, tracking: next })),
  }
}
