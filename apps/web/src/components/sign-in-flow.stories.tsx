import type { Meta, StoryObj } from '@storybook/react-vite'
import { SignInButton } from './sign-in-flow'

const meta = {
  title: 'Composites/SignInFlow',
  component: SignInButton,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof SignInButton>

export default meta

type Story = StoryObj<typeof SignInButton>

export const Button: Story = {}
