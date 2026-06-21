import type { Meta, StoryObj } from '@storybook/react-vite'
import { ThemeToggle } from './theme-toggle'

const meta = {
  title: 'Components/ThemeToggle',
  component: ThemeToggle,
  args: { onChange: () => {} },
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Icon button that flips the resolved theme. Shows a sun in light mode and a moon in dark mode; the aria-label announces the target theme.',
      },
    },
  },
} satisfies Meta<typeof ThemeToggle>

export default meta
type Story = StoryObj<typeof meta>

export const Light: Story = {
  args: { resolvedTheme: 'light' },
}

export const Dark: Story = {
  args: { resolvedTheme: 'dark' },
}
