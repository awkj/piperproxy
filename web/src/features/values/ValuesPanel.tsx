import useSWR from 'swr';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Braces,
  Download,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Share2,
  Trash,
  Trash2,
  Upload,
} from 'lucide-react';
import { CodeView } from '@/components/CodeView';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import {
  addValue,
  exportAllValuesUrl,
  fetchRecycleList,
  fetchValues,
  RECYCLE_URL,
  removeRecycleItem,
  removeValue,
  renameValue,
  restoreValueFromRecycle,
  VALUES_URL,
  type RecycleItem,
  type ValueItem,
} from '@/api/values';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { runMutation } from '@/lib/mutate';
import { toast } from 'sonner';
import { useEditorPrefs } from '@/features/settings/editor-prefs';
import { useShortcuts } from '@/lib/use-shortcuts';
import { ImportValuesDialog } from './ImportValuesDialog';
import { JsonDialog } from '@/components/dialogs';

/**
 * Build a share URL for the given value name + content.
 * Encoding: base64(JSON.stringify({ name, value })), placed in the
 * `valueData` query-param. Mirrors the rules share convention.
 */
function buildValueShareUrl(name: string, value: string): string {
  const payload = btoa(unescape(encodeURIComponent(JSON.stringify({ name, value }))));
  const base = window.location.origin + window.location.pathname;
  return `${base}?valueData=${encodeURIComponent(payload)}`;
}

