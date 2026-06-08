import { useState } from 'react';
import useSWR from 'swr';
import { useTranslation } from 'react-i18next';
import { Check, Copy, ExternalLink, Monitor, Smartphone } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/store/ui';
import { NETWORK_INTERFACES_URL, fetchNetworkInterfaces } from '@/api/network';

function useCopied(timeout = 1500) {
  const [copied, setCopied] = useState(false);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), timeout);
    } catch {
      // ignore
    }
  };
  return { copied, copy };
}

interface CopyRowProps {
  label: string;
  value: string;
  hint?: string;
}

function CopyRow({ label, value, hint }: CopyRowProps) {
  const { t } = useTranslation();
  const { copied, copy } = useCopied();
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-xs text-neutral-500">{label}</span>
      <code className="flex-1 rounded bg-neutral-100 px-2 py-1 font-mono text-xs text-neutral-800">
        {value}
      </code>
      {hint ? <span className="shrink-0 text-[10px] text-neutral-400">{hint}</span> : null}
      <button
        type="button"
        onClick={() => copy(value)}
        title={t('common.copy')}
        className="shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

export function ServiceDialog() {
  const { t } = useTranslation();
  const open = useUIStore((s) => s.serviceOpen);
  const setOpen = useUIStore((s) => s.setServiceOpen);

  // 拉后端真实监听端口 + 全部本机 IP；不要用 window.location.port，
  // 因为 make dev 下那是 Vite (5173)，不是 piper 后端 (8899)。
  const { data } = useSWR(open ? NETWORK_INTERFACES_URL : null, fetchNetworkInterfaces);

  const port = data?.proxyPort ?? 8899;
  const interfaces = data?.interfaces ?? [{ name: 'loopback', ip: '127.0.0.1', kind: 'loopback' }];
  const primaryAddr = `${interfaces[0]?.ip ?? '127.0.0.1'}:${port}`;
  const startCommand = `piper -addr :${port}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('service.title')}</DialogTitle>
          <DialogDescription>{t('service.desc')}</DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-5">
          {/* 当前代理信息 */}
          <section>
            <h3 className="mb-2 text-sm font-medium text-neutral-700">
              {t('service.proxyInfo')}
            </h3>
            <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
              <CopyRow label={t('service.proxyPort')} value={String(port)} />
              {interfaces.map((it) => (
                <CopyRow
                  key={`${it.name}-${it.ip}`}
                  label={it.kind === 'loopback' ? t('service.hostLoopback') : t('service.hostLan')}
                  value={`${it.ip}:${port}`}
                  hint={it.name}
                />
              ))}
            </div>
          </section>

          {/* 系统代理设置提示 */}
          <section>
            <h3 className="mb-2 text-sm font-medium text-neutral-700">
              {t('service.systemProxy')}
            </h3>
            <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-600">
              <div className="flex items-start gap-2">
                <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
                <div>
                  <p className="font-medium text-neutral-700">{t('service.desktop')}</p>
                  <p className="text-xs text-neutral-500">{t('service.desktopDesc', { addr: primaryAddr })}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
                <div>
                  <p className="font-medium text-neutral-700">{t('service.mobile')}</p>
                  <p className="text-xs text-neutral-500">{t('service.mobileDesc', { port })}</p>
                </div>
              </div>
            </div>
          </section>

          {/* CLI 命令 */}
          <section>
            <h3 className="mb-2 text-sm font-medium text-neutral-700">
              {t('service.cli')}
            </h3>
            <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
              <CopyRow label={t('service.cliStart')} value={startCommand} />
            </div>
            <p className="mt-1.5 text-xs text-neutral-400">
              {t('service.cliHint')}
            </p>
          </section>
        </div>

        <DialogFooter className="mt-4">
          <Button
            variant="default"
            size="sm"
            onClick={() =>
              window.open('https://github.com/awkj/piper', '_blank', 'noreferrer')
            }
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t('service.installDocs')}
          </Button>
          <Button variant="primary" size="sm" onClick={() => setOpen(false)}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
