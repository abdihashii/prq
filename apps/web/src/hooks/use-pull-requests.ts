import type { PollingMs, TrackedRepos } from '@prq/shared'
import { useQuery } from '@tanstack/react-query'
import { getRefetchInterval } from '@/lib/poll-interval/poll-interval'
import { fetchPullRequests } from '@/queries/pull-requests'

interface UsePullRequestsArgs {
  pollingMs: PollingMs
  trackedRepos: TrackedRepos
}

export function usePullRequests({ pollingMs, trackedRepos }: UsePullRequestsArgs) {
  return useQuery({
    queryKey: ['prs', trackedRepos],
    queryFn: () => fetchPullRequests(trackedRepos),
    refetchInterval: query => getRefetchInterval(query.state.error, pollingMs),
  })
}
