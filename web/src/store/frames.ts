// TODO(favorites): 后续可在此 store 加 namedTemplates 字段，并 persist 到
// localStorage（key 形如 `w-frames-templates`），用于"保存常用帧"功能。
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FrameLogEntry } from '@/features/frames/types';

export type FrameStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

interface FramesState {
  url: string;
  setUrl: (v: string) => void;

  status: FrameStatus;
  error: string | null;
  setStatus: (s: FrameStatus, err?: string | null) => void;

  log: FrameLogEntry[];
  appendFrame: (e: FrameLogEntry) => void;
  clearLog: () => void;

  paused: boolean;
  togglePaused: () => void;

  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}

const MAX_LOG_ENTRIES = 5000;

export const useFramesStore = create<FramesState>()(
  persist(
    (set) => ({
      url: 'wss://echo.websocket.events',
      setUrl: (url) => set({ url }),

      status: 'idle',
      error: null,
      setStatus: (status, err = null) => set({ status, error: err }),

      log: [],
      appendFrame: (entry) =>
        set((s) => {
          const next = s.log.length >= MAX_LOG_ENTRIES
            ? [...s.log.slice(s.log.length - MAX_LOG_ENTRIES + 1), entry]
            : [...s.log, entry];
          return { log: next };
        }),
      clearLog: () => set({ log: [], selectedId: null }),

      paused: false,
      togglePaused: () => set((s) => ({ paused: !s.paused })),

      selectedId: null,
      setSelectedId: (selectedId) => set({ selectedId }),
    }),
    {
      name: 'w-frames-url',
      // 只持久化 URL，避免日志撑爆 localStorage
      partialize: (s) => ({ url: s.url }),
    }
  )
);
