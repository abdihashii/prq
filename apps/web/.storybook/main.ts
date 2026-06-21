import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-themes'],
  async viteFinal(config) {
    // Storybook auto-loads the app's vite.config.ts and merges its plugins. Drop
    // the app's server/runtime plugins, which have no place in a browser-only
    // Storybook: TanStack Start owns the `#tanstack-*` server virtual modules and
    // Cloudflare wires up the Workers SSR graph that imports them, so inheriting
    // either leaves those imports unresolvable and breaks dev's dependency optimizer.
    //
    // This is a denylist by design, not an allowlist: the merged list also holds
    // Storybook's own plugins, Vite core plugins, and anonymous (unnamed) plugins,
    // all of which must stay. Names are anchored to avoid stripping an unrelated
    // plugin that merely contains "cloudflare". If a future server plugin added to
    // vite.config.ts breaks the build, the build-storybook CI job fails and points
    // here; add its name below.
    const appServerPlugin = /^(@?tanstack[/\-:]|@cloudflare\/vite-plugin|vite-plugin-cloudflare)/
    const flat = (config.plugins ?? []).flat(Infinity) as Array<{ name?: string } | null | false>
    config.plugins = flat.filter((plugin): plugin is { name?: string } => {
      if (!plugin || typeof plugin !== 'object') return false
      const name = 'name' in plugin && typeof plugin.name === 'string' ? plugin.name : ''
      return !appServerPlugin.test(name)
    })
    return config
  },
}

export default config
