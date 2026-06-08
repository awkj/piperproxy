import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type DetailLayout = 'vertical' | 'horizontal' | 'detached'

interface DetailLayoutState {
  layout: DetailLayout
  setLayout: (l: DetailLayout) => void
  visible: boolean
  setVisible: (v: boolean) => void
  toggleVisible: () => void
}

export const useDetailLayoutStore = create<DetailLayoutState>()(
  persist(
    (set) => ({
      layout: 'vertical',
      setLayout: (layout) => set({ layout }),
      visible: true,
      setVisible: (visible) => set({ visible }),
      toggleVisible: () => set((s) => ({ visible: !s.visible })),
    }),
    { name: 'piper-detail-layout' },
  ),
)
