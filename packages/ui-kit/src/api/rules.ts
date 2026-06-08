import type { PiperApiClient } from '../client'

export interface RuleItem {
  name: string
  value: string
}

export type RulesListResp = RuleItem[]

export const RULES_LIST_URL = 'api/rules'
export const RULES_GLOBAL_URL = 'api/init'

export interface RulesGlobalState {
  selectedNames: string[]
  disabledAllRules: boolean
  allowMultipleChoice: boolean
  defaultRulesIsDisabled: boolean
}

interface InitRulesPayload {
  rules?: {
    defaultRulesIsDisabled?: boolean
    allowMultipleChoice?: boolean
    list?: Array<{ name: string; selected?: boolean }>
  }
  disabledAllRules?: boolean
}

type MutationResp = { ec: number; em?: string }

export const fetchRulesList = (client: PiperApiClient): Promise<RulesListResp> =>
  client.get<RulesListResp>(RULES_LIST_URL)

export const fetchRulesGlobalState = async (
  client: PiperApiClient,
): Promise<RulesGlobalState> => {
  const data = await client.get<InitRulesPayload>(RULES_GLOBAL_URL)
  const list = data.rules?.list ?? []
  return {
    selectedNames: list.filter((r) => r.selected).map((r) => r.name),
    disabledAllRules: !!data.disabledAllRules,
    allowMultipleChoice: !!data.rules?.allowMultipleChoice,
    defaultRulesIsDisabled: !!data.rules?.defaultRulesIsDisabled,
  }
}

export const saveRule = (client: PiperApiClient, name: string, value: string) =>
  client.raw
    .put(`api/rules/${encodeURIComponent(name)}/enable`, { json: { value } })
    .json<MutationResp>()

export const addRuleGroup = (client: PiperApiClient, name: string, value = '') =>
  client.post<MutationResp>('api/rules', { name, value })

export const removeRuleGroup = (client: PiperApiClient, name: string) =>
  client.raw.delete(`api/rules/${encodeURIComponent(name)}`).json<MutationResp>()

export const renameRuleGroup = (client: PiperApiClient, name: string, newName: string) =>
  client.raw
    .put(`api/rules/${encodeURIComponent(name)}`, { json: { newName } })
    .json<MutationResp>()

export const enableRule = (client: PiperApiClient, name: string, value: string) =>
  client.raw
    .put(`api/rules/${encodeURIComponent(name)}/enable`, { json: { value } })
    .json<MutationResp>()

export const disableRule = (client: PiperApiClient, name: string) =>
  client.raw.put(`api/rules/${encodeURIComponent(name)}/disable`, {}).json<MutationResp>()

export const setDisableAllRules = (client: PiperApiClient, disabled: boolean) =>
  client.raw
    .put('api/rules/settings', { json: { disabledAllRules: disabled ? 1 : 0 } })
    .json<MutationResp>()

export const setAllowMultipleChoice = (client: PiperApiClient, allow: boolean) =>
  client.raw
    .put('api/rules/settings', { json: { allowMultipleChoice: allow ? 1 : 0 } })
    .json<MutationResp>()

export const toggleDefaultRulesDisabled = (client: PiperApiClient) =>
  client.raw.put('api/rules/settings', { json: { toggleDefault: 1 } }).json<MutationResp>()

export const importRulesFile = async (
  client: PiperApiClient,
  file: File,
  replace: boolean,
) => {
  const fd = new FormData()
  fd.append('rules', file)
  if (replace) fd.append('replace', '1')
  return client.raw.post('api/rules/import', { body: fd }).json<{ ec?: number; em?: string }>()
}

export const exportRulesUrl = (client: PiperApiClient): string => {
  const base = client.baseUrl === '/' || client.baseUrl === '' ? '' : client.baseUrl.replace(/\/$/, '')
  return `${base}/api/rules/export`
}
