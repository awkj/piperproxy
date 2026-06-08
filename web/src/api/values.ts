import { api, swrFetcher } from './client';

export interface ValueItem {
  name: string;
  value: string;
}

export interface RecycleItem {
  filename: string;
  selected?: boolean;
  data?: string;
}

export const VALUES_URL = 'api/values';
export const RECYCLE_URL = 'api/values/recycle';

export const fetchValues = () => swrFetcher<ValueItem[]>(VALUES_URL);

export const fetchRecycleList = () =>
  swrFetcher<{ list: RecycleItem[] }>(RECYCLE_URL);

export const addValue = (name: string, value: string) =>
  api
    .post('api/values', { json: { name, value } })
    .json<{ em?: string }>();

export const removeValue = (name: string) =>
  api
    .delete(`api/values/${encodeURIComponent(name)}`)
    .json<{ em?: string }>();

export const renameValue = (name: string, newName: string) =>
  api
    .put(`api/values/${encodeURIComponent(name)}`, { json: { newName } })
    .json<{ em?: string }>();

export const restoreValueFromRecycle = (filename: string) =>
  api
    .get(`api/values/recycle/${encodeURIComponent(filename)}`)
    .json<{ ec?: number; em?: string; data?: string }>();

export const removeRecycleItem = (name: string) =>
  api
    .delete(`api/values/recycle/${encodeURIComponent(name)}`)
    .json<{ em?: string; list?: RecycleItem[] }>();

/**
 * 导入 values（Track A：简化为 JSON body）。
 */
export const importValues = async (
  data: Record<string, string>,
  replace = true,
): Promise<{ em?: string }> => {
  const body =
    (replace ? '1\r\n' : '\r\n') +
    JSON.stringify(data, null, '  ') +
    '\r\n';
  const res = await api.post('api/values/import', {
    body,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
  const text = await res.text();
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    if (json && typeof json['em'] === 'string') {
      return { em: json['em'] };
    }
  } catch {
    /* not json */
  }
  return {};
};

/**
 * 导出全部 values 为 JSON 文件并触发浏览器下载。
 */
export const exportAllValuesUrl = (filename?: string): string => {
  const params = new URLSearchParams();
  if (filename) params.set('filename', filename);
  const qs = params.toString();
  return 'api/values/export' + (qs ? '?' + qs : '');
};
