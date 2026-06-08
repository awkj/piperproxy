/**
 * 快捷键 hook：根据 SHORTCUTS 配置和 readShortcutsPrefs() 启用状态，
 * 在当前 active tab 上把 keydown 事件路由到对应 handler。
 *
 * 设计：
 * - 每条快捷键都属于某个 tab（network / rules / values / frames / plugins / others）
 * - tab 不匹配时静音；'others' 是全局生效
 * - readShortcutsPrefs() 只记录被显式禁用的项（boolean = false 表示禁用），
 *   未配置即默认启用
 * - 用户在输入框/编辑器中按键时，除非该快捷键带 Ctrl/Cmd 修饰，否则不触发
 *   （否则 `/` 那种纯字母快捷键会和打字冲突）
 */
import { useEffect } from 'react';
import {
  readShortcutsPrefs,
  SHORTCUTS,
  type ShortcutEntry,
} from '@/features/settings/shortcuts-config';
import { useUIStore, type TabId } from '@/store/ui';

export type ShortcutId = string;

/**
 * key 描述（参考老前端 `shortcuts-settings.js`）
 * - mod: 是否需要 Ctrl/Cmd
 * - shift: 是否需要 Shift
 * - key: 主键，匹配 KeyboardEvent.key（小写比对）
 *        Enter / ArrowLeft / ArrowRight / 字母键 / '.' / '/' 等
 */
interface ParsedKey {
  mod: boolean;
  shift: boolean;
  key: string;
}

const KEY_ALIASES: Record<string, string> = {
  enter: 'enter',
  '←': 'arrowleft',
  '→': 'arrowright',
  '↑': 'arrowup',
  '↓': 'arrowdown',
};

function parseKeys(keys: string): ParsedKey {
  const tokens = keys.split('+').map((s) => s.trim().toLowerCase());
  let mod = false;
  let shift = false;
  let key = '';
  for (const t of tokens) {
    if (t === 'ctrl/cmd' || t === 'ctrl' || t === 'cmd' || t === 'meta') {
      mod = true;
    } else if (t === 'shift') {
      shift = true;
    } else {
      key = KEY_ALIASES[t] ?? t;
    }
  }
  return { mod, shift, key };
}

function eventMatches(ev: KeyboardEvent, parsed: ParsedKey): boolean {
  const isMod = ev.metaKey || ev.ctrlKey;
  if (parsed.mod !== isMod) return false;
  if (parsed.shift !== ev.shiftKey) return false;
  // 比对主键。注意 Shift+Enter 在某些键盘 ev.key 仍然是 'Enter'。
  return ev.key.toLowerCase() === parsed.key;
}

/** 输入聚焦时屏蔽：除非快捷键带 Ctrl/Cmd 修饰，否则不响应 */
function shouldSkipInput(ev: KeyboardEvent, parsed: ParsedKey): boolean {
  if (parsed.mod) return false;
  const target = ev.target as HTMLElement | null;
  if (!target) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  // CodeMirror 编辑器
  if (target.closest('.cm-editor')) return true;
  return false;
}

/** 把每个快捷键所属 tab 摊平：'others' 表示全局 */
const SHORTCUT_TAB: Record<ShortcutId, TabId | 'others'> = (() => {
  const map: Record<string, TabId | 'others'> = {};
  for (const cat of SHORTCUTS) {
    let tab: TabId | 'others' = 'others';
    if (cat.labelKey.endsWith('categoryNetwork')) tab = 'network';
    else if (cat.labelKey.endsWith('categoryFrames')) tab = 'frames';
    else if (cat.labelKey.endsWith('categoryRules')) tab = 'rules';
    else if (cat.labelKey.endsWith('categoryValues')) tab = 'values';
    else if (cat.labelKey.endsWith('categoryPlugins')) tab = 'plugins';
    for (const item of cat.list) map[item.id] = tab;
  }
  return map;
})();

/** 把所有快捷键展平，避免 hook 内重复扫描结构 */
const ALL_ENTRIES: ShortcutEntry[] = SHORTCUTS.flatMap((c) => c.list);

export function useShortcuts(handlers: Partial<Record<ShortcutId, () => void>>) {
  const activeTab = useUIStore((s) => s.activeTab);

  useEffect(() => {
    const prefs = readShortcutsPrefs();
    // 缓存解析后的 key
    const parsedCache = new Map<string, ParsedKey>();
    const onKey = (ev: KeyboardEvent) => {
      // 找到匹配项；按声明顺序优先匹配，避免一个事件触发多个 handler
      for (const entry of ALL_ENTRIES) {
        const handler = handlers[entry.id];
        if (!handler) continue;
        if (prefs[entry.id] === false) continue;
        const tab = SHORTCUT_TAB[entry.id];
        if (tab !== 'others' && tab !== activeTab) continue;
        let parsed = parsedCache.get(entry.keys);
        if (!parsed) {
          parsed = parseKeys(entry.keys);
          parsedCache.set(entry.keys, parsed);
        }
        if (!eventMatches(ev, parsed)) continue;
        if (shouldSkipInput(ev, parsed)) continue;
        ev.preventDefault();
        handler();
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlers, activeTab]);
}
