import { create } from 'zustand'
import type { NetworkItem } from '../types'

export interface DiffPoolState {
  pool: NetworkItem[]
  leftId: string | null
  rightId: string | null
  open: boolean

  addToPool: (item: NetworkItem) => void
  removeFromPool: (id: string) => void
  clearPool: () => void
  setLeft: (id: string | null) => void
  setRight: (id: string | null) => void
  openWith: (items: NetworkItem[]) => void
  setOpen: (open: boolean) => void
}

export const useDiffPoolStore = create<DiffPoolState>((set) => ({
  pool: [],
  leftId: null,
  rightId: null,
  open: false,

  addToPool: (item) =>
    set((s) => {
      if (s.pool.find((p) => p.id === item.id)) return s
      return { pool: [...s.pool, item] }
    }),

  removeFromPool: (id) =>
    set((s) => ({
      pool: s.pool.filter((p) => p.id !== id),
      leftId: s.leftId === id ? null : s.leftId,
      rightId: s.rightId === id ? null : s.rightId,
    })),

  clearPool: () => set({ pool: [], leftId: null, rightId: null }),

  setLeft: (leftId) => set({ leftId }),
  setRight: (rightId) => set({ rightId }),

  openWith: (items) =>
    set((s) => {
      const existing = s.pool
      const newItems = items.filter((i) => !existing.find((p) => p.id === i.id))
      const pool = [...existing, ...newItems]
      const leftId = items[0]?.id ?? s.leftId
      const rightId = items[1]?.id ?? s.rightId
      return { pool, leftId, rightId, open: true }
    }),

  setOpen: (open) => set({ open }),
}))
