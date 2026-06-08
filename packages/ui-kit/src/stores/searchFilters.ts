import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type FilterField =
  | 'url'
  | 'method'
  | 'req_ct'
  | 'req_header'
  | 'req_body'
  | 'res_ct'
  | 'res_header'
  | 'res_body'
  | 'status'
  | 'client_ip'
  | 'server_ip'
  | 'highlight'
  | 'comment'
  | 'process'

export type FilterOp =
  | 'contains'
  | 'not_contains'
  | 'equals'
  | 'not_equals'
  | 'starts_with'
  | 'ends_with'
  | 'wildcard'
  | 'regex'

export interface FilterClause {
  id: string
  field: FilterField
  op: FilterOp
  value: string
  fieldArg?: string
}

export interface FilterSet {
  combinator: 'AND' | 'OR'
  clauses: FilterClause[]
}

export interface SavedFilter {
  id: string
  name: string
  filterSet: FilterSet
}

const EMPTY_FILTER_SET: FilterSet = { combinator: 'AND', clauses: [] }

interface SearchFiltersState {
  open: boolean
  setOpen: (v: boolean) => void
  toggleOpen: () => void

  filterSet: FilterSet
  setFilterSet: (fs: FilterSet) => void
  clearFilterSet: () => void

  savedFilters: SavedFilter[]
  saveFilter: (name: string, fs: FilterSet) => void
  deleteSavedFilter: (id: string) => void
  applySavedFilter: (id: string) => void
}

export const useSearchFiltersStore = create<SearchFiltersState>()(
  persist(
    (set, get) => ({
      open: false,
      setOpen: (open) => set({ open }),
      toggleOpen: () => set((s) => ({ open: !s.open })),

      filterSet: EMPTY_FILTER_SET,
      setFilterSet: (filterSet) => set({ filterSet }),
      clearFilterSet: () => set({ filterSet: EMPTY_FILTER_SET }),

      savedFilters: [],
      saveFilter: (name, filterSet) =>
        set((s) => ({
          savedFilters: [
            ...s.savedFilters,
            { id: `sf-${Date.now()}`, name, filterSet },
          ],
        })),
      deleteSavedFilter: (id) =>
        set((s) => ({ savedFilters: s.savedFilters.filter((f) => f.id !== id) })),
      applySavedFilter: (id) => {
        const sf = get().savedFilters.find((f) => f.id === id)
        if (sf) set({ filterSet: sf.filterSet, open: true })
      },
    }),
    {
      name: 'piper-search-filters',
      partialize: (s) => ({ savedFilters: s.savedFilters }),
    },
  ),
)
