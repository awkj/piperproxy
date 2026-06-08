import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface BreakpointTemplateHeader {
  name: string;
  value: string;
  action: 'set' | 'remove';
}

export interface BreakpointTemplate {
  id: string;
  name: string;
  type: 'request' | 'response';
  description?: string;
  // request fields
  method?: string;
  urlPattern?: string;
  // shared
  headers?: BreakpointTemplateHeader[];
  body?: string;
  // response only
  statusCode?: number;
  builtin?: boolean;
}

const BUILTIN_TEMPLATES: BreakpointTemplate[] = [
  {
    id: 'builtin-401',
    name: 'Fake 401 Unauthorized',
    type: 'response',
    description: 'Return a 401 Unauthorized response',
    statusCode: 401,
    headers: [{ name: 'WWW-Authenticate', value: 'Bearer realm="piper"', action: 'set' }],
    body: '{"error":"unauthorized"}',
    builtin: true,
  },
  {
    id: 'builtin-500',
    name: 'Fake 500 Server Error',
    type: 'response',
    description: 'Return a 500 Internal Server Error response',
    statusCode: 500,
    body: '{"error":"internal server error"}',
    builtin: true,
  },
  {
    id: 'builtin-empty-json',
    name: 'Return Empty JSON {}',
    type: 'response',
    description: 'Return an empty JSON object',
    statusCode: 200,
    headers: [{ name: 'Content-Type', value: 'application/json', action: 'set' }],
    body: '{}',
    builtin: true,
  },
  {
    id: 'builtin-x-debug',
    name: 'Add X-Debug Header',
    type: 'request',
    description: 'Add X-Debug: true header to the request',
    headers: [{ name: 'X-Debug', value: 'true', action: 'set' }],
    builtin: true,
  },
];

interface BreakpointTemplatesState {
  panelOpen: boolean;
  setPanelOpen: (v: boolean) => void;

  templates: BreakpointTemplate[];
  addTemplate: (t: Omit<BreakpointTemplate, 'id'>) => void;
  updateTemplate: (id: string, patch: Partial<BreakpointTemplate>) => void;
  deleteTemplate: (id: string) => void;

  // All templates (builtin + user) merged
  allTemplates: () => BreakpointTemplate[];
}

export const useBreakpointTemplatesStore = create<BreakpointTemplatesState>()(
  persist(
    (set, get) => ({
      panelOpen: false,
      setPanelOpen: (panelOpen) => set({ panelOpen }),

      templates: [],
      addTemplate: (t) =>
        set((s) => ({
          templates: [...s.templates, { ...t, id: `bt-${Date.now()}` }],
        })),
      updateTemplate: (id, patch) =>
        set((s) => ({
          templates: s.templates.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),
      deleteTemplate: (id) =>
        set((s) => ({
          templates: s.templates.filter((t) => t.id !== id),
        })),
      allTemplates: () => [...BUILTIN_TEMPLATES, ...get().templates],
    }),
    {
      name: 'piper-breakpoint-templates',
      partialize: (s) => ({ templates: s.templates }),
    }
  )
);
