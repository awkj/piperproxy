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
 * 复刻自老前端 `tips-dialog.js`：被外部触发后展示一段 `tips` 文本，可复制 `dir`。
 * 通过 `store/ui.ts` 的 `tipsDialogPayload` 接收数据，调用方使用
 * `useUIStore.getState().openTipsDialog({ title, tips, dir })` 即可。
 */
export function TipsDialog() {
  const { t } = useTranslation();
  const open = useUIStore((s) => s.tipsDialogOpen);
  const setOpen = useUIStore((s) => s.setTipsDialogOpen);
  const payload = useUIStore((s) => s.tipsDialogPayload);

  const tips = payload?.tips ?? '';
  const title = payload?.title ?? '';
  const dir = payload?.dir ?? '';

  const onCopy = async () => {
    if (!dir) return;
    try {
      await navigator.clipboard.writeText(dir);
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
        <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-800">
          {tips}
        </pre>
        <DialogFooter>
          <Button variant="default" onClick={() => setOpen(false)}>
            {t('common.close')}
          </Button>
          {dir ? (
            <Button variant="primary" onClick={onCopy}>
              {t('settings.tips.copyDir')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
