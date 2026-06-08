import { api, swrFetcher } from './client';
import type { ThrottleConfig } from './types.gen';

export type { ThrottleConfig };

export const THROTTLE_URL = 'api/throttle';

export const fetchThrottle = () => swrFetcher<ThrottleConfig>(THROTTLE_URL);

export async function setThrottle(cfg: ThrottleConfig): Promise<ThrottleConfig> {
  return api.put(THROTTLE_URL, { json: cfg }).json<ThrottleConfig>();
}

export const PRESETS = [
  { id: 'off',     label: 'No Throttle' },
  { id: 'offline', label: 'Offline' },
  { id: 'gprs',    label: 'GPRS (2G)' },
  { id: 'edge',    label: 'EDGE' },
  { id: '3g',      label: '3G' },
  { id: '4g',      label: '4G/LTE' },
  { id: 'dsl',     label: 'DSL' },
  { id: 'wifi',    label: 'WiFi' },
  { id: 'custom',  label: 'Custom…' },
] as const;

export type PresetId = typeof PRESETS[number]['id'];
