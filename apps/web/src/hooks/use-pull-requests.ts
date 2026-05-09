import { useQuery } from '@tanstack/react-query'
import { getRefetchInterval } from '#/lib/poll-interval/poll-interval.js'
import { fetchPullRequests } from '#/queries/pull-requests.js'

export function usePullRequests() {
  return useQuery({
    queryKey: ['prs'],
    queryFn: fetchPullRequests,
    refetchInterval: (query) => getRefetchInterval(query.state.error, 30_000),
  })
}
