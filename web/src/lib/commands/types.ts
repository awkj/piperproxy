export type CommandCategory =
  | 'session'
  | 'rule'
  | 'view'
  | 'tool'
  | 'setting'
  | 'doc';

export interface Command {
  id: string;
  labelKey: string;
  category: CommandCategory;
  icon?: string;
  shortcut?: string;
  keywords?: string[];
  run: () => void | Promise<void>;
}
