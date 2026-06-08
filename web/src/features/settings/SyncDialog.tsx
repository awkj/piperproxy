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

/**
 * 复刻自老前端 `sync-dialog.js`：从插件提供的 cgi URL 同步 rules / values
 * 到本地。完整流程依赖 KVDialog（待移植），所以这个 Dialog 当前只占位
 * 触发入口，按钮点击后 toast 一条 TODO 提示，等 plugins / KVDialog 移植
 * 完成后再补全。
 *
 * 触发方式：把插件信息写到 `useUIStore` 后端字段（暂时复用 `setSyncDialogOpen`），
 * 真接入时建议在 store 上加 `syncDialogPayload`。
 */
export function SyncDialog() {
  const { t } = useTranslation();
  const open = useUIStore((s) => s.syncDialogOpen);
  const setOpen = useUIStore((s) => s.setSyncDialogOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('settings.sync.title')}</DialogTitle>
        </DialogHeader>

        <p className="mt-2 text-sm text-neutral-600">
          {t('settings.sync.desc')}
        </p>

        <div className="mt-4 flex gap-2">
          <Button variant="primary" disabled>
            {t('settings.sync.syncRules')}
          </Button>
          <Button variant="default" disabled>
            {t('settings.sync.syncValues')}
          </Button>
        </div>

        <p className="mt-4 text-xs text-neutral-500">
          {/* 暂未接入插件 sync URL 列表 */}
          {t('settings.sync.noUrl')}
        </p>

        <DialogFooter>
          <Button variant="default" onClick={() => setOpen(false)}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
