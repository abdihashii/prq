import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2 } from 'lucide-react'
import { SignInFlow } from '@/components/sign-in-flow'
import { Button } from '@/components/ui/button'
import { useTokenHealth } from '@/hooks/use-token-health'
import { signOut as signOutRequest } from '@/queries/auth'

interface AuthSectionProps {
  onAuthChange: (signedIn: boolean) => void
  signedOut: boolean
}

export function AuthSection({ onAuthChange, signedOut }: AuthSectionProps) {
  const queryClient = useQueryClient()
  const tokenHealth = useTokenHealth({ enabled: !signedOut })

  const signOut = useMutation({
    mutationFn: signOutRequest,
    onSuccess: () => {
      onAuthChange(false)
      queryClient.removeQueries({ queryKey: ['token-health'] })
      queryClient.removeQueries({ queryKey: ['prs'] })
    },
  })

  // Use isSuccess (not data !== undefined): TanStack preserves the last
  // successful `data` after a subsequent refetch error, so checking `data`
  // would keep showing "Connected as @old" forever after sign-out.
  const isSignedIn = tokenHealth.isSuccess

  const handleSignInSuccess = () => {
    // Mirror the prior PatSection flow: flip parent state, clear caches so
    // the dashboard refetches from a clean slate.
    onAuthChange(true)
    queryClient.removeQueries({ queryKey: ['token-health'] })
    queryClient.removeQueries({ queryKey: ['prs'] })
  }

  if (tokenHealth.isLoading) {
    return (
      <section className="flex items-center gap-2 text-sm">
        <Loader2 className="size-4 shrink-0 animate-spin" />
        <span className="text-muted-foreground">Checking…</span>
      </section>
    )
  }

  if (isSignedIn) {
    return (
      <section className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <Check className="text-success size-4 shrink-0" aria-hidden />
          <span className="min-w-0 truncate">
            Connected as
            {' '}
            <span className="font-mono">
              @
              {tokenHealth.data.login}
            </span>
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => signOut.mutate()}
          disabled={signOut.isPending}
        >
          Sign out
        </Button>
      </section>
    )
  }

  return (
    <section className="space-y-3">
      <SignInFlow onSuccess={handleSignInSuccess} />
    </section>
  )
}
