import type { Meta, StoryObj } from '@storybook/react-vite'
import { DeviceCodePrompt, FlowError, SignInButton } from './sign-in-flow'

const meta = {
  title: 'Composites/SignInFlow',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Visual states of the OAuth Device Flow sign-in component. SignInFlow itself is a stateful container; these stories cover the presentational pieces it composes: SignInButton (initial), DeviceCodePrompt (waiting), FlowError (terminal failure).',
      },
    },
  },
} satisfies Meta

export default meta

type ButtonStory = StoryObj<typeof SignInButton>

export const ButtonIdle: ButtonStory = {
  name: 'SignInButton / idle',
  render: args => <SignInButton {...args} />,
  args: { onStart: () => {}, isStarting: false, error: null },
}

export const ButtonStarting: ButtonStory = {
  name: 'SignInButton / starting',
  render: args => <SignInButton {...args} />,
  args: { onStart: () => {}, isStarting: true, error: null },
}

export const ButtonError: ButtonStory = {
  name: 'SignInButton / error',
  render: args => <SignInButton {...args} />,
  args: {
    onStart: () => {},
    isStarting: false,
    error: 'Failed to start sign-in. Please try again.',
  },
}

type PromptStory = StoryObj<typeof DeviceCodePrompt>

export const PromptWaiting: PromptStory = {
  name: 'DeviceCodePrompt / waiting',
  render: args => <DeviceCodePrompt {...args} />,
  args: {
    userCode: 'WXYZ-1234',
    verificationUri: 'https://github.com/login/device',
  },
}

type ErrorStory = StoryObj<typeof FlowError>

export const ErrorExpired: ErrorStory = {
  name: 'FlowError / code expired',
  render: args => <FlowError {...args} />,
  args: {
    title: 'Code expired',
    description: 'The device code expired before you authorized. Start a new sign-in.',
    onRestart: () => {},
  },
}

export const ErrorDenied: ErrorStory = {
  name: 'FlowError / sign-in cancelled',
  render: args => <FlowError {...args} />,
  args: {
    title: 'Sign-in cancelled',
    description: 'You declined the request on GitHub. Try again to grant access.',
    onRestart: () => {},
  },
}

export const ErrorPollingFailed: ErrorStory = {
  name: 'FlowError / polling failed',
  render: args => <FlowError {...args} />,
  args: {
    title: 'Polling failed',
    description: 'Failed to reach GitHub. Try again.',
    onRestart: () => {},
  },
}
