import { z } from 'zod'

export const PollingMsSchema = z.union([
  z.literal(30_000),
  z.literal(60_000),
  z.literal(120_000),
  z.literal(300_000),
])

export const TrackedReposSchema = z.array(z.string().regex(/^[^/\s]+\/[^/\s]+$/))

export const ThemeSchema = z.enum(['light', 'dark'])

export const TrackingStateSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('all') }),
  z.object({ mode: z.literal('custom'), repos: TrackedReposSchema }),
])

export const DEFAULT_SETTINGS: { pollingMs: 30_000, tracking: null } = {
  pollingMs: 30_000,
  tracking: null,
}

export const SettingsSchema = z
  .object({
    pollingMs: PollingMsSchema,
    tracking: TrackingStateSchema.nullable(),
  })
  .catch(() => DEFAULT_SETTINGS)

export const POLLING_OPTIONS = [
  { value: 30_000, label: '30s' },
  { value: 60_000, label: '1m' },
  { value: 120_000, label: '2m' },
  { value: 300_000, label: '5m' },
] as const
