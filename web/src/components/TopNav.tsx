import { useState } from 'react';
import useSWR from 'swr';
import { useTranslation } from 'react-i18next';
import { INIT_URL, type InitInfo } from '@/features/footer/api';
import type { NetworkInterfacesResponse } from '@/api/types.gen';
import {
  Activity,
  ChevronDown,
  CircleHelp,
  FolderOpen,
  Info,
  LayoutGrid,
  List,
  Lock,
  Pause,
  Play,
  Puzzle,
  Radio,
  Send,
  Server,
  Settings,
  Smartphone,
  Terminal,
  Trash2,
  Wrench,
} from 'lucide-react';
import { TABS, useUIStore, type TabId } from '@/store/ui';
import { useNetworkStore } from '@/store/network';
import { cn } from '@/lib/cn';
import { LanguageSwitcher } from './LanguageSwitcher';
import { GitHubIcon } from './GitHubIcon';
import { QrcodeDialog } from './dialogs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { ToolbarButton, ToolbarGroup, toolbarIconCls } from './ui/toolbar';
import { ServiceDialog } from '@/features/service';
import { ToolsDrawer } from '@/features/tools';
import { SUPPORTED_LOCALES } from '@/i18n';

const TAB_ICON: Record<TabId, typeof Activity> = {
  network: Activity,
  rules: List,
  values: FolderOpen,
  plugins: Puzzle,
  composer: Send,
  frames: Radio,
  https: Lock,
  console: Terminal,
  setup: LayoutGrid,
};

// 顶栏统一尺寸：sm（h-7），让 Tab 按钮 / 暂停 / 语言下拉 / 设置图标全部对齐。
const TOP_NAV_SIZE = 'sm' as const;
const TOP_ICON = toolbarIconCls(TOP_NAV_SIZE);

function PauseToggle() {
  const { t } = useTranslation();
  const paused = useNetworkStore((s) => s.paused);
  const togglePaused = useNetworkStore((s) => s.togglePaused);
  return (
    <ToolbarButton
      onClick={togglePaused}
      title={paused ? t('network.resume') : t('network.pause')}
      tone={paused ? 'warning' : 'default'}
    >
      {paused ? <Play className={TOP_ICON} /> : <Pause className={TOP_ICON} />}
      <span>{paused ? t('network.resume') : t('network.pause')}</span>
    </ToolbarButton>
  );
}

function ClearButton() {
  const { t } = useTranslation();
  const clearCaptureItems = useNetworkStore((s) => s.clearCaptureItems);
  const resetRemoved = useNetworkStore((s) => s.resetRemoved);
  const clearMultiSelect = useNetworkStore((s) => s.clearMultiSelect);
  return (
    <ToolbarButton
      onClick={() => {
        clearCaptureItems();
        resetRemoved();
        clearMultiSelect();
      }}
      title={t('network.clear')}
      aria-label={t('network.clear')}
    >
      <Trash2 className={TOP_ICON} />
      <span>{t('network.clear')}</span>
    </ToolbarButton>
  );
}

// 顶栏的「监听在 ...」徽标：取后端返回的网卡列表，优先选第一个 LAN IPv4。
// 如果暂未拿到（或全是 loopback），回落到 init.proxyAddr 或 localhost。
function ListeningBadge() {
  const { t } = useTranslation();
  const { data: init, error: initErr, isLoading: initLoading } =
    useSWR<InitInfo>(INIT_URL, { refreshInterval: 30000, revalidateOnFocus: false });
  const { data: ifaces } = useSWR<NetworkInterfacesResponse>(
    'api/network/interfaces',
    { revalidateOnFocus: false }
  );
  const online = !initErr && !initLoading && !!init;

  // 显示 host:port —— 优先 LAN IPv4，否则用 proxyAddr 中的 host，否则 localhost
  const port =
    ifaces?.proxyPort ??
    (init?.proxyAddr ? Number(init.proxyAddr.split(':').pop() || 0) : 0);
  const lanIp = ifaces?.interfaces?.find((x) => x.kind === 'lan')?.ip;
  const fallbackHost =
    init?.proxyAddr && !init.proxyAddr.startsWith(':')
      ? init.proxyAddr.split(':')[0]?.replace(/^0\.0\.0\.0$/, 'localhost')
      : 'localhost';
  const host = lanIp || fallbackHost;
  const display = port ? `${host}:${port}` : host;

  return (
    <div
      className={cn(
        'mx-2 inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[12px]',
        online
          ? 'border-emerald-200 bg-emerald-50/60 text-emerald-700'
          : 'border-red-200 bg-red-50/60 text-red-700'
      )}
      title={`${init?.server?.hostname ?? ''} → ${init?.proxyAddr ?? ''}`}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          online ? 'bg-emerald-500' : 'bg-red-500',
          online && 'animate-pulse'
        )}
      />
      <span className="font-semibold text-neutral-700">Piper</span>
      <span className="text-neutral-300">|</span>
      <span className="text-neutral-500">{t('nav.listening')}:</span>
      <span className="font-mono tabular-nums">{display}</span>
    </div>
  );
}

