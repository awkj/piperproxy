/**
 * PreviewApp — 独立预览窗口（window.open + ?piper-preview=1）。
 * 通过 BroadcastChannel('piper-preview') 接收主窗口选中的 CaptureItem，
 * 渲染 NetworkDetail；同时将用户在 Detail 的 Forward/Back 操作广播回主窗口。
 */
import { useEffect, useState } from 'react';
import { SWRConfig } from 'swr';
import { useTranslation } from 'react-i18next';
import { Toaster } from 'sonner';
import { NetworkDetail } from '@/features/network/NetworkDetail';
import { swrFetcher } from '@/api/client';
import type { NetworkItem } from '@/api/network';

interface BcMessage {
  type: 'select';
  item: NetworkItem | null;
}

export function PreviewApp() {
  const { t } = useTranslation();
  const [item, setItem] = useState<NetworkItem | null>(null);

  useEffect(() => {
    const bc = new BroadcastChannel('piper-preview');
    bc.onmessage = (ev: MessageEvent<BcMessage>) => {
      if (ev.data?.type === 'select') {
        setItem(ev.data.item);
      }
    };
    // Announce that the preview window is ready so the main window can resend.
    bc.postMessage({ type: 'preview-ready' });
    return () => bc.close();
  }, []);

  return (
    <SWRConfig value={{ fetcher: swrFetcher, revalidateOnFocus: false }}>
      <div className="flex h-screen flex-col bg-white text-sm">
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-500">
          <span className="font-medium text-neutral-700">piper — {t('network.layout.detached')}</span>
          {item && (
            <span className="max-w-xs truncate text-neutral-400">{item.url}</span>
          )}
        </div>
        <div className="flex-1 overflow-hidden">
          <NetworkDetail item={item ?? undefined} />
        </div>
      </div>
      <Toaster richColors position="top-right" />
    </SWRConfig>
  );
}
