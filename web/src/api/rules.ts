import { api, swrFetcher } from './client';

export interface RuleItem {
  name: string;
  value: string;
}

export type RulesListResp = RuleItem[];

export const RULES_LIST_URL = 'api/rules';
export const RULES_GLOBAL_URL = 'api/init';

export interface RulesGlobalState {
  /** 当前启用（已勾选）的分组名集合 */
  selectedNames: string[];
  disabledAllRules: boolean;
  allowMultipleChoice: boolean;
  defaultRulesIsDisabled: boolean;
}

interface InitRulesPayload {
  rules?: {
    defaultRulesIsDisabled?: boolean;
    allowMultipleChoice?: boolean;
    list?: Array<{ name: string; selected?: boolean }>;
  };
  disabledAllRules?: boolean;
}

type MutationResp = { ec?: number; em?: string };

export const fetchRulesList = () => swrFetcher<RulesListResp>(RULES_LIST_URL);

export const fetchRulesGlobalState = async (): Promise<RulesGlobalState> => {
  const data = await swrFetcher<InitRulesPayload>(RULES_GLOBAL_URL);
  const list = data.rules?.list ?? [];
  return {
    selectedNames: list.filter((r) => r.selected).map((r) => r.name),
    disabledAllRules: !!data.disabledAllRules,
    allowMultipleChoice: !!data.rules?.allowMultipleChoice,
    defaultRulesIsDisabled: !!data.rules?.defaultRulesIsDisabled,
  };
};

export const saveRule = (name: string, value: string) =>
  api
    .put(`api/rules/${encodeURIComponent(name)}/enable`, { json: { value } })
    .json<MutationResp>();

export const addRuleGroup = (name: string, value = '') =>
  api
    .post('api/rules', { json: { name, value } })
    .json<MutationResp>();

export const removeRuleGroup = (name: string) =>
  api
    .delete(`api/rules/${encodeURIComponent(name)}`)
    .json<MutationResp>();

export const renameRuleGroup = (name: string, newName: string) =>
  api
    .put(`api/rules/${encodeURIComponent(name)}`, { json: { newName } })
    .json<MutationResp>();

/** 启用单条规则 */
export const enableRule = (name: string, value: string) =>
  api
    .put(`api/rules/${encodeURIComponent(name)}/enable`, { json: { value } })
    .json<MutationResp>();

export const disableRule = (name: string) =>
  api
    .put(`api/rules/${encodeURIComponent(name)}/disable`, {})
    .json<MutationResp>();

export const setDisableAllRules = (disabled: boolean) =>
  api
    .put('api/rules/settings', {
      json: { disabledAllRules: disabled ? 1 : 0 },
    })
    .json<MutationResp>();

export const setAllowMultipleChoice = (allow: boolean) =>
  api
    .put('api/rules/settings', {
      json: { allowMultipleChoice: allow ? 1 : 0 },
    })
    .json<MutationResp>();

/** 切换 Default 分组的启用状态 */
export const toggleDefaultRulesDisabled = () =>
  api.put('api/rules/settings', { json: { toggleDefault: 1 } }).json<MutationResp>();

export const importRulesFile = async (file: File, replace: boolean) => {
  const fd = new FormData();
  fd.append('rules', file);
  if (replace) fd.append('replace', '1');
  return api.post('api/rules/import', { body: fd }).json<{
    ec?: number;
    em?: string;
  }>();
};

export const exportRulesUrl = () => 'api/rules/export';
