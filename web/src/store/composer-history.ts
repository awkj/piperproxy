import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * 历史 / 收藏 entry。响应字段是发送当时的快照，不参与表单恢复。
 *
 * - History 上限 100，按 createdAt 倒序保留新的，旧的自动汰换。
 * - Favorites 不计入 100 条上限，支持命名 / 重命名 / 删除。
 */
export interface ComposerHistoryEntry {
  id: string;
  createdAt: number;
  method: string;
  url: string;
  headers: string;
  body: string;
  /** 响应状态码（无响应或网络错误时 undefined）。 */
  status?: number;
  statusText?: string;
  /** 仅记录耗时（ms），不持久化响应体——避免 localStorage 撑爆。 */
  durationMs?: number;
  /** 业务错误码：0 = 成功，其他 = 失败。 */
  ec?: number;
}

export interface ComposerFavoriteEntry extends ComposerHistoryEntry {
  /** 用户命名；默认取 `${method} ${url}`。 */
  name: string;
}

interface ComposerHistoryState {
  history: ComposerHistoryEntry[];
  favorites: ComposerFavoriteEntry[];

  pushHistory: (entry: Omit<ComposerHistoryEntry, 'id' | 'createdAt'>) => ComposerHistoryEntry;
  removeHistory: (id: string) => void;
  clearHistory: () => void;

  addFavorite: (entry: Omit<ComposerFavoriteEntry, 'id' | 'createdAt'>) => ComposerFavoriteEntry;
  /** 把一条 history 转为收藏（不会从 history 中移除）。 */
  favoriteFromHistory: (historyId: string, name?: string) => ComposerFavoriteEntry | null;
  renameFavorite: (id: string, name: string) => void;
  removeFavorite: (id: string) => void;
}

const HISTORY_LIMIT = 100;

const genId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const useComposerHistoryStore = create<ComposerHistoryState>()(
  persist(
    (set, get) => ({
      history: [],
      favorites: [],

      pushHistory: (entry) => {
        const full: ComposerHistoryEntry = {
          ...entry,
          id: genId(),
          createdAt: Date.now(),
        };
        set((s) => {
          // 新的放最前面，超出上限砍尾
          const next = [full, ...s.history];
          if (next.length > HISTORY_LIMIT) next.length = HISTORY_LIMIT;
          return { history: next };
        });
        return full;
      },
      removeHistory: (id) =>
        set((s) => ({ history: s.history.filter((h) => h.id !== id) })),
      clearHistory: () => set({ history: [] }),

      addFavorite: (entry) => {
        const full: ComposerFavoriteEntry = {
          ...entry,
          id: genId(),
          createdAt: Date.now(),
        };
        set((s) => ({ favorites: [full, ...s.favorites] }));
        return full;
      },
      favoriteFromHistory: (historyId, name) => {
        const item = get().history.find((h) => h.id === historyId);
        if (!item) return null;
        const full: ComposerFavoriteEntry = {
          ...item,
          id: genId(),
          createdAt: Date.now(),
          name: name ?? `${item.method} ${item.url}`,
        };
        set((s) => ({ favorites: [full, ...s.favorites] }));
        return full;
      },
      renameFavorite: (id, name) =>
        set((s) => ({
          favorites: s.favorites.map((f) => (f.id === id ? { ...f, name } : f)),
        })),
      removeFavorite: (id) =>
        set((s) => ({ favorites: s.favorites.filter((f) => f.id !== id) })),
    }),
    {
      name: 'w-composer-history',
      // 只持久化 history + favorites（其他都是函数，不会写入）
      partialize: (s) => ({ history: s.history, favorites: s.favorites }),
    }
  )
);
