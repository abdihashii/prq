import { Github } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function SignInFlow() {
  return <SignInButton />
}

export function SignInButton() {
  return (
    <Button asChild type="button">
      <a href="/api/auth/github/start">
        <Github className="size-4" />
        Sign in with GitHub
      </a>
    </Button>
  )
}
