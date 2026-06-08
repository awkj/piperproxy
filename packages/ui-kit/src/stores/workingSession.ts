import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface PinnedEntry {
  type: 'domain' | 'app'
  value: string
}

interface WorkingSessionState {
  activeDomain: string | null
  setActiveDomain: (v: string | null) => void

  pinned: PinnedEntry[]
  pin: (entry: PinnedEntry) => void
  unpin: (entry: PinnedEntry) => void
  isPinned: (entry: PinnedEntry) => boolean
  clearPinned: () => void

  filterEnabled: boolean
  toggleFilter: () => void
  setFilterEnabled: (v: boolean) => void

  sidebarVisible: boolean
  toggleSidebar: () => void
  sidebarWidth: number
  setSidebarWidth: (width: number) => void
}

export const useWorkingSessionStore = create<WorkingSessionState>()(
  persist(
    (set, get) => ({
      activeDomain: null,
      setActiveDomain: (activeDomain) => set({ activeDomain }),

      pinned: [],
      pin: (entry) =>
        set((s) => {
          if (s.pinned.some((p) => p.type === entry.type && p.value === entry.value)) return s
          return { pinned: [...s.pinned, entry] }
        }),
      unpin: (entry) =>
        set((s) => ({
          pinned: s.pinned.filter(
            (p) => !(p.type === entry.type && p.value === entry.value),
          ),
        })),
      isPinned: (entry) =>
        get().pinned.some((p) => p.type === entry.type && p.value === entry.value),
      clearPinned: () => set({ pinned: [], filterEnabled: false }),

      filterEnabled: false,
      toggleFilter: () => set((s) => ({ filterEnabled: !s.filterEnabled })),
      setFilterEnabled: (filterEnabled) => set({ filterEnabled }),

      sidebarVisible: true,
      toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
      sidebarWidth: 220,
      setSidebarWidth: (width) =>
        set({ sidebarWidth: Math.max(160, Math.min(480, Math.round(width))) }),
    }),
    {
      name: 'piper-working-session',
      partialize: (s) => ({
        pinned: s.pinned,
        filterEnabled: s.filterEnabled,
        sidebarVisible: s.sidebarVisible,
        sidebarWidth: s.sidebarWidth,
      }),
    },
  ),
)
