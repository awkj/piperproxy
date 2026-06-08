import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import { ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/store/ui';
import { useNetworkStore } from '@/store/network';
import { swrFetcher } from '@/api/client';
import { useNetworkPrefs, MAX_ROWS_OPTIONS } from './network-prefs';

/**
 * 在新窗口打开一份独立的 whistle 抓包面板。
 * - 直接复用当前 URL，新窗口里 React 自启动一份完整 UI；
 *   localStorage 共享，但 SWR / zustand 内存态独立，所以两边过滤、列宽
 *   互不干扰。
 * - 如果浏览器拦截了 popup（返回 null），回退到当前 tab 打开。
 */
function openAllInNewWindow() {
  if (typeof window === 'undefined') return;
  const features = 'width=1400,height=900,resizable=yes,scrollbars=yes';
  const w = window.open(window.location.href, '_blank', features);
  if (!w) {
    // popup 被拦截：直接 location.href 打不开新窗口、又会丢失当前状态。
    // 老栈也只是静默失败；这里保持一致，由用户在浏览器 UI 允许 popup
  }
}

interface ServerInfo {
  /** 后端 init/get-data 返回的 client IP（仅用于展示文案，与抓包过滤无关） */
  ip?: string;
}

/**
 * 复刻自老前端 `network-settings.js`：抓包面板的 include / exclude 过滤、
 * 最大行数、显示模式开关。所有字段都是前端态：
 * - `includeFilter` 文本沿用既有 `useNetworkStore.filter`（避免动 store）
 * - 启用开关 / exclude filter / maxRows / view 选项 → `useNetworkPrefs`
 *   (localStorage)
 *
 * 老前端原本还有 `Network Columns` 的 reorder + 自定义 `Custom1/Custom2`
 * 列功能；列管理已经在并行 agent 的右键菜单 + `network-columns-menu` 里
 * 落地，所以这里不重复实现，只保留过滤 / 行数 / 视图 一个对话框。
 */
export function NetworkSettingsDialog() {
  const { t } = useTranslation();
  const open = useUIStore((s) => s.networkSettingsOpen);
  const setOpen = useUIStore((s) => s.setNetworkSettingsOpen);

  const filter = useNetworkStore((s) => s.filter);
  const setFilter = useNetworkStore((s) => s.setFilter);
  const { prefs, setPref } = useNetworkPrefs();

  // 仅在打开时拉一次 server-info，仅为了显示客户端 IP
  const { data } = useSWR<ServerInfo & { ec?: number }>(
    open ? 'api/init' : null,
    (url: string) => swrFetcher<ServerInfo & { ec?: number }>(url),
    { revalidateOnFocus: false },
  );
  const clientIp = (data as { clientIp?: string } | undefined)?.clientIp ?? '';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('settings.network.title')}</DialogTitle>
        </DialogHeader>

        <div className="mt-4 space-y-4 text-sm">
          {/* Exclude filter */}
          <fieldset className="rounded-md border border-neutral-200 p-3">
            <legend className="px-1 text-xs font-medium">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={prefs.excludeFilterEnabled}
                  onChange={(e) =>
                    setPref({ excludeFilterEnabled: e.target.checked })
                  }
                />
                {t('settings.network.excludeFilter')}
              </label>
            </legend>
            <textarea
              disabled={!prefs.excludeFilterEnabled}
              value={prefs.excludeFilter}
              onChange={(e) => setPref({ excludeFilter: e.target.value })}
              placeholder={t('settings.network.filterPlaceholder')}
              className="h-20 w-full resize-none rounded-md border border-neutral-300 px-2 py-1 text-xs disabled:bg-neutral-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </fieldset>

          {/* Include filter */}
          <fieldset className="rounded-md border border-neutral-200 p-3">
            <legend className="px-1 text-xs font-medium">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={prefs.includeFilterEnabled}
                  onChange={(e) =>
                    setPref({ includeFilterEnabled: e.target.checked })
                  }
                />
                {t('settings.network.includeFilter')}
              </label>
            </legend>
            <textarea
              disabled={!prefs.includeFilterEnabled}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('settings.network.filterPlaceholder')}
              className="h-20 w-full resize-none rounded-md border border-neutral-300 px-2 py-1 text-xs disabled:bg-neutral-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </fieldset>

          {/* maxRows + 视图开关 */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <label className="text-neutral-700">
                {t('settings.network.maxRowsLabel')}:
              </label>
              <select
                value={prefs.maxRows}
                onChange={(e) =>
                  setPref({ maxRows: Number(e.target.value) || 1500 })
                }
                className="rounded-md border border-neutral-300 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              >
                {MAX_ROWS_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={prefs.viewOnlyOwn}
                onChange={(e) => setPref({ viewOnlyOwn: e.target.checked })}
              />
              <span>
                {t('settings.network.viewOwn', { ip: clientIp || '—' })}
              </span>
            </label>

            {/* viewAllInWindow：按钮一次性弹独立窗口，比纯开关更直观。
                pref 字段保留以兼容历史 localStorage，按钮按下也置 true 仅作
                统计，关闭新窗口或下次打开 dialog 都不重弹。 */}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => {
                  setPref({ viewAllInWindow: true });
                  openAllInNewWindow();
                }}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t('settings.network.viewAllInWindow')}
              </Button>
            </div>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={prefs.treeView}
                onChange={(e) => setPref({ treeView: e.target.checked })}
              />
              <span>{t('settings.network.treeView')}</span>
            </label>

            {prefs.treeView ? (
              <label className="ml-6 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={prefs.highlightNew}
                  onChange={(e) => setPref({ highlightNew: e.target.checked })}
                />
                <span>{t('settings.network.highlightNew')}</span>
              </label>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="default" onClick={() => setOpen(false)}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
