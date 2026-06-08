import { api, swrFetcher } from './client';

export interface PluginItem {
  name: string;
  moduleName?: string;
  version?: string;
  latest?: string;
  homepage?: string;
  description?: string;
  disabled?: boolean;
  isProj?: boolean;
  /** 插件 webui 路径（相对于 plugin.<name>/） */
  webui?: string;
  /** 插件配置页路径 */
  option?: string;
  /** 插件规则页路径 */
  rulesUrl?: string;
  /** npm 注册源 */
  registry?: string;
  /** 插件图标 */
  icon?: string;
}

export const PLUGINS_URL = 'api/plugins';

export interface PluginsResp {
  plugins?: Record<string, PluginItem>;
  disabledPlugins?: Record<string, 1 | 0>;
  disabledAllPlugins?: boolean;
}

export const fetchPlugins = () => swrFetcher<PluginsResp>(PLUGINS_URL);

export const disablePlugin = (name: string, disabled: boolean) =>
  api
    .put(`api/plugins/${encodeURIComponent(name)}`, {
      json: { disabled: disabled ? 1 : 0 },
    })
    .json<{ em?: string }>();

export const uninstallPlugin = (name: string) =>
  api
    .delete(`api/plugins/${encodeURIComponent(name)}`)
    .json<{ em?: string }>();

export const disableAllPlugins = (disabled: boolean) =>
  api
    .put('api/plugins/settings', {
      json: { disabledAllPlugins: disabled ? 1 : 0 },
    })
    .json<{ em?: string }>();

// ---------- Registry ----------

export const REGISTRY_LIST_URL = 'api/plugins/registries';

export interface RegistryListResp {
  list?: string[];
}

export const fetchRegistryList = () =>
  swrFetcher<RegistryListResp>(REGISTRY_LIST_URL);

export const addRegistry = (registry: string) =>
  api
    .post('api/plugins/registries', { json: { registry } })
    .json<{ em?: string }>();

// ---------- Update All ----------

export const updateAllPlugins = (plugins: string[], registry?: string) => {
  const body = new URLSearchParams();
  body.set('plugins', plugins.join(' '));
  if (registry) body.set('registry', registry);
  return api
    .post('api/plugins', { body })
    .json<{ em?: string; count?: number }>();
};

// ---------- Install ----------

export interface InstallPluginsResp {
  ec?: number
  em?: string;
  count?: number;
}

export async function installPlugins(
  plugins: string,
  registry?: string,
): Promise<InstallPluginsResp> {
  const body = new URLSearchParams();
  body.set('plugins', plugins);
  if (registry) body.set('registry', registry);
  return api
    .post('api/plugins', { body })
    .json<InstallPluginsResp>();
}
