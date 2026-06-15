import type { PollingMs, TrackingState } from '@prq/shared'
import { useQuery } from '@tanstack/react-query'
import { getRefetchInterval } from '@/lib/poll-interval/poll-interval'
import { toReposParam } from '@/lib/tracking/tracking'
import { fetchPullRequests } from '@/queries/pull-requests'

interface UsePullRequestsArgs {
  pollingMs: PollingMs
  tracking: TrackingState
  enabled?: boolean
}

export function usePullRequests({ pollingMs, tracking, enabled = true }: UsePullRequestsArgs) {
  const reposParam = toReposParam(tracking)
  return useQuery({
    queryKey: ['prs', reposParam],
    queryFn: () => fetchPullRequests(reposParam),
    refetchInterval: query => getRefetchInterval(query.state.error, pollingMs),
    enabled,
  })
}
