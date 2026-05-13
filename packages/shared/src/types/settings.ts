import type { z } from 'zod'
import type { PollingMsSchema, SettingsSchema, TrackedReposSchema } from '../schemas/settings'

export type PollingMs = z.infer<typeof PollingMsSchema>
export type TrackedRepos = z.infer<typeof TrackedReposSchema>
export type Settings = z.infer<typeof SettingsSchema>
