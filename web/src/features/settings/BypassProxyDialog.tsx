import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR, { mutate } from 'swr';
import { Trash2, Plus, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useUIStore } from '@/store/ui';
import {
  fetchBypass,
  fetchPinnedHosts,
  addBypassRule,
  removeBypassRule,
  setBypassRuleEnabled,
  enableBypassPreset,
  disableBypassPreset,
  BYPASS_URL,
  BYPASS_PINNED_URL,
  PRESET_LABELS,
  type BypassRule,
} from '@/api/bypass';

export function BypassProxyDialog() {
  const { t } = useTranslation();
  const open = useUIStore((s) => s.bypassOpen);
  const setOpen = useUIStore((s) => s.setBypassOpen);

  const { data, isLoading } = useSWR(BYPASS_URL, fetchBypass);
  const { data: pinnedData } = useSWR(BYPASS_PINNED_URL, fetchPinnedHosts, {
    refreshInterval: 5000,
  });

  const [newPattern, setNewPattern] = useState('');
  const [newTag, setNewTag] = useState('');
  const [adding, setAdding] = useState(false);

  const rules: BypassRule[] = data?.rules ?? [];
  const presetsEnabled: string[] = data?.presets_enabled ?? [];
  const pinnedHosts = pinnedData?.hosts ?? [];

  async function handleAdd() {
    if (!newPattern.trim()) return;
    setAdding(true);
    try {
      await addBypassRule({ pattern: newPattern.trim(), tag: newTag.trim() || 'custom' });
      setNewPattern('');
      setNewTag('');
      await mutate(BYPASS_URL);
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(pattern: string) {
    await removeBypassRule(pattern);
    await mutate(BYPASS_URL);
  }

  async function handleToggle(pattern: string, enabled: boolean) {
    await setBypassRuleEnabled(pattern, enabled);
    await mutate(BYPASS_URL);
  }

  async function handlePreset(name: string, enable: boolean) {
    if (enable) {
      await enableBypassPreset(name);
    } else {
      await disableBypassPreset(name);
    }
    await mutate(BYPASS_URL);
  }

  async function handleAddPinned(host: string) {
    await addBypassRule({ pattern: host, tag: 'SSL Pinning' });
    await mutate(BYPASS_URL);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('bypass.dialogTitle')}</DialogTitle>
        </DialogHeader>

        {/* SSL Pinning 检测到的主机 banner */}
        {pinnedHosts.length > 0 && (
          <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-950">
            <div className="flex items-center gap-2 mb-2 text-sm font-medium text-yellow-800 dark:text-yellow-200">
              <AlertCircle size={16} />
              {t('bypass.pinnedDetected', { count: pinnedHosts.length })}
            </div>
            <div className="flex flex-col gap-1">
              {pinnedHosts.map((h) => (
                <div key={h.host} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-yellow-900 dark:text-yellow-100">{h.host}</span>
                  <Button
                    size="sm"
                    variant="default"
                    className="h-6 text-xs"
                    onClick={() => handleAddPinned(h.host)}
                  >
                    {t('bypass.addToBypass')}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 新增规则 */}
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            placeholder={t('bypass.patternPlaceholder')}
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <input
            className="w-28 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            placeholder={t('bypass.tagPlaceholder')}
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <Button size="sm" onClick={handleAdd} disabled={adding || !newPattern.trim()}>
            <Plus size={14} className="mr-1" />
            {t('common.create')}
          </Button>
        </div>

        {/* 规则列表 */}
        <div className="rounded-md border divide-y divide-neutral-100 dark:divide-neutral-800">
          {isLoading && (
            <div className="px-3 py-4 text-sm text-neutral-400 text-center">{t('common.loading')}</div>
          )}
          {!isLoading && rules.length === 0 && (
            <div className="px-3 py-4 text-sm text-neutral-400 text-center">{t('common.empty')}</div>
          )}
          {rules.map((rule) => (
            <div key={rule.pattern} className="flex items-center gap-3 px-3 py-2 text-sm">
              <Switch
                checked={rule.enabled}
                onCheckedChange={(checked) => handleToggle(rule.pattern, checked)}
                className="shrink-0"
              />
              <span className="flex-1 font-mono truncate">{rule.pattern}</span>
              {rule.tag && (
                <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800">
                  {rule.tag}
                </span>
              )}
              <button
                className="shrink-0 text-neutral-400 hover:text-red-500 transition-colors"
                onClick={() => handleRemove(rule.pattern)}
                title={t('common.delete')}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        {/* 预设包 */}
        <div>
          <p className="text-sm font-medium mb-2">{t('bypass.presetsTitle')}</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(PRESET_LABELS).map(([name, label]) => {
              const active = presetsEnabled.includes(name);
              return (
                <button
                  key={name}
                  onClick={() => handlePreset(name, !active)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    active
                      ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                      : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400'
                  }`}
                >
                  {active ? '✓ ' : ''}{label}
                </button>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
