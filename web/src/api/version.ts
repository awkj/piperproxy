import { swrFetcher } from './client';

export interface CheckUpdateResp {
  em?: string;
  showUpdate?: boolean;
  hasNewVersion?: boolean;
  hasUpdater?: boolean;
  version: string;
  latestVersion?: string;
  latestClientVersion?: string;
}

export const CHECK_UPDATE_URL = 'api/version';

export const fetchCheckUpdate = () => swrFetcher<CheckUpdateResp>(CHECK_UPDATE_URL);
