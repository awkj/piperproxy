import { useEffect, useMemo, useRef } from 'react'
import useSWR from 'swr'
import { usePiperApi } from '../../context'
import { fetchValues, VALUES_URL, type ValueItem } from '../../api/values'
import { fetchPlugins, PLUGINS_URL, type PluginItem } from '../../api/plugins'
import type { VarHintProvider } from './cm-whistle-autocomplete'

interface PluginVarsConf {
  hintList?: string[]
  hintSuffix?: string[]
  hintUrl?: string
}

interface PluginWithVars extends PluginItem {
  pluginVars?: PluginVarsConf | boolean
}

interface AutocompleteData {
  values: ValueItem[]
  plugins: Record<string, PluginWithVars>
}

export function useRulesAutocompleteData(): VarHintProvider {
  const client = usePiperApi()

  const { data: valuesData } = useSWR(VALUES_URL, () => fetchValues(client), {
    refreshInterval: 0,
    revalidateOnFocus: false,
  })
  const { data: pluginsResp } = useSWR(PLUGINS_URL, () => fetchPlugins(client), {
    refreshInterval: 0,
    revalidateOnFocus: false,
  })

  const dataRef = useRef<AutocompleteData>({ values: [], plugins: {} })

  useEffect(() => {
    dataRef.current = {
      values: valuesData ?? [],
      plugins: (pluginsResp?.plugins ?? {}) as Record<string, PluginWithVars>,
    }
  }, [valuesData, pluginsResp])

  return useMemo<VarHintProvider>(
    () => ({
      getValueNames: () => dataRef.current.values.map((v) => v.name),
      getPluginNames: () => {
        return Object.keys(dataRef.current.plugins).map((full) => stripPluginPrefix(full))
      },
      getPluginVars: (shortName) => {
        const plugin = lookupPlugin(dataRef.current.plugins, shortName)
        if (!plugin || plugin.pluginVars === true || !plugin.pluginVars) {
          return []
        }
        return plugin.pluginVars.hintList ?? []
      },
    }),
    [],
  )
}

function stripPluginPrefix(fullName: string): string {
  let name = fullName.endsWith(':') ? fullName.slice(0, -1) : fullName
  if (name.startsWith('whistle.')) name = name.slice('whistle.'.length)
  return name
}

function lookupPlugin(
  plugins: Record<string, PluginWithVars>,
  shortName: string,
): PluginWithVars | undefined {
  return (
    plugins[`whistle.${shortName}:`] ??
    plugins[`${shortName}:`] ??
    plugins[`whistle.${shortName}`] ??
    plugins[shortName]
  )
}
