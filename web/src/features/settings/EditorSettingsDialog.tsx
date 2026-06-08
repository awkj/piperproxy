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
  EDITOR_THEMES,
  FONT_SIZE_OPTIONS,
  useEditorPrefs,
} from './editor-prefs';

/**
 * 复刻自老前端 `editor-settings.js`（嵌在 rules/values settings dialog 内）。
 * 这里抽成独立 Dialog，target = 'rules' | 'values' 共享 UI，但分别存
 * localStorage 键。Whistle 后端不持久化这些偏好。
 */
export function EditorSettingsDialog() {
  const { t } = useTranslation();
  const open = useUIStore((s) => s.editorSettingsOpen);
  const setOpen = useUIStore((s) => s.setEditorSettingsOpen);
  const target = useUIStore((s) => s.editorSettingsTarget);

  const { prefs, setPref } = useEditorPrefs(target);

  const title =
    target === 'rules'
      ? t('settings.editor.titleRules')
      : t('settings.editor.titleValues');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="mt-3 space-y-3 text-sm">
          <div className="flex items-center gap-3">
            <label className="w-20 text-neutral-700">
              {t('settings.editor.theme')}
            </label>
            <select
              className="rounded-md border border-neutral-300 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              value={prefs.theme}
              onChange={(e) => setPref({ theme: e.target.value })}
            >
              {EDITOR_THEMES.map((theme) => (
                <option key={theme} value={theme}>
                  {theme}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <label className="w-20 text-neutral-700">
              {t('settings.editor.fontSize')}
            </label>
            <select
              className="rounded-md border border-neutral-300 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              value={prefs.fontSize}
              onChange={(e) => setPref({ fontSize: Number(e.target.value) })}
            >
              {FONT_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}px
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={prefs.lineNumbers}
              onChange={(e) => setPref({ lineNumbers: e.target.checked })}
            />
            <span>{t('settings.editor.lineNumbers')}</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={prefs.lineWrapping}
              onChange={(e) => setPref({ lineWrapping: e.target.checked })}
            />
            <span>{t('settings.editor.lineWrapping')}</span>
          </label>

          {target === 'values' ? (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={prefs.foldGutter}
                onChange={(e) => setPref({ foldGutter: e.target.checked })}
              />
              <span>{t('settings.editor.foldGutter')}</span>
            </label>
          ) : null}
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
