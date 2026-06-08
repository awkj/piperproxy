/**
 * 快捷键清单（移植自老前端 `shortcuts-settings.js`）。
 * - 字段顺序保持一致，方便对账
 * - 当前只展示 + 通过 localStorage 控制启用；实际监听绑定还在
 *   `App.tsx` / 各 Panel 里，本次不动
 */

const CMD = 'Ctrl/Cmd';

export interface ShortcutEntry {
  /** 唯一 ID（用于 localStorage 持久化） */
  id: string;
  /** 显示用按键组合 */
  keys: string;
  /** 描述 i18n key（可选） */
  desc: string;
}

export interface ShortcutCategory {
  /** i18n key */
  labelKey: string;
  list: ShortcutEntry[];
}

export const SHORTCUTS: ShortcutCategory[] = [
  {
    labelKey: 'settings.shortcuts.categoryNetwork',
    list: [
      { id: 'importNetwork', keys: `${CMD} + I`, desc: 'Import network sessions' },
      { id: 'exportNetwork', keys: `${CMD} + E`, desc: 'Export network sessions' },
      { id: 'saveNetwork', keys: `${CMD} + S`, desc: 'Save network sessions' },
      { id: 'toggleNetworkState', keys: `${CMD} + O`, desc: 'Turn captured requests ON or OFF' },
      { id: 'toggleNetworkPanelLayout', keys: `${CMD} + L`, desc: 'Toggle Network Panel layout' },
      { id: 'openNetworkSettings', keys: `${CMD} + .`, desc: 'Open network settings' },
      { id: 'removeNetworkSessions', keys: `${CMD} + D`, desc: 'Remove selected sessions' },
      { id: 'switchNetworkView', keys: `${CMD} + B`, desc: 'Switch tree / list view' },
      { id: 'replaySelectedRequests', keys: `${CMD} + Enter`, desc: 'Replay selected requests' },
      { id: 'replaySelectedRequestsTimes', keys: `${CMD} + Shift + Enter`, desc: 'Replay N times' },
      { id: 'abortRequest', keys: `${CMD} + A`, desc: 'Abort requests' },
      { id: 'clearNetworkSessions', keys: `${CMD} + X`, desc: 'Clear sessions' },
      { id: 'focusNetworkSearchBox', keys: '/', desc: 'Focus the network search box' },
      { id: 'toggleDetailPanel', keys: `${CMD} + B`, desc: 'Toggle detail panel visibility' },
      { id: 'openSearchFilter', keys: `${CMD} + F`, desc: 'Open multi-condition search filter' },
      { id: 'editRepeat', keys: `${CMD} + R`, desc: 'Edit & Repeat selected request in Composer' },
    ],
  },
  {
    labelKey: 'settings.shortcuts.categoryFrames',
    list: [
      { id: 'replaySelectedFrame', keys: `${CMD} + Enter`, desc: 'Replay selected frames' },
      { id: 'clearNetworkFrames', keys: `${CMD} + X`, desc: 'Clear frames' },
    ],
  },
  {
    labelKey: 'settings.shortcuts.categoryRules',
    list: [
      { id: 'importRules', keys: `${CMD} + I`, desc: 'Import rules' },
      { id: 'exportRules', keys: `${CMD} + E`, desc: 'Export rules' },
      { id: 'saveRulesChanges', keys: `${CMD} + S`, desc: 'Save rules changes' },
      { id: 'toggleRules', keys: `${CMD} + O`, desc: 'Turn rules ON or OFF' },
      { id: 'toggleRulesNum', keys: `${CMD} + L`, desc: 'Toggle line numbers' },
      { id: 'openRulesSettings', keys: `${CMD} + .`, desc: 'Open rules settings' },
      { id: 'focusRulesSearchBox', keys: '/', desc: 'Focus the rules search box' },
    ],
  },
  {
    labelKey: 'settings.shortcuts.categoryValues',
    list: [
      { id: 'importValues', keys: `${CMD} + I`, desc: 'Import values' },
      { id: 'exportValues', keys: `${CMD} + E`, desc: 'Export values' },
      { id: 'saveValuesChanges', keys: `${CMD} + S`, desc: 'Save values changes' },
      { id: 'toggleValuesNum', keys: `${CMD} + L`, desc: 'Toggle line numbers' },
      { id: 'openValuesSettings', keys: `${CMD} + .`, desc: 'Open values settings' },
      { id: 'focusValuesSearchBox', keys: '/', desc: 'Focus the values search box' },
    ],
  },
  {
    labelKey: 'settings.shortcuts.categoryPlugins',
    list: [
      { id: 'openInstallPlugins', keys: `${CMD} + I`, desc: 'Open install plugins dialog' },
      { id: 'togglePlugins', keys: `${CMD} + O`, desc: 'Turn all plugins ON or OFF' },
    ],
  },
  {
    labelKey: 'settings.shortcuts.categoryOthers',
    list: [
      { id: 'switchTabReverse', keys: `${CMD} + ←`, desc: 'Switch tabs (reverse)' },
      { id: 'switchTab', keys: `${CMD} + →`, desc: 'Switch tabs' },
      { id: 'openService', keys: `${CMD} + J`, desc: 'Open service dialog' },
    ],
  },
];

const STORAGE_KEY = 'w-shortcuts-prefs';

export function readShortcutsPrefs(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    return {};
  }
}

export function writeShortcutsPrefs(prefs: Record<string, boolean>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}
