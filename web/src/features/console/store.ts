import { useMemo } from 'react';
import { create } from 'zustand';
import type { ConsoleEntry, ConsoleLevel } from './types';

/** 缓冲区上限，防止内存撑爆 */
export const MAX_CONSOLE_ENTRIES = 5000;

interface ConsoleState {
  entries: ConsoleEntry[];
  /** 服务端返回的最新游标，用作下次 startLogTime */
  lastLogId: number;

  /** 是否暂停轮询（仍保留已有日志） */
  paused: boolean;
  togglePaused: () => void;

  /** 文本过滤 */
  filterText: string;
  setFilterText: (v: string) => void;

  /** level 过滤；'all' 表示不过滤 */
  levelFilter: ConsoleLevel | 'all';
  setLevelFilter: (v: ConsoleLevel | 'all') => void;

  /** 业务 logId 过滤；null 表示不过滤 */
  logIdFilter: string | null;
  setLogIdFilter: (v: string | null) => void;

  /** 展开行 ids */
  expandedIds: Set<number>;
  toggleExpanded: (id: number) => void;
  collapseAll: () => void;

  /** 追加 + 清理 */
  appendEntries: (next: ConsoleEntry[], newCursor: number) => void;
  /** 导入（追加到末尾，不更新 lastLogId） */
  importEntries: (next: ConsoleEntry[]) => void;
  clear: () => void;
}

export const useConsoleStore = create<ConsoleState>((set) => ({
  entries: [],
  lastLogId: 0,

  paused: false,
  togglePaused: () => set((s) => ({ paused: !s.paused })),

  filterText: '',
  setFilterText: (filterText) => set({ filterText }),

  levelFilter: 'all',
  setLevelFilter: (levelFilter) => set({ levelFilter }),

  logIdFilter: null,
  setLogIdFilter: (logIdFilter) => set({ logIdFilter }),

  expandedIds: new Set<number>(),
  toggleExpanded: (id) =>
    set((s) => {
      const next = new Set(s.expandedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { expandedIds: next };
    }),
  collapseAll: () => set({ expandedIds: new Set<number>() }),

  appendEntries: (next, newCursor) =>
    set((s) => {
      if (next.length === 0) {
        return { lastLogId: newCursor || s.lastLogId };
      }
      const merged = s.entries.concat(next);
      const trimmed =
        merged.length > MAX_CONSOLE_ENTRIES
          ? merged.slice(merged.length - MAX_CONSOLE_ENTRIES)
          : merged;
      return {
        entries: trimmed,
        lastLogId: newCursor || s.lastLogId,
      };
    }),

  importEntries: (next) =>
    set((s) => {
      if (next.length === 0) return s;
      const merged = s.entries.concat(next);
      const trimmed =
        merged.length > MAX_CONSOLE_ENTRIES
          ? merged.slice(merged.length - MAX_CONSOLE_ENTRIES)
          : merged;
      return { entries: trimmed };
    }),

  clear: () => set({ entries: [], expandedIds: new Set<number>() }),
}));

/**
 * 当前 buffer 中出现过的 logId 集合（去重 + 按字典序排序）。
 * 空字符串 logId（无业务）也视作一个独立项。
 */
export function useDistinctLogIds(): string[] {
  const entries = useConsoleStore((s) => s.entries);
  return useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) {
      set.add(e.logId ?? '');
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [entries]);
}

/**
 * 综合 levelFilter + filterText + logIdFilter 的过滤结果。
 */
export function useFilteredEntries(): ConsoleEntry[] {
  const entries = useConsoleStore((s) => s.entries);
  const filterText = useConsoleStore((s) => s.filterText);
  const levelFilter = useConsoleStore((s) => s.levelFilter);
  const logIdFilter = useConsoleStore((s) => s.logIdFilter);

  return useMemo(() => {
    const txt = filterText.trim().toLowerCase();
    return entries.filter((e) => {
      if (levelFilter !== 'all' && e.level !== levelFilter) return false;
      if (logIdFilter !== null && (e.logId ?? '') !== logIdFilter) return false;
      if (
        txt &&
        !e.displayText.toLowerCase().includes(txt) &&
        !(e.logId ?? '').toLowerCase().includes(txt)
      ) {
        return false;
      }
      return true;
    });
  }, [entries, filterText, levelFilter, logIdFilter]);
}
