import type { CaptureItem, NetworkInterfacesResponse } from './types.gen';
import { swrFetcher, api } from './client';

// 历史调用方仍 import 这两个名字；实现已迁到 @piper/ui-kit。
// 新代码应直接 import { useCaptureStream } from '@piper/ui-kit'。
export type { CaptureStreamHandlers, StreamFilter } from '@piper/ui-kit';

// NetworkItem 是 CaptureItem 的别名，保持所有消费方的 import 路径不变。
export type { CaptureItem as NetworkItem };

// --------------------------------------------------------------------------
// 网卡 / 监听端口（系统代理面板用）
// --------------------------------------------------------------------------

export const NETWORK_INTERFACES_URL = 'api/network/interfaces';

export const fetchNetworkInterfaces = () =>
  swrFetcher<NetworkInterfacesResponse>(NETWORK_INTERFACES_URL);

// --------------------------------------------------------------------------
// 工具函数
// --------------------------------------------------------------------------

/** 从 URL 派生 hostname / path，当 Go 后端未填充时补全。 */
export function normalizeCapture(item: CaptureItem): CaptureItem {
  if (!item.hostname || !item.path) {
    try {
      const u = new URL(item.url);
      return {
        ...item,
        hostname: item.hostname || u.host,
        path: item.path || `${u.pathname}${u.search}`,
      };
    } catch {
      // URL 解析失败则原样使用
    }
  }
  return item;
}

// SSE 抓包流的 hook 已迁到 @piper/ui-kit (useCaptureStream)。
// CaptureStreamHandlers / StreamFilter 类型从 ui-kit re-export（见上方 line 6）。

// --------------------------------------------------------------------------
// 高亮 / 备注
// --------------------------------------------------------------------------

export async function setHighlight(id: string, value?: boolean): Promise<{ highlighted: boolean }> {
  return api.post(`api/captures/${id}/highlight`, {
    json: value !== undefined ? { value } : {},
  }).json<{ highlighted: boolean }>();
}

export async function setComment(id: string, value: string): Promise<{ comment: string }> {
  return api.post(`api/captures/${id}/comment`, { json: { value } }).json<{ comment: string }>();
}

// --------------------------------------------------------------------------
// Code generator (curl)
// --------------------------------------------------------------------------

/**
 * 调后端 codegen，把指定抓包翻译成可粘到 macOS / Linux POSIX shell 的 curl 命令。
 * 生成逻辑统一在 server/internal/codegen，前端不再自己拼字符串。
 */
export async function fetchCaptureCurl(id: string): Promise<string> {
  const { command } = await api
    .get(`api/captures/${id}/curl`)
    .json<{ command: string }>();
  return command;
}
