import { useQuery } from '@tanstack/react-query'
import { fetchTokenHealth } from '@/queries/token-health'

export const TOKEN_HEALTH_QUERY_KEY = ['token-health'] as const

interface UseTokenHealthArgs {
  enabled?: boolean
}

export function useTokenHealth({ enabled = true }: UseTokenHealthArgs = {}) {
  return useQuery({
    queryKey: TOKEN_HEALTH_QUERY_KEY,
    queryFn: fetchTokenHealth,
    retry: false,
    enabled,
  })
}
