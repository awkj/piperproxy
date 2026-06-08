import { api, swrFetcher } from './client';

export interface BypassRule {
  pattern: string;
  tag: string;
  enabled: boolean;
}

export interface DetectedHost {
  host: string;
  failures: number;
  last_failure: string;
}

export interface BypassListResponse {
  rules: BypassRule[];
  presets_enabled: string[];
}

export interface PinnedHostsResponse {
  hosts: DetectedHost[];
}

export const BYPASS_URL = 'api/bypass';
export const BYPASS_PINNED_URL = 'api/bypass/pinned';

export const fetchBypass = () => swrFetcher<BypassListResponse>(BYPASS_URL);
export const fetchPinnedHosts = () => swrFetcher<PinnedHostsResponse>(BYPASS_PINNED_URL);

export const addBypassRule = (rule: Omit<BypassRule, 'enabled'>) =>
  api.post(BYPASS_URL, { json: rule }).json<BypassRule>();

export const removeBypassRule = (pattern: string) =>
  api.delete(`${BYPASS_URL}/${encodeURIComponent(pattern)}`).json<{ deleted: string }>();

export const setBypassRuleEnabled = (pattern: string, enabled: boolean) =>
  api
    .put(`${BYPASS_URL}/${encodeURIComponent(pattern)}/enable`, { json: { enabled } })
    .json<{ pattern: string; enabled: boolean }>();

export const enableBypassPreset = (name: string) =>
  api.post(`${BYPASS_URL}/presets/${name}/enable`).json<{ preset: string; enabled: boolean }>();

export const disableBypassPreset = (name: string) =>
  api.post(`${BYPASS_URL}/presets/${name}/disable`).json<{ preset: string; enabled: boolean }>();

export const PRESET_LABELS: Record<string, string> = {
  apple_telemetry: 'Apple Telemetry',
  apple_push: 'Apple Push',
  google_services: 'Google Services',
  microsoft: 'Microsoft',
  cert_pinned_cn: 'Cert-Pinned (CN Banks)',
  cert_pinned_us: 'Cert-Pinned (US Banks)',
};
