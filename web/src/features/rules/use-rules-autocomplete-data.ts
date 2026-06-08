// 给 RulesPanel 的自动补全 varProvider 注入数据。
//
// - values 列表：来自 `cgi-bin/values/list2`（共享 SWR 缓存 key 与 ValuesPanel）。
// - plugins 列表：来自 `cgi-bin/plugins/get-plugins`，与 PluginsPanel 同 key。
// - plugin vars：从 plugin 对象上的 `pluginVars.hintList` 读静态 hint。
//   后端 `getPluginVarsConf` 把 plugin 的 var.json/vars.json 处理后挂到响应字段
//   `pluginVars` 上，形态 `{ hintList?: string[]; hintSuffix?: string[]; hintUrl?: string } | true`。
//   这里只接静态的 `hintList`（hintSuffix / hintUrl 走 CGI 拉取，复杂度高，TODO）。
//
// 关键约束：CodeMirror 的 autocomplete extension 必须**只创建一次**，否则
// CodeMirror 会丢失光标 / 选区。我们把数据放进 ref，并通过闭包让 varProvider
// 函数读最新值。
import { useEffect, useMemo, useRef } from 'react';
import useSWR from 'swr';
import { fetchValues, VALUES_URL, type ValueItem } from '@/api/values';
import { fetchPlugins, PLUGINS_URL, type PluginItem } from '@/api/plugins';
import type { VarHintProvider } from './cm-whistle-autocomplete';

/** plugin 对象上的 pluginVars 字段（运行时由后端注入，不在 PluginItem 类型上）。 */
interface PluginVarsConf {
  hintList?: string[];
  hintSuffix?: string[];
  hintUrl?: string;
}

interface PluginWithVars extends PluginItem {
  pluginVars?: PluginVarsConf | boolean;
}

interface AutocompleteData {
  values: ValueItem[];
  plugins: Record<string, PluginWithVars>;
}

/**
 * 拉取自动补全所需的数据并返回一个稳定（引用不变）的 VarHintProvider。
 *
 * 返回的 provider 通过 ref 访问最新数据，因此可以安全地放进 `useMemo`
 * 的依赖列表（一次创建，永不重建）。
 */
export function useRulesAutocompleteData(): VarHintProvider {
  const { data: valuesData } = useSWR(VALUES_URL, fetchValues, {
    refreshInterval: 0,
    revalidateOnFocus: false,
  });
  const { data: pluginsResp } = useSWR(PLUGINS_URL, fetchPlugins, {
    refreshInterval: 0,
    revalidateOnFocus: false,
  });

  const dataRef = useRef<AutocompleteData>({ values: [], plugins: {} });

  useEffect(() => {
    dataRef.current = {
      values: valuesData ?? [],
      plugins: (pluginsResp?.plugins ?? {}) as Record<string, PluginWithVars>,
    };
  }, [valuesData, pluginsResp]);

  // 返回的 provider 引用稳定（闭包读 ref），可放心进 useMemo 依赖。
  return useMemo<VarHintProvider>(
    () => ({
      getValueNames: () => dataRef.current.values.map((v) => v.name),
      getPluginNames: () => {
        // 插件 key 形如 `whistle.foo:`，老栈在补全时按短名 `foo` 提示。
        return Object.keys(dataRef.current.plugins).map((full) =>
          stripPluginPrefix(full),
        );
      },
      getPluginVars: (shortName) => {
        const plugin = lookupPlugin(dataRef.current.plugins, shortName);
        if (!plugin || plugin.pluginVars === true || !plugin.pluginVars) {
          return [];
        }
        // TODO: 接 hintSuffix（要拼后缀）和 hintUrl（要 CGI 异步拉取）。
        return plugin.pluginVars.hintList ?? [];
      },
    }),
    [],
  );
}

/**
 * `whistle.foo:` → `foo`；`foo:` → `foo`；保留尾部冒号外的剩余内容做为短名。
 * 后端 `get-plugins` 返回的 key 一般是完整的 `whistle.foo:` 或 `foo:`，
 * 实际触发补全的 token 是 `%foo`，所以我们要给短名。
 */
function stripPluginPrefix(fullName: string): string {
  // 去掉尾部冒号
  let name = fullName.endsWith(':') ? fullName.slice(0, -1) : fullName;
  if (name.startsWith('whistle.')) name = name.slice('whistle.'.length);
  return name;
}

/** 把 `%shortName` 反查回 plugin 对象（两种 key 形态都尝试）。 */
function lookupPlugin(
  plugins: Record<string, PluginWithVars>,
  shortName: string,
): PluginWithVars | undefined {
  return (
    plugins[`whistle.${shortName}:`] ??
    plugins[`${shortName}:`] ??
    plugins[`whistle.${shortName}`] ??
    plugins[shortName]
  );
}
