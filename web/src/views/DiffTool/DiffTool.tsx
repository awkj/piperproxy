import { useState } from 'react';
import { X, GitCompare, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useDiffPoolStore } from '@/store/diffPool';
import type { NetworkItem } from '@/api/network';
import { cn } from '@/lib/cn';
import { HeadersDiff } from './HeadersDiff';
import { BodyDiff } from './BodyDiff';

type Section = 'url' | 'headers' | 'reqBody' | 'respHeaders' | 'respBody';

const SECTIONS: { id: Section; labelKey: string }[] = [
  { id: 'url', labelKey: 'diff.tab.url' },
  { id: 'headers', labelKey: 'diff.tab.headers' },
  { id: 'reqBody', labelKey: 'diff.tab.reqBody' },
  { id: 'respHeaders', labelKey: 'diff.tab.respHeaders' },
  { id: 'respBody', labelKey: 'diff.tab.respBody' },
];

function ItemLabel({ item }: { item: NetworkItem }) {
  return (
    <span className="truncate text-xs font-mono">
      <span className="font-semibold text-sky-600 dark:text-sky-400">{item.method}</span>
      {' '}
      <span className="text-neutral-500">{item.res?.statusCode ?? '—'}</span>
      {' '}
      <span>{item.path ?? item.url}</span>
    </span>
  );
}

