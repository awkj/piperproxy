import { lazy, Suspense, useCallback, useEffect, type ComponentType } from 'react';
import { useComposerStore } from '@/store/composer';
import type { NetworkItem } from '@piper/ui-kit';
import { DiffTool } from '@/views/DiffTool';
import { SWRConfig, useSWRConfig } from 'swr';
import { Toaster, toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { TopNav } from '@/components/TopNav';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { CommandPalette } from '@/components/CommandPalette';
import { StatusBar } from '@/features/footer';
import { RulesPanel } from '@/features/rules/RulesPanel';
import { TABS, useUIStore, type TabId } from '@/store/ui';
import { useNetworkStore } from '@/store/network';
import { swrFetcher, piperClient } from '@/api/client';
import { PiperUIProvider } from '@piper/ui-kit';
import { useShortcuts } from '@/lib/use-shortcuts';
import { useBuiltinCommands } from '@/lib/commands';
import { useDiffPoolStore } from '@/store/diffPool';
import { fetchCaptureCurl } from '@/api/network';
import { copyToClipboard } from '@/lib/curl';

const NetworkPanel = lazy(() =>
  import('@/features/network/NetworkPanel').then((m) => ({
    default: m.NetworkPanel,
  }))
);
const ValuesPanel = lazy(() =>
  import('@/features/values/ValuesPanel').then((m) => ({
    default: m.ValuesPanel,
  }))
);
const PluginsPanel = lazy(() =>
  import('@/features/plugins/PluginsPanel').then((m) => ({
    default: m.PluginsPanel,
  }))
);
const ComposerPanel = lazy(() =>
  import('@/features/composer/ComposerPanel').then((m) => ({
    default: m.ComposerPanel,
  }))
);
const FramesPanel = lazy(() =>
  import('@/features/frames/FramesPanel').then((m) => ({
    default: m.FramesPanel,
  }))
);
const HttpsPanel = lazy(() =>
  import('@/features/https/HttpsPanel').then((m) => ({
    default: m.HttpsPanel,
  }))
);
const ConsolePanel = lazy(() =>
  import('@/features/console/ConsolePanel').then((m) => ({
    default: m.ConsolePanel,
  }))
);
const SetupPanel = lazy(() =>
  import('@/features/setup/SetupPanel').then((m) => ({
    default: m.SetupPanel,
  }))
);
const AboutDialog = lazy(() =>
  import('@/features/about/AboutDialog').then((m) => ({
    default: m.AboutDialog,
  }))
);
const SettingsDialogs = lazy(() =>
  import('@/features/settings').then((m) => ({
    default: m.SettingsDialogs,
  }))
);

function NetworkPanelWrapper() {
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const { mutate } = useSWRConfig();
  const handleSendToComposer = (item: NetworkItem) => {
    useComposerStore.getState().setPrefill({
      method: item.method ?? 'GET',
      url: item.url,
      headers: item.req?.headers
        ? Object.entries(item.req.headers)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n')
        : '',
      body: item.req?.body ?? '',
    });
    setActiveTab('composer');
  };
  return (
    <Suspense fallback={<TabFallback />}>
      <NetworkPanel
        onSendToComposer={handleSendToComposer}
        onMutateValues={() => void mutate('api/values')}
      />
    </Suspense>
  );
}

const TAB_PANEL: Record<TabId, ComponentType> = {
  network: NetworkPanelWrapper,
  rules: RulesPanel,
  values: ValuesPanel,
  plugins: PluginsPanel,
  composer: ComposerPanel,
  frames: FramesPanel,
  https: HttpsPanel,
  console: ConsolePanel,
  setup: SetupPanel,
};

function TabFallback() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full items-center justify-center text-sm text-neutral-400">
      {t('common.loading')}
    </div>
  );
}

function MainContent() {
  const activeTab = useUIStore((s) => s.activeTab);
  const Panel = TAB_PANEL[activeTab];
  return (
    <Suspense fallback={<TabFallback />}>
      <Panel />
    </Suspense>
  );
}

const TrustWizardComponent = lazy(() =>
  import('@/features/https/TrustWizard').then((m) => ({
    default: m.TrustWizard,
  }))
);

function LazyAboutDialog() {
  const open = useUIStore((s) => s.aboutOpen);
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <AboutDialog />
    </Suspense>
  );
}

const BreakpointTemplatesPanelLazy = lazy(() =>
  import('@/features/breakpoints/BreakpointTemplatesPanel').then((m) => ({
    default: m.BreakpointTemplatesPanel,
  }))
);

function BreakpointTemplatesDialog() {
  const open = useUIStore((s) => s.breakpointTemplatesOpen);
  const setOpen = useUIStore((s) => s.setBreakpointTemplatesOpen);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={() => setOpen(false)}
    >
      <div
        className="relative flex h-[70vh] w-[600px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Suspense fallback={null}>
          <BreakpointTemplatesPanelLazy />
        </Suspense>
      </div>
    </div>
  );
}