export function ValuesPanel() {
  const { t } = useTranslation();
  const { prefs: editorPrefs } = useEditorPrefs('values');
  const { data, isLoading, mutate } = useSWR(VALUES_URL, fetchValues, {
    refreshInterval: 0,
  });
  const list: ValueItem[] = Array.isArray(data) ? data : [];
  const [activeName, setActiveName] = useState<string | null>(null);
  const active = list.find((v) => v.name === activeName) ?? list[0];

  const [showCreate, setShowCreate] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ValueItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ValueItem | null>(null);
  const [showRecycle, setShowRecycle] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);

  // 编辑器脏状态：选中条目变化时复位 draft；用户输入时进入 dirty
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) {
      setDraft(active?.value ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.name, active?.value]);

  const onSave = async () => {
    if (!active) return;
    // 复用 add 接口：writeFile 同名 file 时直接覆盖 data
    const ok = await runMutation(
      () => addValue(active.name, draft),
      t,
      'common.saveSuccess',
    );
    if (ok) {
      setDirty(false);
      await mutate();
    }
  };

  // 接通 Cmd+S 保存当前 value
  useShortcuts({
    saveValuesChanges: () => {
      if (active && dirty) void onSave();
    },
  });

  const onShare = async () => {
    if (!active) {
      return;
    }
    const url = buildValueShareUrl(active.name, active.value ?? '');
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('values.shareSuccess'));
    } catch {
      toast.error(url);
    }
  };

  const onExport = () => {
    // 通过 <a download> 触发浏览器下载，让 cgi-bin/values/export 直接吐文件
    const a = document.createElement('a');
    a.href =
      '/' +
      exportAllValuesUrl(`values_${formatDateForFilename()}.json`);
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-neutral-200 bg-white px-3 py-1.5">
        <span className="mr-2 text-sm font-medium text-neutral-700">
          {t('nav.values')}
        </span>
        <Button
          variant="default"
          size="sm"
          onClick={() => setShowImport(true)}
          aria-label={t('values.importTitle')}
        >
          <Upload className="h-3.5 w-3.5" />
          {t('values.import')}
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={onExport}
          aria-label={t('values.exportTitle')}
          disabled={list.length === 0}
        >
          <Download className="h-3.5 w-3.5" />
          {t('values.export')}
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={() => setShowRecycle(true)}
          aria-label={t('values.recycle')}
          className="ml-auto"
        >
          <Trash className="h-3.5 w-3.5" />
          {t('values.recycle')}
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <aside className="flex w-60 flex-col border-r border-neutral-200 bg-neutral-50">
          <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
            <span>{t('nav.values')}</span>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              aria-label={t('values.addItem')}
              className="rounded p-1 text-neutral-600 hover:bg-neutral-200"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <div className="px-3 py-2 text-xs text-neutral-400">
                {t('common.loading')}
              </div>
            ) : list.length === 0 ? (
              <div className="px-3 py-2 text-xs text-neutral-400">
                {t('values.noValues')}
              </div>
            ) : (
              list.map((item) => {
                const selected = item.name === active?.name;
                return (
                  <div
                    key={item.name}
                    className={cn(
                      'group flex items-center justify-between px-3 py-1.5 text-sm',
                      selected
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-neutral-700 hover:bg-neutral-100',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          dirty &&
                          item.name !== active?.name &&
                          !window.confirm(t('values.discardDraftConfirm'))
                        ) {
                          return;
                        }
                        setActiveName(item.name);
                        setDirty(false);
                      }}
                      className="flex-1 truncate text-left"
                    >
                      {item.name}
                    </button>
                    <div className="ml-2 flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <button
                        type="button"
                        onClick={() => setRenameTarget(item)}
                        aria-label={t('common.rename')}
                        className="rounded p-1 text-neutral-500 hover:bg-neutral-200"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(item)}
                        aria-label={t('common.delete')}
                        className="rounded p-1 text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>
        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2">
            <span className="truncate text-sm font-medium text-neutral-700">
              {active?.name ?? '—'}
            </span>
            {dirty && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">
                {t('values.dirty')}
              </span>
            )}
            <Button
              variant="default"
              size="sm"
              onClick={() => void onShare()}
              disabled={!active}
              title={t('values.shareTitle')}
              aria-label={t('values.shareTitle')}
              className={
                active?.name?.toLowerCase().endsWith('.json') ? '' : 'ml-auto'
              }
            >
              <Share2 className="h-3.5 w-3.5" />
              {t('values.share')}
            </Button>
            {active?.name?.toLowerCase().endsWith('.json') && (
              <Button
                variant="default"
                size="sm"
                onClick={() => setJsonOpen(true)}
                aria-label={t('values.openInJsonDialog')}
              >
                <Braces className="h-3.5 w-3.5" />
                {t('values.openInJsonDialog')}
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={onSave}
              disabled={!active || !dirty}
              className={
                active?.name?.toLowerCase().endsWith('.json') ? '' : ''
              }
            >
              <Save className="h-3.5 w-3.5" />
              {t('common.save')}
            </Button>
          </div>
          <div className="flex-1 overflow-hidden">
            {active ? (
              <CodeView
                value={draft}
                language="text"
                readOnly={false}
                height="100%"
                theme={editorPrefs.theme}
                fontSize={editorPrefs.fontSize}
                lineNumbers={editorPrefs.lineNumbers}
                lineWrapping={editorPrefs.lineWrapping}
                foldGutter={editorPrefs.foldGutter}
                onChange={(v) => {
                  setDraft(v);
                  setDirty(v !== (active.value ?? ''));
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-neutral-400">
                {t('values.noValues')}
              </div>
            )}
          </div>
        </main>
      </div>

      {showCreate && (
        <CreateValueDialog
          onClose={() => setShowCreate(false)}
          onCreated={async (name) => {
            setShowCreate(false);
            await mutate();
            setActiveName(name);
            setDirty(false);
          }}
        />
      )}

      {renameTarget && (
        <RenameValueDialog
          item={renameTarget}
          onClose={() => setRenameTarget(null)}
          onRenamed={async (newName) => {
            setRenameTarget(null);
            await mutate();
            setActiveName(newName);
            setDirty(false);
          }}
        />
      )}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('common.confirmDelete', { name: pendingDelete?.name ?? '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('common.confirmDeleteDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!pendingDelete) return;
                const target = pendingDelete;
                setPendingDelete(null);
                const ok = await runMutation(
                  () => removeValue(target.name),
                  t,
                  'common.deleteSuccess',
                );
                if (ok) {
                  if (active?.name === target.name) {
                    setActiveName(null);
                    setDirty(false);
                  }
                  await mutate();
                }
              }}
              className="bg-red-600 text-white hover:bg-red-500"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {showRecycle && (
        <RecycleDialog
          onClose={() => setShowRecycle(false)}
          onChanged={async () => {
            await mutate();
          }}
        />
      )}

      {showImport && (
        <ImportValuesDialog
          onClose={() => setShowImport(false)}
          onImported={async () => {
            await mutate();
            setDirty(false);
          }}
        />
      )}

      <JsonDialog
        open={jsonOpen}
        onClose={() => setJsonOpen(false)}
        value={draft}
        title={active?.name}
        onConfirm={(_parsed, raw) => {
          setDraft(raw);
          setDirty(raw !== (active?.value ?? ''));
        }}
      />
    </div>
  );
}

function formatDateForFilename(): string {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function CreateValueDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (name: string) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('values.newDialogTitle')}</DialogTitle>
        </DialogHeader>
        <form
          className="mt-4 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim() || submitting) return;
            setSubmitting(true);
            const ok = await runMutation(
              () => addValue(name.trim(), value),
              t,
              'common.saveSuccess',
            );
            setSubmitting(false);
            if (ok) await onCreated(name.trim());
          }}
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-800">
              {t('values.name')}
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('values.namePlaceholder')}
              className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-800">
              {t('values.value')}
            </label>
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t('values.valuePlaceholder')}
              rows={6}
              className="w-full rounded-md border border-neutral-300 px-3 py-1.5 font-mono text-xs focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="default" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!name.trim() || submitting}
            >
              {t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenameValueDialog({
  item,
  onClose,
  onRenamed,
}: {
  item: ValueItem;
  onClose: () => void;
  onRenamed: (newName: string) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [newName, setNewName] = useState(item.name);
  const [submitting, setSubmitting] = useState(false);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('values.renameDialogTitle')}</DialogTitle>
          <DialogDescription>{item.name}</DialogDescription>
        </DialogHeader>
        <form
          className="mt-4 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const trimmed = newName.trim();
            if (!trimmed || trimmed === item.name || submitting) return;
            setSubmitting(true);
            const ok = await runMutation(
              () => renameValue(item.name, trimmed),
              t,
              'common.saveSuccess',
            );
            setSubmitting(false);
            if (ok) await onRenamed(trimmed);
          }}
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-800">
              {t('values.newName')}
            </label>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="default" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={
                !newName.trim() || newName.trim() === item.name || submitting
              }
            >
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RecycleDialog({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const { data, isLoading, mutate } = useSWR(RECYCLE_URL, fetchRecycleList, {
    refreshInterval: 0,
  });
  const items: RecycleItem[] = data?.list ?? [];

  const handleRestore = async (filename: string) => {
    // 1. fetch raw data via view
    const res = await restoreValueFromRecycle(filename);
    if (res.ec !== 0 || res.data === undefined) {
      // runMutation would have toasted on throw, but view's failure we surface manually
      return;
    }
    // 2. add back to values; backend supports `recycleFilename` to auto-clean
    const ok = await runMutation(
      async () => {
        const name = filename.replace(/\.[^.]+$/, '');
        return await addValue(name, res.data ?? '');
      },
      t,
      'values.restoreSuccess',
    );
    if (ok) {
      // also remove from recycle bin manually (add doesn't auto-clean unless given recycleFilename)
      await removeRecycleItem(filename).catch(() => undefined);
      await mutate();
      await onChanged();
    }
  };

  const handlePurge = async (filename: string) => {
    const ok = await runMutation(
      () => removeRecycleItem(filename),
      t,
      'common.deleteSuccess',
    );
    if (ok) await mutate();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('values.recycle')}</DialogTitle>
        </DialogHeader>
        <div className="mt-4 max-h-80 overflow-auto rounded-md border border-neutral-200">
          {isLoading ? (
            <div className="px-3 py-4 text-sm text-neutral-500">
              {t('common.loading')}
            </div>
          ) : items.length === 0 ? (
            <div className="px-3 py-4 text-sm text-neutral-500">
              {t('values.recycleEmpty')}
            </div>
          ) : (
            <ul className="divide-y divide-neutral-200">
              {items.map((it) => (
                <li
                  key={it.filename}
                  className="flex items-center justify-between px-3 py-2 text-sm"
                >
                  <span className="truncate text-neutral-800">
                    {it.filename}
                  </span>
                  <div className="ml-2 flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleRestore(it.filename)}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-brand-700 hover:bg-brand-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {t('values.restore')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePurge(it.filename)}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {t('values.deleteForever')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button variant="default" onClick={onClose}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
