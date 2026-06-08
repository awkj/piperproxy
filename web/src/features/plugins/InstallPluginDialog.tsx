import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { installPlugins } from '@/api/plugins';

const SEP_RE = /[\s,;|]+/;

/**
 * Prefix any bare package names with `whistle.` to mirror the legacy UI's
 * `parsePluginName` helper (htdocs/src/js/plugins.js). Already-prefixed or
 * scoped names (`@scope/name`) are left alone.
 */
function normalizePackages(input: string): string[] {
  return input
    .split(SEP_RE)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => {
      if (name.startsWith('whistle.') || name.startsWith('@')) return name;
      // strip optional version range to detect prefix, then re-add it
      const at = name.lastIndexOf('@');
      const base = at > 0 ? name.slice(0, at) : name;
      const ver = at > 0 ? name.slice(at) : '';
      if (base.startsWith('whistle.')) return name;
      return `whistle.${base}${ver}`;
    });
}

export function InstallPluginDialog({
  registry,
  onClose,
  onInstalled,
}: {
  /** Empty string = default npm registry. */
  registry: string;
  onClose: () => void;
  onInstalled: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const pkgs = normalizePackages(input);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (pkgs.length === 0) {
      toast.error(t('plugins.installEmpty'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await installPlugins(pkgs.join(','), registry);
      if (res.ec === 0) {
        toast.success(t('plugins.installSuccess'));
        await onInstalled();
        onClose();
      } else {
        toast.error(res.em ?? t('errors.fetchFailed'));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !submitting) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('plugins.installDialogTitle')}</DialogTitle>
        </DialogHeader>
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <p className="text-xs text-neutral-500">{t('plugins.installDesc')}</p>
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('plugins.installPlaceholder')}
            disabled={submitting}
            className="w-full rounded-md border border-neutral-300 px-3 py-1.5 font-mono text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-neutral-50"
          />
          {pkgs.length > 0 && (
            <div className="rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs">
              <div className="mb-1 text-neutral-500">
                {t('plugins.installSubmit')} ({pkgs.length}):
              </div>
              <ul className="space-y-0.5 font-mono text-neutral-800">
                {pkgs.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="text-xs text-neutral-500">
            {t('plugins.registry')}:{' '}
            <span className="font-mono">
              {registry || t('plugins.registryDefault')}
            </span>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="default"
              onClick={onClose}
              disabled={submitting}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={submitting || pkgs.length === 0}
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {submitting ? t('plugins.installing') : t('plugins.installSubmit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