function GlobalTrustWizard() {
  const open = useUIStore((s) => s.trustWizardOpen);
  const setOpen = useUIStore((s) => s.setTrustWizardOpen);

  // 首次打开应用自动弹出 Trust Wizard（localStorage 记录是否已展示过）。
  useEffect(() => {
    const KEY = 'piper:wizardShown';
    if (!localStorage.getItem(KEY)) {
      localStorage.setItem(KEY, '1');
      const t = setTimeout(() => setOpen(true), 400);
      return () => clearTimeout(t);
    }
  }, [setOpen]);

  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <TrustWizardComponent onClose={() => setOpen(false)} />
    </Suspense>
  );
}

function LazySettingsDialogs() {
  const anyOpen = useUIStore(
    (s) =>
      s.networkSettingsOpen ||
      s.editorSettingsOpen ||
      s.shortcutsSettingsOpen ||
      s.syncDialogOpen ||
      s.dnsServersDialogOpen ||
      s.tipsDialogOpen
  );
  if (!anyOpen) return null;
  return (
    <Suspense fallback={null}>
      <SettingsDialogs />
    </Suspense>
  );
}

// 把 activeTab 同步到 location.hash —— 切 tab 时改 URL，浏览器前进/后退也能回到对应 tab。
// 用 hash 是因为后端 SPA 单页直接挂在 / 上，不想在后端额外 catch-all path。
function TabUrlSync() {
  const activeTab = useUIStore((s) => s.activeTab);
  const setActiveTab = useUIStore((s) => s.setActiveTab);

  // 进入页面：如果 hash 命中合法 tab，覆盖 store 里持久化的 activeTab
  useEffect(() => {
    const fromHash = window.location.hash.replace(/^#\/?/, '');
    if (fromHash && (TABS as readonly string[]).includes(fromHash)) {
      setActiveTab(fromHash as TabId);
    } else {
      // 当前 hash 无效 → 用 store 里的 activeTab 写一次 hash
      window.history.replaceState(null, '', `#${activeTab}`);
    }
    // 仅初始化一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // activeTab 变更 → 写 hash（区分用户切 tab 与初始化）
  useEffect(() => {
    const current = window.location.hash.replace(/^#\/?/, '');
    if (current !== activeTab) {
      window.history.pushState(null, '', `#${activeTab}`);
    }
  }, [activeTab]);

  // 浏览器前进/后退：读 hash 写回 store
  useEffect(() => {
    const onHashChange = () => {
      const next = window.location.hash.replace(/^#\/?/, '');
      if (next && (TABS as readonly string[]).includes(next)) {
        setActiveTab(next as TabId);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('popstate', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('popstate', onHashChange);
    };
  }, [setActiveTab]);

  return null;
}

function GlobalShortcuts() {
  const activeTab = useUIStore((s) => s.activeTab);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const setPaletteOpen = useUIStore((s) => s.setPaletteOpen);
  const { t } = useTranslation();

  const next = useCallback(
    (delta: number) => {
      const idx = TABS.indexOf(activeTab);
      if (idx === -1) return;
      const len = TABS.length;
      const target = TABS[(idx + delta + len) % len];
      if (target) setActiveTab(target);
    },
    [activeTab, setActiveTab]
  );

  useShortcuts({
    switchTab: () => next(1),
    switchTabReverse: () => next(-1),
    openService: () => {},
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const modKey = isMac ? e.metaKey : e.ctrlKey;
      if (modKey && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setPaletteOpen(true);
      }
      if (modKey && !e.shiftKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        const diffStore = useDiffPoolStore.getState();
        const multiIds = useNetworkStore.getState().multiSelectIds;
        const captureItems = useNetworkStore.getState().captureItems;
        if (multiIds.length >= 2) {
          const items = multiIds
            .slice(0, 2)
            .map((id) => captureItems.find((c) => c.id === id))
            .filter((x): x is NonNullable<typeof x> => x != null);
          diffStore.openWith(items);
        } else {
          diffStore.setOpen(true);
        }
      }
      // Alt+S：把当前选中的流量复制为 curl 命令（p1-code-generator）
      if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 's') {
        const { selectedId } = useNetworkStore.getState();
        if (!selectedId) return;
        e.preventDefault();
        void (async () => {
          try {
            const cmd = await fetchCaptureCurl(selectedId);
            const ok = await copyToClipboard(cmd);
            if (ok) toast.success(t('network.context.copyCurl'));
            else toast.error(t('errors.fetchFailed'));
          } catch {
            toast.error(t('errors.fetchFailed'));
          }
        })();
      }
      if (e.key === 'Escape') {
        setPaletteOpen(false);
        useDiffPoolStore.getState().setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setPaletteOpen, t]);

  useBuiltinCommands();

  return null;
}

export function App() {
  return (
    <PiperUIProvider client={piperClient}>
    <SWRConfig value={{ fetcher: swrFetcher, revalidateOnFocus: false }}>
      <ErrorBoundary>
        <TabUrlSync />
        <GlobalShortcuts />
        <div className="flex h-full flex-col">
          <TopNav />
          <main className="flex-1 overflow-hidden">
            <MainContent />
          </main>
          <StatusBar />
          <LazyAboutDialog />
          <LazySettingsDialogs />
          <GlobalTrustWizard />
          <CommandPalette />
          <BreakpointTemplatesDialog />
        <DiffTool />
        </div>
        <Toaster richColors position="top-right" />
      </ErrorBoundary>
    </SWRConfig>
    </PiperUIProvider>
  );
}
