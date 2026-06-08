import { useEffect, useRef } from 'react';
import useSWR from 'swr';
import { CONSOLE_LOG_URL, consoleLogFetcher, type ConsoleLogResp } from '@/api/console';
import { useConsoleStore } from './store';
import { parseLogItem } from './parse';

const POLL_INTERVAL = 1000;
const PAGE_SIZE = 200;

function buildKey(startLogTime: number, paused: boolean): string | null {
  if (paused) return null;
  const params = new URLSearchParams();
  params.set('startLogTime', String(startLogTime));
  params.set('logId', '');
  params.set('count', String(PAGE_SIZE));
  return `${CONSOLE_LOG_URL}?${params.toString()}`;
}

/**
 * 简单的 SWR 轮询：以 lastLogId 为游标增量拉取，间隔 1s。
 * 暂停时停止 polling，但已有日志保留。
 */
export function useConsolePolling(): { error: unknown; isLoading: boolean } {
  const lastLogId = useConsoleStore((s) => s.lastLogId);
  const paused = useConsoleStore((s) => s.paused);
  const appendEntries = useConsoleStore((s) => s.appendEntries);

  // 用 ref 存最新 cursor，避免 SWR 回调里读到过期的闭包值
  const cursorRef = useRef(lastLogId);
  cursorRef.current = lastLogId;

  const key = buildKey(lastLogId, paused);

  const { data, error, isLoading } = useSWR<ConsoleLogResp>(key, consoleLogFetcher, {
    refreshInterval: POLL_INTERVAL,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 0,
    keepPreviousData: false,
  });

  useEffect(() => {
    if (!data || !data.log) return;
    const newCursor = data.lastLogId ?? data.curLogId ?? cursorRef.current;
    if (data.log.length === 0) {
      // 仍然推进 cursor 防止偶尔停滞
      if (newCursor && newCursor !== cursorRef.current) {
        appendEntries([], newCursor);
      }
      return;
    }
    const entries = data.log.map(parseLogItem);
    appendEntries(entries, newCursor);
  }, [data, appendEntries]);

  return { error, isLoading };
}
