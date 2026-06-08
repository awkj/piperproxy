import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/store/ui';

/**
 * 复刻自老前端 `dns-servers-dialog.js`：仅展示，外部触发时传入
 * `{ dns, doh, r6, df }`（与老接口 `serverInfo.dns/doh/r6/df` 一一对应）。
 * - `doh = true`：直接展示 `dns` 字段（DOH URL）
 * - 否则按逗号拆 DNS 列表，逐行渲染为 `DNS ServerN: <ip>`
 */
function formatServers(dns: string, doh: boolean | undefined): string {
  if (!dns) return '';
  if (doh) return dns;
  return dns
    .split(',')
    .map((d, i) => `DNS Server${i + 1}:  ${d.trim()}`)
    .join('\n');
}

export function DnsServersDialog() {
  const { t } = useTranslation();
  const open = useUIStore((s) => s.dnsServersDialogOpen);
  const setOpen = useUIStore((s) => s.setDnsServersDialogOpen);
  const payload = useUIStore((s) => s.dnsServersDialogPayload);

  const servers = payload ? formatServers(payload.dns, payload.doh) : '';

  let title = t('settings.dns.title');
  if (payload) {
    if (payload.doh) {
      title = t('settings.dns.titleDoh');
    } else {
      const base = payload.r6
        ? t('settings.dns.titleIpv6')
        : t('settings.dns.titleIpv4');
      title = base + (payload.df ? t('settings.dns.first') : '');
    }
  }

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(servers);
      toast.success(t('common.copied'));
    } catch {
      toast.error(t('errors.fetchFailed'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-800">
          {servers}
        </pre>
        <DialogFooter>
          <Button variant="default" onClick={() => setOpen(false)}>
            {t('common.close')}
          </Button>
          {servers ? (
            <Button variant="primary" onClick={onCopy}>
              {t('settings.dns.copy')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
