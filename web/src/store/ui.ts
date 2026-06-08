import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const TABS = [
  'network',
  'rules',
  'values',
  'plugins',
  'composer',
  'frames',
  'https',
  'console',
  'setup',
] as const;
export type TabId = (typeof TABS)[number];

export interface TipsDialogPayload {
  title?: string;
  tips?: string;
  dir?: string;
}

export interface DnsServersDialogPayload {
  /** 逗号分隔的 DNS server 列表，或 DOH URL */
  dns: string;
  /** 是否 DNS-over-HTTPS */
  doh?: boolean;
  /** 是否解析 IPv6 */
  r6?: boolean;
  /** dnsOptional：先尝试自定义 DNS，失败回退默认 */
  df?: boolean;
}

interface UIState {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  aboutOpen: boolean;
  setAboutOpen: (open: boolean) => void;
  // —— Trust Wizard ——
  trustWizardOpen: boolean;
  setTrustWizardOpen: (open: boolean) => void;
  // —— Bypass Proxy ——
  bypassOpen: boolean;
  setBypassOpen: (open: boolean) => void;
  // —— ServiceDialog ——
  serviceOpen: boolean;
  setServiceOpen: (open: boolean) => void;
  // —— ToolsDrawer ——
  toolsOpen: boolean;
  setToolsOpen: (open: boolean) => void;
  // —— Settings 系列 ——
  networkSettingsOpen: boolean;
  setNetworkSettingsOpen: (open: boolean) => void;
  editorSettingsOpen: boolean;
  /** 'rules' | 'values'：编辑器设置面向哪个编辑器 */
  editorSettingsTarget: 'rules' | 'values';
  openEditorSettings: (target: 'rules' | 'values') => void;
  setEditorSettingsOpen: (open: boolean) => void;
  shortcutsSettingsOpen: boolean;
  setShortcutsSettingsOpen: (open: boolean) => void;
  syncDialogOpen: boolean;
  setSyncDialogOpen: (open: boolean) => void;
  dnsServersDialogOpen: boolean;
  dnsServersDialogPayload: DnsServersDialogPayload | null;
  openDnsServersDialog: (payload: DnsServersDialogPayload) => void;
  setDnsServersDialogOpen: (open: boolean) => void;
  tipsDialogOpen: boolean;
  tipsDialogPayload: TipsDialogPayload | null;
  openTipsDialog: (payload: TipsDialogPayload) => void;
  setTipsDialogOpen: (open: boolean) => void;
  // —— Breakpoint Templates ——
  breakpointTemplatesOpen: boolean;
  setBreakpointTemplatesOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      activeTab: 'network',
      setActiveTab: (activeTab) => set({ activeTab }),
      paletteOpen: false,
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      aboutOpen: false,
      setAboutOpen: (aboutOpen) => set({ aboutOpen }),
      // —— Trust Wizard ——
      trustWizardOpen: false,
      setTrustWizardOpen: (trustWizardOpen) => set({ trustWizardOpen }),
      // —— Bypass Proxy ——
      bypassOpen: false,
      setBypassOpen: (bypassOpen) => set({ bypassOpen }),
      // —— ServiceDialog ——
      serviceOpen: false,
      setServiceOpen: (serviceOpen) => set({ serviceOpen }),
      // —— ToolsDrawer ——
      toolsOpen: false,
      setToolsOpen: (toolsOpen) => set({ toolsOpen }),
      // —— Settings ——
      networkSettingsOpen: false,
      setNetworkSettingsOpen: (networkSettingsOpen) => set({ networkSettingsOpen }),
      editorSettingsOpen: false,
      editorSettingsTarget: 'rules',
      openEditorSettings: (editorSettingsTarget) =>
        set({ editorSettingsTarget, editorSettingsOpen: true }),
      setEditorSettingsOpen: (editorSettingsOpen) => set({ editorSettingsOpen }),
      shortcutsSettingsOpen: false,
      setShortcutsSettingsOpen: (shortcutsSettingsOpen) => set({ shortcutsSettingsOpen }),
      syncDialogOpen: false,
      setSyncDialogOpen: (syncDialogOpen) => set({ syncDialogOpen }),
      dnsServersDialogOpen: false,
      dnsServersDialogPayload: null,
      openDnsServersDialog: (payload) =>
        set({ dnsServersDialogPayload: payload, dnsServersDialogOpen: true }),
      setDnsServersDialogOpen: (dnsServersDialogOpen) => set({ dnsServersDialogOpen }),
      tipsDialogOpen: false,
      tipsDialogPayload: null,
      openTipsDialog: (payload) =>
        set({ tipsDialogPayload: payload, tipsDialogOpen: true }),
      setTipsDialogOpen: (tipsDialogOpen) => set({ tipsDialogOpen }),
      // —— Breakpoint Templates ——
      breakpointTemplatesOpen: false,
      setBreakpointTemplatesOpen: (breakpointTemplatesOpen) => set({ breakpointTemplatesOpen }),
    }),
    {
      name: 'w-ui-state',
      partialize: (s) => ({ activeTab: s.activeTab }),
    }
  )
);
