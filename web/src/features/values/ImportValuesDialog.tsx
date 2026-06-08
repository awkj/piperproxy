import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { importValues } from '@/api/values';
import { runMutation } from '@/lib/mutate';

interface ImportValuesDialogProps {
  onClose: () => void;
  onImported: () => void | Promise<void>;
}

/**
 * 导入 values。支持：
 * - 上传 .json / .txt 文件（内容为 `{ name: value, ... }` 形式的 JSON）
 * - 直接粘贴 JSON 文本
 * 老栈 import-dialog 还支持远程 URL 导入；新栈先省略，需要时再加。
 */
export function ImportValuesDialog({
  onClose,
  onImported,
}: ImportValuesDialogProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [replace, setReplace] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseAndValidate = (raw: string): Record<string, string> | null => {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
    if (
      !json ||
      typeof json !== 'object' ||
      Array.isArray(json)
    ) {
      setError(t('values.importInvalidShape'));
      return null;
    }
    // 把 value 全部规整为 string；对象/数组类型的会被后端 stringify
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
      // 跳过 export 文件里附带的 ordering list（key 为 ''）
      if (k === '') continue;
      if (v == null) continue;
      result[k] =
        typeof v === 'string' ? v : JSON.stringify(v, null, '  ');
    }
    if (Object.keys(result).length === 0) {
      setError(t('values.importEmpty'));
      return null;
    }
    return result;
  };

  const onFile = (file: File) => {
    if (!/\.(txt|json)$/i.test(file.name)) {
      setError(t('values.importBadType'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      setText(result);
      setError(null);
    };
    reader.onerror = () => setError(t('errors.fetchFailed'));
    reader.readAsText(file);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !text.trim()) return;
    setError(null);
    const data = parseAndValidate(text);
    if (!data) return;
    setSubmitting(true);
    const ok = await runMutation(
      () => importValues(data, replace),
      t,
      'values.importSuccess',
    );
    setSubmitting(false);
    if (ok) {
      await onImported();
      onClose();
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('values.importTitle')}</DialogTitle>
          <DialogDescription>{t('values.importDesc')}</DialogDescription>
        </DialogHeader>
        <form className="mt-3 space-y-3" onSubmit={onSubmit}>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="default"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              {t('values.importPickFile')}
            </Button>
            <label className="ml-2 inline-flex items-center gap-1 text-xs text-neutral-700">
              <input
                type="checkbox"
                checked={replace}
                onChange={(e) => setReplace(e.target.checked)}
              />
              {t('values.importReplace')}
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = '';
              }}
            />
          </div>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            placeholder={t('values.importPlaceholder')}
            rows={10}
            className="w-full rounded-md border border-neutral-300 px-3 py-1.5 font-mono text-xs focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="default" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!text.trim() || submitting}
            >
              {t('values.importDo')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
