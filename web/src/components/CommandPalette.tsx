import { useEffect, useMemo, useRef, useState } from 'react';
import { Command } from 'cmdk';
import { useTranslation } from 'react-i18next';
import { useCommandRegistry } from '@/lib/commands/registry';
import type { Command as PiperCommand, CommandCategory } from '@/lib/commands/types';
import { useUIStore } from '@/store/ui';

const PINS_KEY = 'piper.palette.pins';
const RECENT_KEY = 'piper.palette.recent';
const RECENT_MAX = 10;

function getPins(): string[] {
  try {
    return JSON.parse(localStorage.getItem(PINS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function setPins(ids: string[]) {
  localStorage.setItem(PINS_KEY, JSON.stringify(ids));
}

function getRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function pushRecent(id: string) {
  const list = getRecent().filter((x) => x !== id);
  list.unshift(id);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
}

const CATEGORY_LABEL_KEYS: Record<CommandCategory, string> = {
  session: 'palette.category.session',
  rule: 'palette.category.rule',
  view: 'palette.category.view',
  tool: 'palette.category.tool',
  setting: 'palette.category.setting',
  doc: 'palette.category.doc',
};

const CATEGORY_ORDER: CommandCategory[] = [
  'session',
  'rule',
  'view',
  'tool',
  'setting',
  'doc',
];

function CommandItem({
  cmd,
  pinned,
  onRun,
  onPin,
}: {
  cmd: PiperCommand;
  pinned: boolean;
  onRun: (cmd: PiperCommand) => void;
  onPin: (id: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <Command.Item
      key={cmd.id}
      value={[cmd.id, t(cmd.labelKey), ...(cmd.keywords ?? [])].join(' ')}
      onSelect={() => onRun(cmd)}
      className="group flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-neutral-700 outline-none data-[selected=true]:bg-neutral-100 dark:text-neutral-200 dark:data-[selected=true]:bg-neutral-700"
    >
      <span className="flex-1 truncate">{t(cmd.labelKey)}</span>
      {cmd.shortcut && (
        <kbd className="shrink-0 rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 font-mono text-xs text-neutral-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
          {cmd.shortcut}
        </kbd>
      )}
      <button
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onPin(cmd.id);
        }}
        className="shrink-0 rounded p-0.5 text-neutral-300 opacity-0 transition-opacity hover:text-amber-400 group-hover:opacity-100 dark:text-neutral-600"
        tabIndex={-1}
        aria-label={pinned ? 'unpin' : 'pin'}
      >
        {pinned ? '★' : '☆'}
      </button>
    </Command.Item>
  );
}

export function CommandPalette() {
  const { t } = useTranslation();
  const open = useUIStore((s) => s.paletteOpen);
  const setPaletteOpen = useUIStore((s) => s.setPaletteOpen);
  const commands = useCommandRegistry((s) => s.commands);

  const [query, setQuery] = useState('');
  const [pins, setPinsState] = useState<string[]>(() => getPins());
  const [recent, setRecentState] = useState<string[]>(() => getRecent());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setPinsState(getPins());
      setRecentState(getRecent());
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const handleRun = (cmd: PiperCommand) => {
    setPaletteOpen(false);
    pushRecent(cmd.id);
    setRecentState(getRecent());
    void cmd.run();
  };

  const handlePin = (id: string) => {
    const current = getPins();
    const next = current.includes(id) ? current.filter((x) => x !== id) : [id, ...current];
    setPins(next);
    setPinsState(next);
  };

  const cmdMap = useMemo(() => {
    const m = new Map<string, PiperCommand>();
    for (const c of commands) m.set(c.id, c);
    return m;
  }, [commands]);

  const pinnedCmds = useMemo(
    () => pins.map((id) => cmdMap.get(id)).filter(Boolean) as PiperCommand[],
    [pins, cmdMap]
  );

  const recentCmds = useMemo(() => {
    const pinSet = new Set(pins);
    return recent
      .filter((id) => !pinSet.has(id))
      .map((id) => cmdMap.get(id))
      .filter(Boolean) as PiperCommand[];
  }, [recent, pins, cmdMap]);

  const byCategory = useMemo(() => {
    const pinSet = new Set(pins);
    const recentSet = new Set(recent);
    const filtered = commands.filter((c) => !pinSet.has(c.id) && !recentSet.has(c.id));
    const map = new Map<CommandCategory, PiperCommand[]>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    for (const cmd of filtered) {
      map.get(cmd.category)?.push(cmd);
    }
    return map;
  }, [commands, pins, recent]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[10vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setPaletteOpen(false);
      }}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
        <Command
          className="flex flex-col"
          shouldFilter={true}
          filter={(value, search) => {
            if (!search) return 1;
            const normalized = search.toLowerCase();
            return value.toLowerCase().includes(normalized) ? 1 : 0;
          }}
        >
          <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
            <span className="text-neutral-400">🔍</span>
            <Command.Input
              ref={inputRef}
              value={query}
              onValueChange={setQuery}
              placeholder={t('palette.searchPlaceholder')}
              className="flex-1 bg-transparent text-sm text-neutral-900 placeholder:text-neutral-400 outline-none dark:text-white"
            />
            <kbd className="rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 font-mono text-xs text-neutral-400 dark:border-neutral-600 dark:bg-neutral-800">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-neutral-400">
              {t('palette.noResults')}
            </Command.Empty>

            {pinnedCmds.length > 0 && (
              <Command.Group
                heading={
                  <span className="px-3 py-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                    ⭐ {t('palette.pinned')}
                  </span>
                }
              >
                {pinnedCmds.map((cmd) => (
                  <CommandItem
                    key={cmd.id}
                    cmd={cmd}
                    pinned={true}
                    onRun={handleRun}
                    onPin={handlePin}
                  />
                ))}
              </Command.Group>
            )}

            {recentCmds.length > 0 && (
              <Command.Group
                heading={
                  <span className="px-3 py-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                    🕐 {t('palette.recent')}
                  </span>
                }
              >
                {recentCmds.slice(0, 5).map((cmd) => (
                  <CommandItem
                    key={cmd.id}
                    cmd={cmd}
                    pinned={false}
                    onRun={handleRun}
                    onPin={handlePin}
                  />
                ))}
              </Command.Group>
            )}

            {CATEGORY_ORDER.map((cat) => {
              const items = byCategory.get(cat) ?? [];
              if (items.length === 0) return null;
              return (
                <Command.Group
                  key={cat}
                  heading={
                    <span className="px-3 py-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                      {t(CATEGORY_LABEL_KEYS[cat])}
                    </span>
                  }
                >
                  {items.map((cmd) => (
                    <CommandItem
                      key={cmd.id}
                      cmd={cmd}
                      pinned={pins.includes(cmd.id)}
                      onRun={handleRun}
                      onPin={handlePin}
                    />
                  ))}
                </Command.Group>
              );
            })}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
