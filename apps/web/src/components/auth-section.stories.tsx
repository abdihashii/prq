import type { Meta, StoryObj } from '@storybook/react-vite'
import { AuthSection } from './auth-section'
import { withQueryClient } from './story-utils/with-query-client'
import { TOKEN_HEALTH } from '@/lib/auth-fixtures/auth-fixtures'

const meta = {
  title: 'Components/AuthSection',
  component: AuthSection,
  args: { onAuthChange: () => {} },
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Auth status block in settings. Shows "Connected as @login" with a Sign out button when token health resolves, otherwise the SignInFlow. Reads the shared token-health query.',
      },
    },
  },
} satisfies Meta<typeof AuthSection>

export default meta
type Story = StoryObj<typeof meta>

export const SignedIn: Story = {
  args: { signedOut: false },
  decorators: [withQueryClient(client => client.setQueryData(['token-health'], TOKEN_HEALTH))],
}

export const SignedOut: Story = {
  args: { signedOut: true },
  decorators: [withQueryClient()],
}
