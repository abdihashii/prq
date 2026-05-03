import { useQuery } from '@tanstack/react-query'
import { fetchPullRequests } from '#/queries/pull-requests.js'

export function usePullRequests() {
  return useQuery({
    queryKey: ['prs'],
    queryFn: fetchPullRequests,
    refetchInterval: 30_000,
  })
}
