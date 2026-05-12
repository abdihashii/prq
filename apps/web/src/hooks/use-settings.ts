import { useEffect, useState } from 'react'
import type { PollingMs, Settings, TrackedRepos } from '@prq/shared'
import { DEFAULT_SETTINGS } from '@prq/shared'
import { readSettings, writeSettings } from '@/lib/settings-storage/settings-storage'

export interface UseSettingsReturn {
  pollingMs: PollingMs
  trackedRepos: TrackedRepos
  setPollingMs: (next: PollingMs) => void
  setTrackedRepos: (next: TrackedRepos) => void
}

export function useSettings(viewerLogin: string | null): UseSettingsReturn {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  useEffect(() => {
    if (viewerLogin === null) {
      setSettings(DEFAULT_SETTINGS)
      return
    }
    setSettings(readSettings(viewerLogin))
  }, [viewerLogin])

  useEffect(() => {
    if (viewerLogin === null) return
    writeSettings(viewerLogin, settings)
  }, [viewerLogin, settings])

  return {
    pollingMs: settings.pollingMs,
    trackedRepos: settings.trackedRepos,
    setPollingMs: next => setSettings(prev => ({ ...prev, pollingMs: next })),
    setTrackedRepos: next => setSettings(prev => ({ ...prev, trackedRepos: next })),
  }
}
