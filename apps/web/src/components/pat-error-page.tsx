import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card.js'

export function PatErrorPage() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <Card className="mt-12">
        <CardHeader>
          <CardTitle className="text-xl">Token rejected.</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Update <Code>GITHUB_TOKEN</Code> in <Code>apps/api/.env</Code>, then restart the API
            server.
          </p>
        </CardContent>
      </Card>
    </main>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-muted text-foreground rounded px-1 py-0.5 text-sm">{children}</code>
  )
}
