export { SettingsDialogs } from './SettingsDialogs';
export { NetworkSettingsDialog } from './NetworkSettingsDialog';
export { EditorSettingsDialog } from './EditorSettingsDialog';
export { ShortcutsSettingsDialog } from './ShortcutsSettingsDialog';
export { SyncDialog } from './SyncDialog';
export { DnsServersDialog } from './DnsServersDialog';
export { TipsDialog } from './TipsDialog';

export { useNetworkPrefs, MAX_ROWS_OPTIONS, DEFAULT_PREFS } from './network-prefs';
export type { NetworkPrefs } from './network-prefs';
export { useEditorPrefs, EDITOR_THEMES, FONT_SIZE_OPTIONS } from './editor-prefs';
export type { EditorPrefs } from './editor-prefs';
export {
  SHORTCUTS,
  readShortcutsPrefs,
  writeShortcutsPrefs,
} from './shortcuts-config';
export type { ShortcutEntry, ShortcutCategory } from './shortcuts-config';
