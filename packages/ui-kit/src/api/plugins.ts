import type { PiperApiClient } from '../client'

export interface PluginItem {
  name: string
  moduleName?: string
  version?: string
  latest?: string
  homepage?: string
  description?: string
  disabled?: boolean
  isProj?: boolean
  webui?: string
  option?: string
  rulesUrl?: string
  registry?: string
  icon?: string
}

export interface PluginsResp {
  plugins?: Record<string, PluginItem>
  disabledPlugins?: Record<string, 1 | 0>
  disabledAllPlugins?: boolean
}

export const PLUGINS_URL = 'api/plugins'

export const fetchPlugins = (client: PiperApiClient): Promise<PluginsResp> =>
  client.get<PluginsResp>(PLUGINS_URL)
