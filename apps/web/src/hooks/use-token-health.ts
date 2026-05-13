import { useQuery } from '@tanstack/react-query'
import { fetchTokenHealth } from '@/queries/token-health'

export function useTokenHealth() {
  return useQuery({
    queryKey: ['token-health'],
    queryFn: fetchTokenHealth,
    retry: false,
  })
}
