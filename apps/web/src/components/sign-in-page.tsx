import { SignInFlow } from '@/components/sign-in-flow'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function SignInPage() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <Card className="mt-12">
        <CardHeader>
          <CardTitle className="text-xl">Sign in to prq</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-4">
          <p>
            Authorize prq with your GitHub account to load the PRs you care about.
            prq stores an opaque session cookie in your browser.
          </p>
          <SignInFlow />
        </CardContent>
      </Card>
    </main>
  )
}
