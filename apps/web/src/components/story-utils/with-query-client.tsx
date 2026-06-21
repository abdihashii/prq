import type { Decorator } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

/**
 * Storybook decorator that wraps a story in a fresh, isolated QueryClient.
 *
 * Components that read queries (e.g. AuthSection via `useTokenHealth`) need a
 * provider to render at all. The optional `seed` primes the cache so those
 * components show a deterministic state without any network call: `retry` is off
 * and `staleTime` is Infinity, so seeded data is treated as fresh and never
 * triggers a background refetch against a non-existent API.
 *
 * @param seed - Optional callback to prime the cache, e.g.
 *   `(client) => client.setQueryData(['token-health'], TOKEN_HEALTH)`.
 * @returns A Storybook decorator providing the seeded QueryClient.
 */
export function withQueryClient(seed?: (client: QueryClient) => void): Decorator {
  return (Story) => {
    const [client] = useState(() => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
      })
      seed?.(queryClient)
      return queryClient
    })
    return (
      <QueryClientProvider client={client}>
        <Story />
      </QueryClientProvider>
    )
  }
}
