import type { z } from 'zod'
import type { PollingMsSchema, SettingsSchema, ThemeSchema, TrackedReposSchema, TrackingStateSchema } from '../schemas/settings'

export type PollingMs = z.infer<typeof PollingMsSchema>
export type TrackedRepos = z.infer<typeof TrackedReposSchema>
export type Theme = z.infer<typeof ThemeSchema>
export type TrackingState = z.infer<typeof TrackingStateSchema>
export type Settings = z.infer<typeof SettingsSchema>
