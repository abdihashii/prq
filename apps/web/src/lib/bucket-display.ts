import type { Bucket } from '@prq/shared'
import type { LucideIcon } from 'lucide-react'
import { CircleAlert, CircleCheck, Eye, GitPullRequestDraft, Hourglass } from 'lucide-react'

export const BUCKET_DISPLAY: Record<
  Bucket,
  { label: string, Icon: LucideIcon, accentClass: string, description: string }
> = {
  review: {
    label: 'Needs my review',
    Icon: Eye,
    accentClass: 'text-violet-500',
    description: 'PRs from others where you\'re a requested reviewer, or you\'ve reviewed and new commits arrived since.',
  },
  attention: {
    label: 'Needs my attention',
    Icon: CircleAlert,
    accentClass: 'text-rose-500',
    description: 'Your PRs needing a response — changes requested, or new comments since your last push.',
  },
  ready: {
    label: 'Ready to merge',
    Icon: CircleCheck,
    accentClass: 'text-emerald-500',
    description: 'Your approved PRs with passing checks and no merge conflicts.',
  },
  waiting: {
    label: 'Waiting on others',
    Icon: Hourglass,
    accentClass: 'text-amber-500',
    description: 'Your open non-draft PRs awaiting review, checks, or merge state.',
  },
  drafts: {
    label: 'Drafts',
    Icon: GitPullRequestDraft,
    accentClass: 'text-zinc-400',
    description: 'Your draft PRs. Held aside while WIP — review noise is ignored.',
  },
}
