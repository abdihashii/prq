import { useQuery } from '@tanstack/react-query'
import { fetchTokenHealth } from '@/queries/token-health'

interface UseTokenHealthArgs {
  enabled?: boolean
}

export function useTokenHealth({ enabled = true }: UseTokenHealthArgs = {}) {
  return useQuery({
    queryKey: ['token-health'],
    queryFn: fetchTokenHealth,
    retry: false,
    enabled,
  })
}
