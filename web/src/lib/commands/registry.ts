import { create } from 'zustand';
import type { Command } from './types';

interface CommandRegistryState {
  commands: Command[];
  registerMany: (cmds: Command[]) => void;
  unregisterMany: (ids: string[]) => void;
}

export const useCommandRegistry = create<CommandRegistryState>((set) => ({
  commands: [],
  registerMany: (cmds) =>
    set((s) => {
      const existing = new Set(s.commands.map((c) => c.id));
      const toAdd = cmds.filter((c) => !existing.has(c.id));
      if (toAdd.length === 0) return s;
      return { commands: [...s.commands, ...toAdd] };
    }),
  unregisterMany: (ids) =>
    set((s) => {
      const toRemove = new Set(ids);
      return { commands: s.commands.filter((c) => !toRemove.has(c.id)) };
    }),
}));

