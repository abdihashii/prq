import type { Meta, StoryObj } from '@storybook/react-vite'
import { RepoPicker } from './repo-picker'
import {
  TRACKABLE_REPOS,
  TRACKABLE_REPOS_MANY,
} from '@/lib/access-fixtures/access-fixtures'

const meta = {
  title: 'Components/RepoPicker',
  component: RepoPicker,
  args: { onChange: () => {} },
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Tracked-repo selector. "All" tracks everything in scope; "Select" reveals a virtualized checklist (with search past 10 repos) plus removable chips for the current selection.',
      },
    },
  },
} satisfies Meta<typeof RepoPicker>

export default meta
type Story = StoryObj<typeof meta>

export const AllMode: Story = {
  args: { trackableRepos: TRACKABLE_REPOS, draftTracking: { mode: 'all' } },
}

export const CustomSelection: Story = {
  args: {
    trackableRepos: TRACKABLE_REPOS,
    draftTracking: { mode: 'custom', repos: ['acme/web', 'acme/api'] },
  },
}

export const CustomEmpty: Story = {
  args: {
    trackableRepos: TRACKABLE_REPOS,
    draftTracking: { mode: 'custom', repos: [] },
  },
}

export const WithSearch: Story = {
  args: {
    trackableRepos: TRACKABLE_REPOS_MANY,
    draftTracking: { mode: 'custom', repos: ['acme/service-01'] },
  },
}

export const Loading: Story = {
  args: { trackableRepos: [], draftTracking: { mode: 'all' }, loading: true },
}
