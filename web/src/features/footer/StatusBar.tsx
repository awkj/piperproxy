import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Circle, Globe, Pin, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useUIStore } from '@/store/ui';
import { useNetworkStore } from '@/store/network';
import { useWorkingSessionStore } from '@/store/workingSession';
import { INIT_URL, type InitInfo } from './api';

function formatRate(bytesPerSec: number): string {
  // 紧凑格式（不带空格、不带 /s 后缀），用于状态栏角落显示。
  if (bytesPerSec < 1024) return `${bytesPerSec | 0}B`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)}K`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)}M`;
}

/**
 * 从 useNetworkStore.captureItems 累计 req/res 字节数，每秒采样一次，
 * 给底部状态栏提供实时 ↑/↓ 速率指标。无后端依赖，纯前端推导。
 */
function useTrafficRate() {
  const [up, setUp] = useState(0);
  const [down, setDown] = useState(0);
  const lastReq = useRef(0);
  const lastRes = useRef(0);

  useEffect(() => {
    const tick = () => {
      const items = useNetworkStore.getState().captureItems;
      let req = 0;
      let res = 0;
      for (const it of items) {
        req += it.req?.size ?? 0;
        res += it.res?.size ?? 0;
      }
      // 首次采样作为基线，避免把历史累计当成"刚发生的"流量。
      if (lastReq.current === 0 && lastRes.current === 0 && (req > 0 || res > 0)) {
        lastReq.current = req;
        lastRes.current = res;
        return;
      }
      setUp(Math.max(0, req - lastReq.current));
      setDown(Math.max(0, res - lastRes.current));
      lastReq.current = req;
      lastRes.current = res;
    };
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return { up, down };
}

export function StatusBar() {
  const { t } = useTranslation();
  const openDnsServersDialog = useUIStore((s) => s.openDnsServersDialog);
  const { up, down } = useTrafficRate();
  const filterEnabled = useWorkingSessionStore((s) => s.filterEnabled);
  const pinned = useWorkingSessionStore((s) => s.pinned);
  const clearPinned = useWorkingSessionStore((s) => s.clearPinned);

  const { data, error, isLoading } = useSWR<InitInfo>(INIT_URL, {
    refreshInterval: 30000,
    revalidateOnFocus: false,
  });

  const online = !error && !isLoading && !!data;
  const server = data?.server;
  const dnsLabel = server?.dns;

  const handleDnsClick = () => {
    if (!dnsLabel) return;
    openDnsServersDialog({
      dns: dnsLabel,
      doh: server?.doh,
      df: server?.df,
      r6: server?.r6,
    });
  };

  return (
    <footer
      className={cn(
        'flex items-center gap-3 border-t px-3 py-1 text-[11px] font-mono',
        online
          ? 'border-neutral-200 bg-neutral-50 text-neutral-600'
          : 'border-red-300 bg-red-50 text-red-700'
      )}
    >
      <span className="flex items-center gap-1.5">
        <Circle
          className={cn(
            'h-2 w-2',
            online ? 'fill-emerald-500 text-emerald-500' : 'fill-red-500 text-red-500'
          )}
        />
        {online ? t('footer.online') : t('footer.offline')}
      </span>

      {server?.bip && (
        <span className="flex items-center gap-1">
          <span className="text-neutral-400">{t('footer.listen')}</span>
          <span>{server.bip}</span>
        </span>
      )}

      {data?.clientIp && (
        <span className="flex items-center gap-1">
          <span className="text-neutral-400">{t('footer.clientIp')}</span>
          <span>{data.clientIp}</span>
        </span>
      )}

      {filterEnabled && pinned.length > 0 && (
        <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] text-blue-700">
          <Pin className="h-2.5 w-2.5 shrink-0" />
          <span className="max-w-[180px] truncate">
            {pinned.map((p) => p.value).join(', ')}
          </span>
          <button
            type="button"
            onClick={clearPinned}
            className="ml-0.5 rounded-full p-0.5 hover:bg-blue-200"
            title={t('network.sidebar.clearPinned')}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      )}

      {dnsLabel && (
        <button
          type="button"
          onClick={handleDnsClick}
          className="flex items-center gap-1 rounded px-1 text-neutral-600 hover:bg-neutral-200/60 hover:text-brand-600"
          title={t('footer.dnsDetail')}
        >
          <Globe className="h-3 w-3" />
          <span className="text-neutral-400">{t('footer.dns')}</span>
          <span className="max-w-[200px] truncate">{dnsLabel}</span>
        </button>
      )}

      <span className="ml-auto flex items-center gap-2">
        {/* 网速放最右、字体最小、淡灰 — 不抢占注意力 */}
        <span
          className="flex items-center gap-0.5 text-[10px] text-neutral-400 tabular-nums"
          title={`↑ ${formatRate(up)}/s · ↓ ${formatRate(down)}/s`}
        >
          <ArrowUp className="h-2.5 w-2.5" />
          {formatRate(up)}
          <ArrowDown className="ml-1 h-2.5 w-2.5" />
          {formatRate(down)}
        </span>
        {(data?.version || server?.version) && (
          <span className="text-[10px] text-neutral-400">
            v{data?.version ?? server?.version}
          </span>
        )}
      </span>
    </footer>
  );
}
