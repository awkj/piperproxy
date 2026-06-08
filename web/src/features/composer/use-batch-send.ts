import { useCallback, useRef, useState } from 'react';
import { sendComposer, type ComposerRequest } from '@/api/composer';

export interface BatchOptions {
  /** 总循环次数 */
  count: number;
  /** 并发数 */
  concurrency: number;
  /** 相邻任务间隔（ms） */
  intervalMs: number;
}

export interface BatchSummary {
  total: number;
  done: number;
  failed: number;
  /** 仅对成功响应统计平均耗时 */
  avgDurationMs: number;
  successRate: number;
}

interface BatchProgress {
  running: boolean;
  done: number;
  failed: number;
  total: number;
  cancelled: boolean;
  finished: boolean;
  summary: BatchSummary | null;
}

const initialProgress: BatchProgress = {
  running: false,
  done: 0,
  failed: 0,
  total: 0,
  cancelled: false,
  finished: false,
  summary: null,
};

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (ms <= 0) return resolve();
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort);
  });

/**
 * 批量发送 hook。
 *
 * 取消机制：
 * - `start()` 创建一个 AbortController；
 * - `cancel()` 调用 controller.abort()，正在 sleep 的间隔会立刻 reject；
 * - 已发出的网络请求由 SDK 透传 signal 中止（ky 通过 fetch 支持 signal）；
 * - 工作 worker 在每次循环开头检查 signal.aborted，及时退出，剩余请求不再发出。
 */
export function useBatchSend() {
  const [progress, setProgress] = useState<BatchProgress>(initialProgress);
  const controllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const start = useCallback(
    async (request: ComposerRequest, opts: BatchOptions) => {
      const total = Math.max(1, Math.floor(opts.count));
      const concurrency = Math.max(1, Math.floor(opts.concurrency));
      const intervalMs = Math.max(0, Math.floor(opts.intervalMs));

      const controller = new AbortController();
      controllerRef.current = controller;
      const { signal } = controller;

      setProgress({
        running: true,
        done: 0,
        failed: 0,
        total,
        cancelled: false,
        finished: false,
        summary: null,
      });

      let nextIndex = 0;
      let done = 0;
      let failed = 0;
      const durations: number[] = [];

      const worker = async () => {
        while (!signal.aborted) {
          const i = nextIndex++;
          if (i >= total) return;
          if (intervalMs > 0 && i > 0) {
            try {
              await sleep(intervalMs, signal);
            } catch {
              return;
            }
          }
          const startedAt = performance.now();
          try {
            const res = await sendComposer(request, { signal });
            const dur = performance.now() - startedAt;
            if (res.ec === 0) durations.push(dur);
            else failed++;
          } catch (err) {
            // AbortError 不算失败，外层会汇总取消状态
            if (signal.aborted) return;
            failed++;
            void err;
          }
          done++;
          setProgress((p) => ({ ...p, done, failed }));
        }
      };

      const workers = Array.from({ length: Math.min(concurrency, total) }, () =>
        worker()
      );
      await Promise.all(workers);

      const successCount = durations.length;
      const summary: BatchSummary = {
        total,
        done,
        failed,
        avgDurationMs:
          successCount > 0
            ? durations.reduce((a, b) => a + b, 0) / successCount
            : 0,
        successRate: total > 0 ? successCount / total : 0,
      };

      setProgress((p) => ({
        ...p,
        running: false,
        finished: true,
        cancelled: signal.aborted,
        summary,
      }));
      controllerRef.current = null;
    },
    []
  );

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setProgress(initialProgress);
  }, []);

  return { progress, start, cancel, reset };
}
