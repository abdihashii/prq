import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface PatErrorPageProps {
  onOpenSettings: () => void
}

export function PatErrorPage({ onOpenSettings }: PatErrorPageProps) {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <Card className="mt-12">
        <CardHeader>
          <CardTitle className="text-xl">No GitHub token set.</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-4">
          <p>Open Settings to set or update your GitHub PAT.</p>
          <p>
            Create one at{' '}
            <a
              href="https://github.com/settings/tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-2"
            >
              github.com/settings/tokens
            </a>
            {' '}with these scopes: Metadata, Pull requests, Contents, Issues (Read-only),
            or classic <code className="bg-muted rounded px-1 text-xs">repo</code>.
          </p>
          <Button onClick={onOpenSettings}>Open Settings</Button>
        </CardContent>
      </Card>
    </main>
  )
}
