import type { Bucket, PullRequest } from '@prq/shared'
import type { LucideIcon } from 'lucide-react'
import { Check, Clock, GitBranch, MessageSquare, X } from 'lucide-react'
import { Fragment } from 'react'
import { Badge } from '@/components/ui/badge'
import { formatNumber, formatRelativeTime } from '@/lib/format/format'
import type { CiStatusKind, ReviewBadgeLabel, SuffixPart } from '@/lib/pr-display/pr-display'
import {
  getBucketMetaSuffix,
  getCiStatusKind,
  getContextualHint,
  getReviewBadgeLabel,
} from '@/lib/pr-display/pr-display'
import { cn } from '@/lib/utils'

const CI_ICON: Record<CiStatusKind, { Icon: LucideIcon, className: string }> = {
  success: { Icon: Check, className: 'text-success' },
  pending: { Icon: Clock, className: 'text-warning' },
  failure: { Icon: X, className: 'text-danger' },
}

const BADGE_VARIANT: Record<ReviewBadgeLabel, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  Draft: 'outline',
  Approved: 'default',
  'Changes requested': 'destructive',
  'Review pending': 'outline',
}

function renderSuffixParts(parts: SuffixPart[]) {
  return parts.map((p, i) =>
    p.kind === 'mono'
      ? <span key={i} className="font-mono">{p.value}</span>
      : <Fragment key={i}>{p.value}</Fragment>,
  )
}

interface PrRowProps {
  pr: PullRequest
  bucket: Bucket
  autoRetargetedFromBaseRefName?: string
}

export function PrRow({ pr, bucket, autoRetargetedFromBaseRefName }: PrRowProps) {
  const ciKind = getCiStatusKind(pr)
  const ci = ciKind ? CI_ICON[ciKind] : null
  const badgeLabel = getReviewBadgeLabel(pr)
  const hint = getContextualHint(pr)
  const bucketSuffix = getBucketMetaSuffix(pr, bucket)
  const updated = formatRelativeTime(pr.updatedAt)
  const authorOrBase = bucket === 'review'
    ? `by @${pr.author?.login ?? 'ghost'}`
    : `base: ${pr.baseRefName}`

  return (
    <a
      href={pr.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-md px-3 py-2 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="flex items-center gap-2 text-sm">
        {ci && <ci.Icon className={cn('size-4 shrink-0', ci.className)} />}
        <Badge variant={BADGE_VARIANT[badgeLabel]}>{badgeLabel}</Badge>
        <span className="text-muted-foreground">
          {pr.repository.owner}/{pr.repository.name}#{pr.number}
        </span>
        {pr.commentsTotalCount > 0 && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <MessageSquare className="size-3" />
            <span className="font-mono">{formatNumber(pr.commentsTotalCount)}</span>
          </span>
        )}
        {pr.unresolvedThreadCount > 0 && (
          <span className="text-warning">
            <span className="font-mono">{formatNumber(pr.unresolvedThreadCount)}</span> unresolved
          </span>
        )}
        <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">
          <span className="inline-block min-w-[2ch] text-right">{updated.digits}</span>
          {updated.unit}
        </span>
      </div>
      <div className="mt-1 font-medium">{pr.title}</div>
      <div className="mt-1 text-sm text-muted-foreground">
        {authorOrBase}
        {bucketSuffix && <>{' · '}{renderSuffixParts(bucketSuffix)}</>}
        {hint && <>{' · '}{renderSuffixParts(hint)}</>}
        {autoRetargetedFromBaseRefName && (
          <>
            {' · '}
            <Badge variant="outline" className="align-middle font-normal text-muted-foreground">
              <GitBranch className="size-3" />
              auto-retargeted from {autoRetargetedFromBaseRefName}
            </Badge>
          </>
        )}
      </div>
    </a>
  )
}
