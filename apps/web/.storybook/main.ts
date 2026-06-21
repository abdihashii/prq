import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-themes'],
  async viteFinal(config) {
    // Strip the app's server/runtime plugins: Storybook renders components in the
    // browser only. TanStack Start owns the `#tanstack-*` server virtual modules,
    // and Cloudflare wires up the Workers SSR graph that imports them — leaving
    // Cloudflare in (while Start is stripped) leaves those imports unresolvable and
    // breaks dev's dependency optimizer.
    const dropPattern = /^(@tanstack|tanstack)[/\-:]|cloudflare/
    const flat = (config.plugins ?? []).flat(Infinity) as Array<{ name?: string } | null | false>
    config.plugins = flat.filter((plugin): plugin is { name?: string } => {
      if (!plugin || typeof plugin !== 'object') return false
      const name = 'name' in plugin && typeof plugin.name === 'string' ? plugin.name : ''
      return !dropPattern.test(name)
    })
    return config
  },
}

export default config
