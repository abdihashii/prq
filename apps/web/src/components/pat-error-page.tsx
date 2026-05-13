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
          <CardTitle className="text-xl">Token rejected.</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Open Settings to set or update your GitHub PAT.
          </p>
          <Button onClick={onOpenSettings}>Open Settings</Button>
        </CardContent>
      </Card>
    </main>
  )
}
