import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/store/ui';
import {
  SHORTCUTS,
  readShortcutsPrefs,
  writeShortcutsPrefs,
} from './shortcuts-config';

/**
 * 复刻自老前端 `shortcuts-settings.js`：列出所有快捷键，可选启用/禁用。
 * 实际按键监听仍由各 Panel 自行实现，本对话框只更新 localStorage，
 * 后续 Panel 接入时读取 `readShortcutsPrefs()[id] !== false` 即可。
 */
export function ShortcutsSettingsDialog() {
  const { t } = useTranslation();
  const open = useUIStore((s) => s.shortcutsSettingsOpen);
  const setOpen = useUIStore((s) => s.setShortcutsSettingsOpen);

  const [prefs, setPrefs] = useState<Record<string, boolean>>(() =>
    readShortcutsPrefs(),
  );

  // 打开时重新读，避免前后台不同步
  useEffect(() => {
    if (open) setPrefs(readShortcutsPrefs());
  }, [open]);

  const setEntry = (id: string, enabled: boolean) => {
    setPrefs((prev) => {
      const next = { ...prev, [id]: enabled };
      writeShortcutsPrefs(next);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('settings.shortcuts.title')}</DialogTitle>
        </DialogHeader>

        <p className="mt-1 text-xs text-neutral-500">
          {t('settings.shortcuts.desc')}
        </p>

        <div className="mt-3 max-h-[60vh] space-y-4 overflow-auto pr-2 text-sm">
          {SHORTCUTS.map((category) => (
            <section key={category.labelKey}>
              <h5 className="mb-1 font-semibold text-neutral-800">
                {t(category.labelKey)}
              </h5>
              <ul className="space-y-1">
                {category.list.map((entry) => (
                  <li key={entry.id}>
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={prefs[entry.id] !== false}
                        onChange={(e) => setEntry(entry.id, e.target.checked)}
                      />
                      <span>
                        <strong className="font-mono text-xs text-neutral-700">
                          {entry.keys}
                        </strong>
                        <span className="ml-2 text-neutral-600">
                          {entry.desc}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          ))}
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