function LanguageButton() {
  const { i18n } = useTranslation();
  const current = i18n.resolvedLanguage ?? 'zh-CN';
  const labels: Record<string, string> = {
    'en-US': 'English',
    'zh-CN': '简体中文',
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ToolbarButton
          tone="soft"
          title="Language"
          className="data-[state=open]:bg-neutral-200"
        >
          <span>{labels[current] ?? current}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </ToolbarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {SUPPORTED_LOCALES.map((lng) => (
          <DropdownMenuItem
            key={lng}
            onSelect={() => void i18n.changeLanguage(lng)}
            className={cn(lng === current && 'font-semibold text-brand-600')}
          >
            {labels[lng] ?? lng}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TopNav() {
  const { t } = useTranslation();
  const activeTab = useUIStore((s) => s.activeTab);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const setAboutOpen = useUIStore((s) => s.setAboutOpen);
  const setServiceOpen = useUIStore((s) => s.setServiceOpen);
  const setToolsOpen = useUIStore((s) => s.setToolsOpen);
  const setNetworkSettingsOpen = useUIStore((s) => s.setNetworkSettingsOpen);
  const openEditorSettings = useUIStore((s) => s.openEditorSettings);
  const setShortcutsSettingsOpen = useUIStore(
    (s) => s.setShortcutsSettingsOpen
  );
  const setSyncDialogOpen = useUIStore((s) => s.setSyncDialogOpen);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileUrl =
    typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.host}`
      : '';

  return (
    <header className="flex items-center gap-1 border-b border-neutral-200 bg-neutral-50 px-3 py-1 text-xs">
      <img alt="piper" src="/img/piper-logo.svg" className="mr-2 h-5 w-5" />

      <ToolbarGroup size={TOP_NAV_SIZE}>
        {TABS.map((tab) => {
          const Icon = TAB_ICON[tab];
          const selected = activeTab === tab;
          return (
            <ToolbarButton
              key={tab}
              onClick={() => setActiveTab(tab)}
              tone={selected ? 'info' : 'ghost'}
              active={selected}
            >
              <Icon className={TOP_ICON} />
              {t(`nav.${tab}`)}
            </ToolbarButton>
          );
        })}
      </ToolbarGroup>

      <ListeningBadge />

      {activeTab === 'network' && (
        <ToolbarGroup size={TOP_NAV_SIZE}>
          <ClearButton />
          <PauseToggle />
        </ToolbarGroup>
      )}

      <ToolbarGroup size={TOP_NAV_SIZE} className="ml-auto">
        <LanguageButton />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ToolbarButton tone="soft" iconOnly aria-label={t('nav.settings')}>
              <Settings className={TOP_ICON} />
            </ToolbarButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[200px]">
            <DropdownMenuItem onSelect={() => setServiceOpen(true)}>
              <Server className="h-4 w-4" />
              {t('service.menuItem')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setNetworkSettingsOpen(true)}>
              <Settings className="h-4 w-4" />
              {t('settings.menu.network')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openEditorSettings('rules')}>
              <List className="h-4 w-4" />
              {t('settings.menu.editorRules')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openEditorSettings('values')}>
              <FolderOpen className="h-4 w-4" />
              {t('settings.menu.editorValues')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setShortcutsSettingsOpen(true)}>
              {t('settings.menu.shortcuts')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setSyncDialogOpen(true)}>
              {t('settings.menu.sync')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setMobileOpen(true)}>
              <Smartphone className="h-4 w-4" />
              {t('nav.mobileConnect')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setToolsOpen(true)}>
              <Wrench className="h-4 w-4" />
              {t('tools.menuItem')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => window.open('https://wproxy.org/', '_blank')}>
              <CircleHelp className="h-4 w-4" />
              {t('nav.help')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => window.open('https://github.com/avwo/whistle', '_blank')}
            >
              <GitHubIcon className="h-4 w-4" />
              {t('nav.github')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setAboutOpen(true)}>
              <Info className="h-4 w-4" />
              {t('about.menu')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ToolbarGroup>
      <QrcodeDialog
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        value={mobileUrl}
        title={t('nav.mobileConnect')}
      />
      <ServiceDialog />
      <ToolsDrawer />
    </header>
  );
}

// 旧的 LanguageSwitcher（select 实现）保留导出以兼容其它入口
export { LanguageSwitcher };