function SideSelect({
  label,
  pool,
  selectedId,
  onChange,
}: {
  label: string;
  pool: NetworkItem[];
  selectedId: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-1 min-w-0">
      <span className="text-xs text-neutral-500 shrink-0">{label}</span>
      <div className="relative flex-1 min-w-0">
        <select
          className="w-full appearance-none rounded border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1 pr-6 text-xs font-mono text-neutral-800 dark:text-neutral-200 focus:outline-none"
          value={selectedId ?? ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— select —</option>
          {pool.map((item) => (
            <option key={item.id} value={item.id}>
              {item.method} {item.res?.statusCode ?? '?'} {item.path ?? item.url}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 size-3 text-neutral-400" />
      </div>
    </div>
  );
}

function buildUnifiedDiff(left: NetworkItem, right: NetworkItem): string {
  const sections: string[] = [];

  const addSection = (title: string, leftText: string, rightText: string) => {
    const leftLines = leftText.split('\n');
    const rightLines = rightText.split('\n');
    sections.push(`--- a/${title}`);
    sections.push(`+++ b/${title}`);
    for (const line of leftLines) sections.push(`-${line}`);
    for (const line of rightLines) sections.push(`+${line}`);
    sections.push('');
  };

  addSection('url', left.url, right.url);
  addSection('req-body', left.req?.body ?? '', right.req?.body ?? '');
  addSection('resp-body', left.res?.body ?? '', right.res?.body ?? '');
  return sections.join('\n');
}

function downloadDiff(content: string) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'piper-diff.diff';
  a.click();
  URL.revokeObjectURL(url);
}

export function DiffTool() {
  const { t } = useTranslation();
  const { pool, leftId, rightId, open, setLeft, setRight, removeFromPool, clearPool, setOpen } =
    useDiffPoolStore(
      useShallow((s) => ({
        pool: s.pool,
        leftId: s.leftId,
        rightId: s.rightId,
        open: s.open,
        setLeft: s.setLeft,
        setRight: s.setRight,
        removeFromPool: s.removeFromPool,
        clearPool: s.clearPool,
        setOpen: s.setOpen,
      })),
    );

  const [section, setSection] = useState<Section>('url');
  const [mode, setMode] = useState<'side-by-side' | 'unified'>('side-by-side');

  if (!open) return null;

  const leftItem = pool.find((p) => p.id === leftId);
  const rightItem = pool.find((p) => p.id === rightId);

  const renderSection = () => {
    if (!leftItem || !rightItem) {
      return (
        <div className="flex items-center justify-center h-full text-sm text-neutral-400">
          {t('diff.selectBoth')}
        </div>
      );
    }

    switch (section) {
      case 'url':
        return (
          <div className="flex h-full flex-col gap-2 p-3 font-mono text-xs">
            <div className="rounded bg-red-50 dark:bg-red-900/20 p-2 text-red-700 dark:text-red-300 break-all">
              <span className="font-semibold">− </span>{leftItem.url}
            </div>
            <div className="rounded bg-emerald-50 dark:bg-emerald-900/20 p-2 text-emerald-700 dark:text-emerald-300 break-all">
              <span className="font-semibold">+ </span>{rightItem.url}
            </div>
          </div>
        );
      case 'headers':
        return (
          <div className="overflow-auto h-full p-2">
            <HeadersDiff left={leftItem.req?.headers} right={rightItem.req?.headers} />
          </div>
        );
      case 'reqBody':
        return (
          <BodyDiff
            leftBody={leftItem.req?.body}
            rightBody={rightItem.req?.body}
            leftContentType={leftItem.req?.headers?.['content-type']}
            rightContentType={rightItem.req?.headers?.['content-type']}
            mode={mode}
          />
        );
      case 'respHeaders':
        return (
          <div className="overflow-auto h-full p-2">
            <HeadersDiff left={leftItem.res?.headers} right={rightItem.res?.headers} />
          </div>
        );
      case 'respBody':
        return (
          <BodyDiff
            leftBody={leftItem.res?.body}
            rightBody={rightItem.res?.body}
            leftContentType={leftItem.res?.headers?.['content-type']}
            rightContentType={rightItem.res?.headers?.['content-type']}
            mode={mode}
          />
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="flex flex-col bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-2xl w-full max-w-6xl h-[90vh]">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 shrink-0">
          <GitCompare className="size-4 text-neutral-500" />
          <span className="font-semibold text-sm text-neutral-800 dark:text-neutral-100">
            {t('diff.title')}
          </span>
          <div className="flex-1" />
          <button
            onClick={() => setOpen(false)}
            className="rounded p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Pool */}
        <div className="px-4 py-2 border-b border-neutral-200 dark:border-neutral-700 shrink-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">{t('diff.pool')}</span>
            {pool.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-1 rounded bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-xs"
              >
                <ItemLabel item={item} />
                <button
                  onClick={() => removeFromPool(item.id)}
                  className="ml-1 text-neutral-400 hover:text-red-500"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
            {pool.length > 0 && (
              <button
                onClick={clearPool}
                className="text-xs text-neutral-400 hover:text-red-500 ml-1"
              >
                {t('diff.clearPool')}
              </button>
            )}
          </div>

          {/* Side selectors */}
          <div className="flex items-center gap-4">
            <SideSelect
              label={t('diff.left')}
              pool={pool}
              selectedId={leftId}
              onChange={setLeft}
            />
            <SideSelect
              label={t('diff.right')}
              pool={pool}
              selectedId={rightId}
              onChange={setRight}
            />
          </div>
        </div>

        {/* Tabs + mode */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-neutral-200 dark:border-neutral-700 shrink-0">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={cn(
                'rounded px-3 py-1 text-xs font-medium transition-colors',
                section === s.id
                  ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300'
                  : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              )}
            >
              {t(s.labelKey)}
            </button>
          ))}
          <div className="flex-1" />
          <div className="flex items-center gap-1 text-xs">
            {(['side-by-side', 'unified'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  'rounded px-2 py-1 transition-colors',
                  mode === m
                    ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200'
                    : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
                )}
              >
                {t(`diff.mode.${m}`)}
              </button>
            ))}
          </div>
          {leftItem && rightItem && (
            <button
              onClick={() => downloadDiff(buildUnifiedDiff(leftItem, rightItem))}
              className="ml-2 rounded px-2 py-1 text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 border border-neutral-200 dark:border-neutral-600"
            >
              {t('diff.export')}
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {renderSection()}
        </div>
      </div>
    </div>
  );
}
