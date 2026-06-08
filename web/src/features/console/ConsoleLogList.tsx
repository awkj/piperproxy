import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useConsoleStore, useFilteredEntries } from './store';
import type { ConsoleLevel } from './types';

const ROW_HEIGHT = 24;
const EXPANDED_PAD = 8;

const LEVEL_TEXT_CLASS: Record<ConsoleLevel, string> = {
  debug: 'text-neutral-500',
  log: 'text-neutral-700',
  info: 'text-blue-600',
  warn: 'text-amber-600',
  error: 'text-red-600',
  fatal: 'text-red-700',
};

const LEVEL_BG_CLASS: Record<ConsoleLevel, string> = {
  debug: '',
  log: '',
  info: 'bg-blue-50/50 hover:bg-blue-50',
  warn: 'bg-amber-50/50 hover:bg-amber-50',
  error: 'bg-red-50/60 hover:bg-red-50',
  fatal: 'bg-red-100 hover:bg-red-100',
};

const LEVEL_BADGE_CLASS: Record<ConsoleLevel, string> = {
  debug: 'bg-neutral-200 text-neutral-700',
  log: 'bg-neutral-200 text-neutral-700',
  info: 'bg-blue-100 text-blue-700',
  warn: 'bg-amber-100 text-amber-700',
  error: 'bg-red-100 text-red-700',
  fatal: 'bg-red-200 text-red-800',
};

function pad(n: number, len = 2): string {
  return n.toString().padStart(len, '0');
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(
    d.getMilliseconds(),
    3,
  )}`;
}

export function ConsoleLogList() {
  const { t } = useTranslation();
  const totalEntries = useConsoleStore((s) => s.entries.length);
  const expandedIds = useConsoleStore((s) => s.expandedIds);
  const toggleExpanded = useConsoleStore((s) => s.toggleExpanded);
  const filtered = useFilteredEntries();

  const parentRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const item = filtered[index];
      if (!item) return ROW_HEIGHT;
      if (!expandedIds.has(item.id)) return ROW_HEIGHT;
      // 估算展开高度：按行数 * 行高 + padding
      const lines = item.displayText.split('\n').length;
      return Math.min(Math.max(lines, 2), 30) * 18 + EXPANDED_PAD * 2;
    },
    getItemKey: (index) => filtered[index]?.id ?? index,
    overscan: 12,
  });

  // 跟踪用户是否手动滚开了；如果在底部就自动跟新条目
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = distance < 24;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    if (filtered.length === 0) return;
    virtualizer.scrollToIndex(filtered.length - 1, { align: 'end' });
  }, [filtered.length, virtualizer]);

  return (
    <div ref={parentRef} className="flex-1 overflow-auto bg-white font-mono text-xs">
      {filtered.length === 0 ? (
        <div className="flex h-full items-center justify-center text-neutral-400">
          {totalEntries === 0 ? t('console.empty') : t('console.noMatch')}
        </div>
      ) : (
        <div
          style={{
            height: virtualizer.getTotalSize(),
            position: 'relative',
            width: '100%',
          }}
        >
          {virtualizer.getVirtualItems().map((vRow) => {
            const item = filtered[vRow.index];
            if (!item) return null;
            const expanded = expandedIds.has(item.id);
            return (
              <div
                key={vRow.key}
                data-index={vRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${vRow.start}px)`,
                }}
                className={cn(
                  'border-b border-neutral-100 hover:bg-neutral-50',
                  LEVEL_BG_CLASS[item.level],
                )}
              >
                <div
                  className="flex cursor-pointer items-start gap-2 px-3 py-1"
                  onClick={() => item.multiline && toggleExpanded(item.id)}
                  title={item.multiline ? t('console.toggleExpand') : undefined}
                >
                  <span className="mt-0.5 w-3 flex-shrink-0 text-neutral-400">
                    {item.multiline ? (
                      expanded ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )
                    ) : null}
                  </span>
                  <span className="w-24 flex-shrink-0 text-neutral-500">
                    {formatTime(item.date)}
                  </span>
                  <span
                    className={cn(
                      'inline-flex h-4 flex-shrink-0 items-center rounded px-1.5 text-[10px] font-semibold uppercase leading-none',
                      LEVEL_BADGE_CLASS[item.level],
                    )}
                  >
                    {item.level}
                  </span>
                  {item.logId && (
                    <span
                      className="max-w-[120px] flex-shrink-0 truncate text-neutral-500"
                      title={item.logId}
                    >
                      [{item.logId}]
                    </span>
                  )}
                  <span
                    className={cn(
                      'min-w-0 flex-1 break-all',
                      LEVEL_TEXT_CLASS[item.level],
                      !expanded && 'truncate whitespace-pre',
                    )}
                  >
                    {expanded ? (
                      <pre className="m-0 whitespace-pre-wrap break-all font-mono">
                        {item.displayText}
                      </pre>
                    ) : (
                      item.displayText.replace(/\n/g, ' ')
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
