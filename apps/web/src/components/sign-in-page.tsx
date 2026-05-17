import { useQueryClient } from '@tanstack/react-query'
import { SignInFlow } from '@/components/sign-in-flow'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface SignInPageProps {
  onSignIn: () => void
}

export function SignInPage({ onSignIn }: SignInPageProps) {
  const queryClient = useQueryClient()

  const handleSuccess = () => {
    onSignIn()
    queryClient.removeQueries({ queryKey: ['token-health'] })
    queryClient.removeQueries({ queryKey: ['prs'] })
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Card className="mt-12">
        <CardHeader>
          <CardTitle className="text-xl">Sign in to prq</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-4">
          <p>
            Authorize prq with your GitHub account to load the PRs you care about.
            The token is stored locally in an HttpOnly cookie and never leaves your
            machine.
          </p>
          <SignInFlow onSuccess={handleSuccess} />
        </CardContent>
      </Card>
    </main>
  )
}
