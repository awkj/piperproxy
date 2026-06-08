// useCaptureStream —— 订阅 piper 后端的 /api/captures/stream SSE。
//
// 迁自 web/src/api/network.ts:connectCaptureStream（GO-5 Track B/E 实现）。
// 改造点：
//   - 从普通 function 改为 React hook，自动绑定到组件生命周期
//   - 通过 usePiperApi() 拿 client，用 client.baseUrl 派生 EventSource URL，
//     不再写死 "/api/captures/stream"
//   - item 类型通过 generic 透传给调用方；ui-kit 不假设 schema 形状
//
// 退避逻辑保持原样：onerror 后 1s/2s/4s/.../30s。

import { useEffect } from 'react';
import { resolveAbsoluteUrl } from '../client';
import { usePiperApi } from '../context';

export interface CaptureStreamHandlers<TItem = unknown> {
  onStart?: (item: TItem) => void;
  onComplete?: (item: TItem) => void;
  onError?: (ev: { id?: string; message?: string }) => void;
  onStatus?: (status: Record<string, unknown>) => void;
}

/** 服务端过滤参数（GO-5 Track E）。所有字段为 "简单" 条件，复杂条件仍在前端处理。 */
export interface StreamFilter {
  /** 逗号分隔，如 "GET,POST" */
  method?: string;
  /** 域名 glob，如 "*.example.com" */
  host?: string;
  /** 状态码或范围，如 "2xx" / "404" / "500-599" */
  status?: string;
  /** URL glob，如 "*api*" */
  urlPattern?: string;
}

const SSE_PATH = '/api/captures/stream';

function buildStreamUrl(baseAbs: string, filter?: StreamFilter): string {
  const params = new URLSearchParams();
  if (filter?.method) params.set('method', filter.method);
  if (filter?.host) params.set('host', filter.host);
  if (filter?.status) params.set('status', filter.status);
  if (filter?.urlPattern) params.set('urlPattern', filter.urlPattern);
  const qs = params.toString();
  return qs ? `${baseAbs}?${qs}` : baseAbs;
}

/**
 * 订阅抓包 SSE 流。组件 unmount 时自动断开。
 *
 * handlers 与 filter 对象身份变更会重连——调用方应该用 useMemo 或稳定引用避免抖动。
 */
export function useCaptureStream<TItem = unknown>(
  handlers: CaptureStreamHandlers<TItem>,
  filter?: StreamFilter,
): void {
  const client = usePiperApi();

  useEffect(() => {
    const baseAbs = resolveAbsoluteUrl(client, SSE_PATH);

    let es: EventSource | null = null;
    let retryDelay = 1000;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      es = new EventSource(buildStreamUrl(baseAbs, filter));

      es.addEventListener('capture.start', (e: MessageEvent<string>) => {
        try {
          handlers.onStart?.(JSON.parse(e.data) as TItem);
        } catch {
          // ignore parse errors
        }
      });

      es.addEventListener('capture.complete', (e: MessageEvent<string>) => {
        try {
          handlers.onComplete?.(JSON.parse(e.data) as TItem);
        } catch {
          // ignore parse errors
        }
      });

      es.addEventListener('capture.error', (e: MessageEvent<string>) => {
        try {
          handlers.onError?.(JSON.parse(e.data) as { id?: string; message?: string });
        } catch {
          // ignore parse errors
        }
      });

      es.addEventListener('system.status', (e: MessageEvent<string>) => {
        try {
          handlers.onStatus?.(JSON.parse(e.data) as Record<string, unknown>);
        } catch {
          // ignore parse errors
        }
      });

      es.onopen = () => {
        retryDelay = 1000; // 连接成功后重置退避
      };

      es.onerror = () => {
        es?.close();
        es = null;
        if (!closed) {
          timer = setTimeout(() => {
            retryDelay = Math.min(retryDelay * 2, 30_000);
            connect();
          }, retryDelay);
        }
      };
    };

    connect();

    return () => {
      closed = true;
      if (timer !== null) clearTimeout(timer);
      es?.close();
      es = null;
    };
    // 依赖 client 是为了 baseUrl 切换时重连；handlers 故意不在依赖里——
    // 调用方传新对象会引发不必要的 SSE 重连，所以约定调用方用稳定引用。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, filter?.method, filter?.host, filter?.status, filter?.urlPattern]);
}
