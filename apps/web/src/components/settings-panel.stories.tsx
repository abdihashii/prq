import type { Meta, StoryObj } from '@storybook/react-vite'
import { SettingsPanel } from './settings-panel'
import { withQueryClient } from './story-utils/with-query-client'
import {
  INSTALLATIONS_MULTI,
  TRACKABLE_REPOS,
} from '@/lib/access-fixtures/access-fixtures'
import { TOKEN_HEALTH } from '@/lib/auth-fixtures/auth-fixtures'
import { TOKEN_HEALTH_QUERY_KEY } from '@/hooks/use-token-health'

const noop = () => {}

const meta = {
  title: 'Composites/SettingsPanel',
  component: SettingsPanel,
  args: {
    open: true,
    onOpenChange: noop,
    pollingMs: 30_000,
    tracking: { mode: 'all' },
    trackableRepos: TRACKABLE_REPOS,
    installations: INSTALLATIONS_MULTI,
    trackableReposLoading: false,
    resolvedTheme: 'light',
    onPollingMsChange: noop,
    onTrackingChange: noop,
    onThemeChange: noop,
    onAuthChange: noop,
    signedOut: false,
  },
  decorators: [withQueryClient(client => client.setQueryData(TOKEN_HEALTH_QUERY_KEY, TOKEN_HEALTH))],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Settings sheet (drawer on mobile): auth status, theme toggle, polling cadence, and the tracked-repo picker with the manage-access footnote. Save is enabled only once a field is edited.',
      },
    },
  },
} satisfies Meta<typeof SettingsPanel>

export default meta
type Story = StoryObj<typeof meta>

export const Open: Story = {}

export const CustomTracking: Story = {
  args: { tracking: { mode: 'custom', repos: ['acme/web', 'acme/api'] } },
}

export const LoadingRepos: Story = {
  args: { trackableReposLoading: true },
}
