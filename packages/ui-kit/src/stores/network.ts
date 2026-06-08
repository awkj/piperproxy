import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CaptureItem } from '../types'

export const COLUMN_KEYS = [
  'id',
  'protocol',
  'path',
  'method',
  'result',
  'timestamp',
  'time',
  'type',
  'size',
  'clientIp',
  'edit',
  'comment',
  'tools',
  'index',
  'hostname',
  'hostIp',
  'process',
  'dns',
  'request',
  'response',
  'ttfb',
  'graphqlOp',
] as const

export type ColumnKey = (typeof COLUMN_KEYS)[number]

export interface ColumnConfig {
  visible: boolean
  width: number
}

export const DEFAULT_COLUMNS: Record<ColumnKey, ColumnConfig> = {
  id: { visible: true, width: 64 },
  protocol: { visible: true, width: 60 },
  path: { visible: true, width: 320 },
  method: { visible: true, width: 70 },
  result: { visible: true, width: 64 },
  timestamp: { visible: true, width: 96 },
  time: { visible: true, width: 70 },
  type: { visible: true, width: 90 },
  size: { visible: true, width: 90 },
  clientIp: { visible: true, width: 140 },
  edit: { visible: true, width: 56 },
  comment: { visible: true, width: 56 },
  tools: { visible: true, width: 56 },
  index: { visible: false, width: 48 },
  hostname: { visible: false, width: 160 },
  hostIp: { visible: false, width: 120 },
  process: { visible: false, width: 130 },
  dns: { visible: false, width: 70 },
  request: { visible: false, width: 80 },
  response: { visible: false, width: 80 },
  ttfb: { visible: false, width: 70 },
  graphqlOp: { visible: false, width: 120 },
}

export const TYPE_FILTERS = [
  'all',
  'http',
  'https',
  'ws',
  'json',
  'js',
  'css',
  'image',
  'font',
  'media',
  'other',
] as const
export type TypeFilter = (typeof TYPE_FILTERS)[number]

interface NetworkState {
  filter: string
  setFilter: (filter: string) => void
  typeFilter: TypeFilter
  setTypeFilter: (t: TypeFilter) => void
  paused: boolean
  togglePaused: () => void

  turboMode: boolean
  setTurboMode: (on: boolean) => void
  turboCount: number
  turboBuffer: CaptureItem[]
  bufferCaptureItem: (item: CaptureItem) => void

  selectedId: string | null
  setSelectedId: (id: string | null) => void

  selectionHistory: string[]
  selectionIndex: number
  navigateBack: () => void
  navigateForward: () => void

  multiSelectIds: string[]
  toggleMultiSelect: (id: string) => void
  clearMultiSelect: () => void

  removedIds: string[]
  removeIds: (ids: string[]) => void
  resetRemoved: () => void

  columns: Record<ColumnKey, ColumnConfig>
  toggleColumnVisible: (key: ColumnKey) => void
  setColumnWidth: (key: ColumnKey, width: number) => void
  resetColumns: () => void

  captureItems: CaptureItem[]
  upsertCaptureItem: (item: CaptureItem) => void
  patchCaptureItem: (id: string, patch: Partial<CaptureItem>) => void
  clearCaptureItems: () => void
}

