import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import { Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  REGISTRY_LIST_URL,
  addRegistry,
  fetchRegistryList,
} from '@/api/plugins';
import { runMutation } from '@/lib/mutate';

const REGISTRY_RE = /^https?:\/\/[^/?]/;

export function RegistryDialog({
  current,
  onClose,
  onPick,
}: {
  current: string;
  onClose: () => void;
  /** Called with '' for the default registry, or a custom URL. */
  onPick: (registry: string) => void;
}) {
  const { t } = useTranslation();
  const { data, mutate } = useSWR(REGISTRY_LIST_URL, fetchRegistryList, {
    refreshInterval: 0,
  });
  const list = data?.list ?? [];

  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const trimmed = draft.trim();
  const draftValid = REGISTRY_RE.test(trimmed) && trimmed.length <= 1024;

  const handleAdd = async () => {
    if (!draftValid || submitting) return;
    setSubmitting(true);
    const ok = await runMutation(
      () => addRegistry(trimmed),
      t,
      'plugins.registryAdded',
    );
    setSubmitting(false);
    if (ok) {
      setDraft('');
      await mutate();
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('plugins.registryDialogTitle')}</DialogTitle>
        </DialogHeader>
        <p className="mt-1 text-xs text-neutral-500">
          {t('plugins.registryDesc')}
        </p>

        <ul className="mt-4 max-h-72 space-y-1 overflow-auto">
          <RegistryRow
            value=""
            label={t('plugins.registryDefault')}
            checked={current === ''}
            onSelect={() => {
              onPick('');
              onClose();
            }}
          />
          {list.length === 0 ? (
            <li className="px-2 py-3 text-center text-xs text-neutral-400">
              {t('plugins.noRegistries')}
            </li>
          ) : (
            list.map((url) => (
              <RegistryRow
                key={url}
                value={url}
                label={url}
                checked={current === url}
                onSelect={() => {
                  onPick(url);
                  onClose();
                }}
              />
            ))
          )}
        </ul>

        <div className="mt-4 border-t border-neutral-200 pt-3">
          <label className="mb-1 block text-sm font-medium text-neutral-800">
            {t('plugins.addRegistry')}
          </label>
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t('plugins.addRegistryPlaceholder')}
              className="h-9 flex-1 rounded-md border border-neutral-300 px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleAdd}
              disabled={!draftValid || submitting}
            >
              <Plus className="h-3.5 w-3.5" />
              {t('plugins.addRegistry')}
            </Button>
          </div>
          {draft && !draftValid && (
            <p className="mt-1 text-xs text-red-600">
              {t('plugins.registryInvalid')}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="default" onClick={onClose}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RegistryRow({
  value,
  label,
  checked,
  onSelect,
}: {
  value: string;
  label: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={
          'flex w-full items-center justify-between gap-3 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-neutral-100 ' +
          (checked ? 'bg-brand-50 text-brand-700' : 'text-neutral-800')
        }
      >
        <span className="truncate font-mono text-xs">{value || label}</span>
        {checked && <span className="text-xs text-brand-600">✓</span>}
      </button>
    </li>
  );
}
