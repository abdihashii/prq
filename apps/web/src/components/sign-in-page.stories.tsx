import type { Meta, StoryObj } from '@storybook/react-vite'
import { SignInPage } from './sign-in-page'

const meta = {
  title: 'Composites/SignInPage',
  component: SignInPage,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Unauthenticated landing page: a card explaining the GitHub authorization and session-cookie model, wrapping the SignInFlow button.',
      },
    },
  },
} satisfies Meta<typeof SignInPage>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
