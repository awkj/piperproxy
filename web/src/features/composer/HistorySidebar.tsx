import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Star, Trash2, Pencil, History as HistoryIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  useComposerHistoryStore,
  type ComposerHistoryEntry,
  type ComposerFavoriteEntry,
} from '@/store/composer-history';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Tab = 'history' | 'favorites';

export interface RestoreSnapshot {
  method: string;
  url: string;
  headers: string;
  body: string;
}

const statusClass = (status?: number, ec?: number) => {
  if (ec != null && ec !== 0) return 'text-red-600';
  if (status == null) return 'text-neutral-400';
  if (status >= 500) return 'text-red-600';
  if (status >= 400) return 'text-amber-600';
  if (status >= 300) return 'text-blue-600';
  return 'text-emerald-600';
};

const formatTime = (ts: number) => {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

interface HistoryItemRowProps {
  entry: ComposerHistoryEntry;
  onRestore: (snapshot: RestoreSnapshot) => void;
  onFavorite: (id: string) => void;
  onDelete: (id: string) => void;
}

function HistoryItemRow({ entry, onRestore, onFavorite, onDelete }: HistoryItemRowProps) {
  const { t } = useTranslation();
  return (
    <li
      className="group flex cursor-pointer items-start gap-2 border-b border-neutral-100 px-3 py-2 hover:bg-neutral-50"
      onClick={() =>
        onRestore({
          method: entry.method,
          url: entry.url,
          headers: entry.headers,
          body: entry.body,
        })
      }
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="font-mono font-semibold text-neutral-700">
            {entry.method}
          </span>
          <span className={cn('font-mono', statusClass(entry.status, entry.ec))}>
            {entry.ec != null && entry.ec !== 0
              ? 'ERR'
              : entry.status != null
                ? entry.status
                : '—'}
          </span>
          <span className="ml-auto text-[11px] text-neutral-400">
            {formatTime(entry.createdAt)}
          </span>
        </div>
        <div className="truncate text-xs text-neutral-700" title={entry.url}>
          {entry.url}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          className="rounded p-1 text-neutral-500 hover:bg-amber-100 hover:text-amber-600"
          title={t('composer.starThis')}
          onClick={(e) => {
            e.stopPropagation();
            onFavorite(entry.id);
          }}
        >
          <Star className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="rounded p-1 text-neutral-500 hover:bg-red-100 hover:text-red-600"
          title={t('common.delete')}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(entry.id);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

interface FavoriteItemRowProps {
  entry: ComposerFavoriteEntry;
  onRestore: (snapshot: RestoreSnapshot) => void;
  onRename: (id: string, currentName: string) => void;
  onDelete: (id: string) => void;
}

function FavoriteItemRow({ entry, onRestore, onRename, onDelete }: FavoriteItemRowProps) {
  const { t } = useTranslation();
  return (
    <li
      className="group flex cursor-pointer items-start gap-2 border-b border-neutral-100 px-3 py-2 hover:bg-neutral-50"
      onClick={() =>
        onRestore({
          method: entry.method,
          url: entry.url,
          headers: entry.headers,
          body: entry.body,
        })
      }
    >
      <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium text-neutral-800" title={entry.name}>
          {entry.name}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
          <span className="font-mono font-semibold">{entry.method}</span>
          <span className="truncate" title={entry.url}>
            {entry.url}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
          title={t('common.rename')}
          onClick={(e) => {
            e.stopPropagation();
            onRename(entry.id, entry.name);
          }}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="rounded p-1 text-neutral-500 hover:bg-red-100 hover:text-red-600"
          title={t('common.delete')}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(entry.id);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

export interface HistorySidebarProps {
  onRestore: (snapshot: RestoreSnapshot) => void;
}

export function HistorySidebar({ onRestore }: HistorySidebarProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('history');
  const history = useComposerHistoryStore((s) => s.history);
  const favorites = useComposerHistoryStore((s) => s.favorites);
  const removeHistory = useComposerHistoryStore((s) => s.removeHistory);
  const clearHistory = useComposerHistoryStore((s) => s.clearHistory);
  const favoriteFromHistory = useComposerHistoryStore((s) => s.favoriteFromHistory);
  const removeFavorite = useComposerHistoryStore((s) => s.removeFavorite);
  const renameFavorite = useComposerHistoryStore((s) => s.renameFavorite);

  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [renameInput, setRenameInput] = useState('');

  const items = tab === 'history' ? history : favorites;

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="flex shrink-0 border-b border-neutral-200">
        <button
          type="button"
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium',
            tab === 'history'
              ? 'border-b-2 border-brand-600 text-brand-700'
              : 'text-neutral-500 hover:text-neutral-700'
          )}
          onClick={() => setTab('history')}
        >
          <HistoryIcon className="h-3.5 w-3.5" />
          {t('composer.history')} ({history.length})
        </button>
        <button
          type="button"
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium',
            tab === 'favorites'
              ? 'border-b-2 border-brand-600 text-brand-700'
              : 'text-neutral-500 hover:text-neutral-700'
          )}
          onClick={() => setTab('favorites')}
        >
          <Star className="h-3.5 w-3.5" />
          {t('composer.favorites')} ({favorites.length})
        </button>
      </div>

      {tab === 'history' && history.length > 0 && (
        <div className="flex shrink-0 justify-end border-b border-neutral-100 px-3 py-1.5">
          <button
            type="button"
            className="text-[11px] text-neutral-500 hover:text-red-600"
            onClick={() => clearHistory()}
          >
            {t('composer.clearHistory')}
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-neutral-400">
            {tab === 'history' ? t('composer.noHistory') : t('composer.noFavorites')}
          </div>
        ) : (
          <ul>
            {tab === 'history'
              ? history.map((entry) => (
                  <HistoryItemRow
                    key={entry.id}
                    entry={entry}
                    onRestore={onRestore}
                    onFavorite={(id) => favoriteFromHistory(id)}
                    onDelete={removeHistory}
                  />
                ))
              : favorites.map((entry) => (
                  <FavoriteItemRow
                    key={entry.id}
                    entry={entry}
                    onRestore={onRestore}
                    onRename={(id, name) => {
                      setRenaming({ id, name });
                      setRenameInput(name);
                    }}
                    onDelete={removeFavorite}
                  />
                ))}
          </ul>
        )}
      </div>

      {renaming && (
        <Dialog open onOpenChange={(open) => !open && setRenaming(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('composer.renameFavorite')}</DialogTitle>
              <DialogDescription>{renaming.name}</DialogDescription>
            </DialogHeader>
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = renameInput.trim();
                if (!trimmed) return;
                renameFavorite(renaming.id, trimmed);
                setRenaming(null);
              }}
            >
              <input
                autoFocus
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
              <DialogFooter>
                <Button type="button" variant="default" onClick={() => setRenaming(null)}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" variant="primary" disabled={!renameInput.trim()}>
                  {t('common.save')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </aside>
  );
}
