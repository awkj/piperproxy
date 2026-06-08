import { api, swrFetcher } from './client';

/**
 * 控制台日志（piper 内部 logger 输出）。
 * 对应 GET /api/logs。
 */
export interface ConsoleLogItem {
  id: number;
  date: number;
  level: string;
  text: string;
  logId?: string;
}

export interface ConsoleLogResp {
  log: ConsoleLogItem[];
  curLogId?: number;
  lastLogId?: number;
}

export const CONSOLE_LOG_URL = 'api/logs';

export interface FetchLogsParams {
  startLogTime: number;
  logId?: string;
  count?: number;
}

export async function fetchConsoleLogs(params: FetchLogsParams): Promise<ConsoleLogResp> {
  const search = new URLSearchParams();
  search.set('startLogTime', String(params.startLogTime));
  search.set('logId', params.logId ?? '');
  search.set('count', String(params.count ?? 100));
  return api.get(`${CONSOLE_LOG_URL}?${search.toString()}`).json<ConsoleLogResp>();
}

// SWR fetcher（key = full URL）
export const consoleLogFetcher = (url: string): Promise<ConsoleLogResp> =>
  swrFetcher<ConsoleLogResp>(url);
