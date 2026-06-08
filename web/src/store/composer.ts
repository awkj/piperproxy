import { create } from 'zustand';

export interface ComposerPrefill {
  method: string;
  url: string;
  headers: string;
  body: string;
}

interface ComposerState {
  prefill: ComposerPrefill | null;
  /** Set a new prefill (overrides any pending one). */
  setPrefill: (prefill: ComposerPrefill) => void;
  /**
   * Read the current prefill and clear it atomically. Returning null when
   * nothing is pending lets ComposerPanel detect "user navigated back without
   * a new replay" and avoid clobbering the form state.
   */
  consumePrefill: () => ComposerPrefill | null;
}

export const useComposerStore = create<ComposerState>((set, get) => ({
  prefill: null,
  setPrefill: (prefill) => set({ prefill }),
  consumePrefill: () => {
    const current = get().prefill;
    if (current) set({ prefill: null });
    return current;
  },
}));
