import { Moon, Sun } from 'lucide-react'
import type { Theme } from '@prq/shared'
import { Button } from '@/components/ui/button'

interface ThemeToggleProps {
  resolvedTheme: Theme
  onChange: (next: Theme) => void
}

export function ThemeToggle({ resolvedTheme, onChange }: ThemeToggleProps) {
  const isDark = resolvedTheme === 'dark'
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => onChange(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </Button>
  )
}
