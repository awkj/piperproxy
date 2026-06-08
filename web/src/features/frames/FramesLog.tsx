import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useFramesStore } from '@/store/frames';
import type { FrameLogEntry } from './types';

const ROW_HEIGHT = 28;

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  const ms = d.getMilliseconds().toString().padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function FramesLog() {
  const { t } = useTranslation();
  const log = useFramesStore((s) => s.log);
  const selectedId = useFramesStore((s) => s.selectedId);
  const setSelectedId = useFramesStore((s) => s.setSelectedId);
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: log.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  return (
    <div className="flex h-full flex-col text-xs">
      <div className="sticky top-0 z-10 flex border-b border-neutral-200 bg-neutral-50 font-medium text-neutral-600">
        <div style={{ width: 40, flexShrink: 0 }} className="px-2 py-1.5 text-center">
          {/* direction icon column */}
        </div>
        <div style={{ width: 130, flexShrink: 0 }} className="truncate px-2 py-1.5">
          {t('frames.columns.time')}
        </div>
        <div style={{ width: 70, flexShrink: 0 }} className="truncate px-2 py-1.5">
          {t('frames.columns.kind')}
        </div>
        <div style={{ width: 80, flexShrink: 0 }} className="truncate px-2 py-1.5 text-right">
          {t('frames.columns.size')}
        </div>
        <div style={{ flex: 1, minWidth: 0 }} className="truncate px-2 py-1.5">
          {t('frames.columns.preview')}
        </div>
      </div>

      <div ref={parentRef} className="flex-1 overflow-auto">
        {log.length === 0 ? (
          <div className="flex h-full items-center justify-center text-neutral-400">
            {t('frames.noFrames')}
          </div>
        ) : (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((vRow) => {
              const item: FrameLogEntry = log[vRow.index]!;
              const selected = item.id === selectedId;
              const isIn = item.direction === 'in';
              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedId(selected ? null : item.id)}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: vRow.size,
                    transform: `translateY(${vRow.start}px)`,
                  }}
                  className={cn(
                    'flex cursor-pointer items-center border-b border-neutral-100 hover:bg-neutral-50',
                    selected && 'bg-brand-50 hover:bg-brand-50',
                  )}
                  title={t(`frames.direction.${item.direction}`)}
                >
                  <div
                    style={{ width: 40, flexShrink: 0 }}
                    className={cn(
                      'flex items-center justify-center px-2',
                      isIn ? 'text-emerald-600' : 'text-blue-600',
                    )}
                  >
                    {isIn ? (
                      <ArrowDown className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowUp className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <div
                    style={{ width: 130, flexShrink: 0 }}
                    className="truncate px-2 font-mono text-neutral-500"
                  >
                    {formatTimestamp(item.timestamp)}
                  </div>
                  <div
                    style={{ width: 70, flexShrink: 0 }}
                    className="truncate px-2 text-neutral-600"
                  >
                    {item.kind}
                  </div>
                  <div
                    style={{ width: 80, flexShrink: 0 }}
                    className="truncate px-2 text-right font-mono text-neutral-500"
                  >
                    {formatSize(item.size)}
                  </div>
                  <div
                    style={{ flex: 1, minWidth: 0 }}
                    className="truncate px-2 font-mono text-neutral-700"
                  >
                    {item.preview}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
