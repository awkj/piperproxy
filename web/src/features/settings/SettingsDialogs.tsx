import { NetworkSettingsDialog } from './NetworkSettingsDialog';
import { EditorSettingsDialog } from './EditorSettingsDialog';
import { ShortcutsSettingsDialog } from './ShortcutsSettingsDialog';
import { SyncDialog } from './SyncDialog';
import { DnsServersDialog } from './DnsServersDialog';
import { TipsDialog } from './TipsDialog';
import { BypassProxyDialog } from './BypassProxyDialog';

export function SettingsDialogs() {
  return (
    <>
      <NetworkSettingsDialog />
      <EditorSettingsDialog />
      <ShortcutsSettingsDialog />
      <SyncDialog />
      <DnsServersDialog />
      <TipsDialog />
      <BypassProxyDialog />
    </>
  );
}
