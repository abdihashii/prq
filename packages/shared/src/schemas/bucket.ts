import { z } from 'zod'

export const BucketSchema = z.enum(['review', 'attention', 'ready', 'waiting', 'drafts'])

export const DISPLAY_ORDER = ['review', 'attention', 'ready', 'waiting', 'drafts'] as const

export const EVALUATION_ORDER = ['drafts', 'review', 'attention', 'ready', 'waiting'] as const