export const useNetworkStore = create<NetworkState>()(
  persist(
    (set) => ({
      filter: '',
      setFilter: (filter) => set({ filter }),
      typeFilter: 'all' as TypeFilter,
      setTypeFilter: (typeFilter) => set({ typeFilter }),
      paused: false,
      togglePaused: () => set((s) => ({ paused: !s.paused })),

      turboMode: false,
      turboCount: 0,
      turboBuffer: [],
      setTurboMode: (on) =>
        set((s) => {
          if (on) return { turboMode: true, turboCount: 0, turboBuffer: [] }
          if (s.turboBuffer.length === 0) return { turboMode: false }
          const merged = [...s.captureItems]
          for (const item of s.turboBuffer) {
            const idx = merged.findIndex((x) => x.id === item.id)
            if (idx >= 0) {
              merged[idx] = { ...merged[idx], ...item }
            } else {
              merged.push(item)
            }
          }
          return { turboMode: false, turboBuffer: [], turboCount: 0, captureItems: merged }
        }),
      bufferCaptureItem: (item) =>
        set((s) => {
          const idx = s.turboBuffer.findIndex((x) => x.id === item.id)
          if (idx >= 0) {
            const next = [...s.turboBuffer]
            next[idx] = { ...next[idx], ...item }
            return { turboBuffer: next, turboCount: s.turboCount }
          }
          return { turboBuffer: [...s.turboBuffer, item], turboCount: s.turboCount + 1 }
        }),

      selectedId: null,
      setSelectedId: (selectedId) =>
        set((s) => {
          if (!selectedId || selectedId === s.selectedId) return { selectedId }
          const truncated = s.selectionHistory.slice(0, s.selectionIndex + 1)
          const history = [...truncated, selectedId]
          return {
            selectedId,
            selectionHistory: history,
            selectionIndex: history.length - 1,
          }
        }),

      selectionHistory: [],
      selectionIndex: -1,
      navigateBack: () =>
        set((s) => {
          const nextIndex = s.selectionIndex - 1
          if (nextIndex < 0) return s
          return {
            selectionIndex: nextIndex,
            selectedId: s.selectionHistory[nextIndex] ?? s.selectedId,
          }
        }),
      navigateForward: () =>
        set((s) => {
          const nextIndex = s.selectionIndex + 1
          if (nextIndex >= s.selectionHistory.length) return s
          return {
            selectionIndex: nextIndex,
            selectedId: s.selectionHistory[nextIndex] ?? s.selectedId,
          }
        }),

      multiSelectIds: [],
      toggleMultiSelect: (id) =>
        set((s) => {
          const has = s.multiSelectIds.includes(id)
          return {
            multiSelectIds: has
              ? s.multiSelectIds.filter((x) => x !== id)
              : [...s.multiSelectIds, id],
          }
        }),
      clearMultiSelect: () => set({ multiSelectIds: [] }),

      removedIds: [],
      removeIds: (ids) =>
        set((s) => {
          if (!ids.length) return s
          const set2 = new Set(s.removedIds)
          for (const id of ids) set2.add(id)
          const newHistory = s.selectionHistory.filter((x) => !set2.has(x))
          const oldSelected =
            s.selectedId && ids.includes(s.selectedId) ? null : s.selectedId
          const newIndex = oldSelected ? Math.max(0, newHistory.indexOf(oldSelected)) : -1
          return {
            removedIds: Array.from(set2),
            multiSelectIds: s.multiSelectIds.filter((x) => !ids.includes(x)),
            selectedId: oldSelected,
            selectionHistory: newHistory,
            selectionIndex: newIndex,
          }
        }),
      resetRemoved: () => set({ removedIds: [], selectionHistory: [], selectionIndex: -1 }),

      columns: { ...DEFAULT_COLUMNS },
      toggleColumnVisible: (key) =>
        set((s) => ({
          columns: {
            ...s.columns,
            [key]: { ...s.columns[key], visible: !s.columns[key].visible },
          },
        })),
      setColumnWidth: (key, width) =>
        set((s) => ({
          columns: {
            ...s.columns,
            [key]: { ...s.columns[key], width: Math.max(40, Math.round(width)) },
          },
        })),
      resetColumns: () => set({ columns: { ...DEFAULT_COLUMNS } }),

      captureItems: [],
      upsertCaptureItem: (item) =>
        set((s) => {
          const idx = s.captureItems.findIndex((x) => x.id === item.id)
          if (idx >= 0) {
            const next = [...s.captureItems]
            next[idx] = { ...next[idx], ...item }
            return { captureItems: next }
          }
          return { captureItems: [...s.captureItems, item] }
        }),
      patchCaptureItem: (id, patch) =>
        set((s) => {
          const idx = s.captureItems.findIndex((x) => x.id === id)
          if (idx < 0) return s
          const next = [...s.captureItems]
          next[idx] = { ...next[idx]!, ...patch }
          return { captureItems: next }
        }),
      clearCaptureItems: () => set({ captureItems: [] }),
    }),
    {
      name: 'w-network-columns-v6',
      partialize: (s) => ({ columns: s.columns }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<{
          columns: Partial<Record<ColumnKey, ColumnConfig>>
        }>
        return {
          ...current,
          columns: {
            ...DEFAULT_COLUMNS,
            ...(p.columns ?? {}),
          } as Record<ColumnKey, ColumnConfig>,
        }
      },
    },
  ),
)
