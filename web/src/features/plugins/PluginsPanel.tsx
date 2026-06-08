import useSWR from 'swr';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Download,
  ExternalLink,
  Globe,
  MoreVertical,
  RefreshCw,
  Server,
  Settings,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import {
  disableAllPlugins,
  disablePlugin,
  fetchPlugins,
  PLUGINS_URL,
  uninstallPlugin,
  updateAllPlugins,
  type PluginItem,
} from '@/api/plugins';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { IframeDialog } from '@/components/IframeDialog';
import { runMutation } from '@/lib/mutate';
import { useShortcuts } from '@/lib/use-shortcuts';
import { useInstallErrors } from './use-install-errors';
import { InstallPluginDialog } from './InstallPluginDialog';
import { RegistryDialog } from './RegistryDialog';

const REGISTRY_STORAGE_KEY = 'pluginsRegistry';
const REGISTRY_RE = /^https?:\/\/[^/?]/;

function loadStoredRegistry(): string {
  try {
    const v = localStorage.getItem(REGISTRY_STORAGE_KEY) ?? '';
    return REGISTRY_RE.test(v) ? v : '';
  } catch {
    return '';
  }
}

/**
 * 将插件名转成简单名称（去掉最后一个点前的部分）。
 * 例如：whistle.inspect → inspect
 */
function getSimplePluginName(name: string): string {
  return name.substring(name.lastIndexOf('.') + 1);
}

/**
 * 构造插件 webui / option / rules URL。
 * 格式：plugin.<simpleName>/<path>
 * 若 path 已包含 "plugin." 或 "whistle." 前缀则直接使用。
 */
function buildPluginUrl(moduleName: string, path: string): string {
  if (/^(?:https?:\/\/|data:image\/)/.test(path)) return path;
  const simpleName = getSimplePluginName(moduleName);
  const pluginName = 'plugin.' + simpleName;
  if (
    path.indexOf('whistle.' + simpleName) === 0 ||
    path.indexOf(pluginName) === 0
  ) {
    return path;
  }
  return pluginName + '/' + path;
}

/** 检查插件是否有可更新版本 */
function hasUpdate(p: PluginItem): boolean {
  if (!p.latest || !p.version || p.isProj) return false;
  return p.latest !== p.version;
}

/** iframe 对话框状态 */
interface IframeState {
  open: boolean;
  src: string;
  title: string;
}

const CLOSED_IFRAME: IframeState = { open: false, src: '', title: '' };

export function PluginsPanel() {
  const { t } = useTranslation();
  const { data, isLoading, mutate } = useSWR(PLUGINS_URL, fetchPlugins, {
    refreshInterval: 0,
  });

  const plugins: PluginItem[] = data?.plugins
    ? Object.values(data.plugins)
    : [];
  const disabledMap = data?.disabledPlugins ?? {};
  const allDisabled = !!data?.disabledAllPlugins;

  const [pendingUninstall, setPendingUninstall] = useState<PluginItem | null>(
    null,
  );
  const [installOpen, setInstallOpen] = useState(false);
  const [registryOpen, setRegistryOpen] = useState(false);
  const [registry, setRegistry] = useState<string>(() => loadStoredRegistry());

  // C: iframe 对话框状态
  const [iframeState, setIframeState] = useState<IframeState>(CLOSED_IFRAME);

  // D: 安装错误流
  const installErrors = useInstallErrors();
  const errorNames = Object.keys(installErrors);
  const prevErrorNames = useRef<Set<string>>(new Set());

  // 新出现的错误通过 console.warn 输出（toast 由调用方接入 sonner，此处仅标记）
  useEffect(() => {
    for (const name of errorNames) {
      if (!prevErrorNames.current.has(name)) {
        prevErrorNames.current.add(name);
        console.warn('[piper] plugin install error:', name, installErrors[name]);
      }
    }
  }, [errorNames, installErrors]);

  useEffect(() => {
    try {
      if (registry) localStorage.setItem(REGISTRY_STORAGE_KEY, registry);
      else localStorage.removeItem(REGISTRY_STORAGE_KEY);
    } catch {
      /* ignore quota / private mode */
    }
  }, [registry]);

  const handleTogglePlugin = async (p: PluginItem, nextEnabled: boolean) => {
    const ok = await runMutation(
      () => disablePlugin(p.name, !nextEnabled),
      t,
      'common.saveSuccess',
    );
    if (ok) await mutate();
  };

  const handleToggleAll = async (nextEnabled: boolean) => {
    const ok = await runMutation(
      () => disableAllPlugins(!nextEnabled),
      t,
      'common.saveSuccess',
    );
    if (ok) await mutate();
  };

  const handleUninstall = async () => {
    if (!pendingUninstall) return;
    const target = pendingUninstall;
    setPendingUninstall(null);
    const ok = await runMutation(
      () => uninstallPlugin(target.name),
      t,
      'common.deleteSuccess',
    );
    if (ok) await mutate();
  };

  const handleInstalled = async () => {
    setTimeout(() => {
      void mutate();
    }, 4000);
  };

  // E: 更新所有插件
  const handleUpdateAll = async () => {
    const updatable = plugins.filter(hasUpdate);
    if (updatable.length === 0) {
      // 没有可更新插件
      return;
    }
    const names = updatable.map((p) => {
      const mod = p.moduleName ?? p.name;
      return p.latest ? `${mod}@${p.latest}` : mod;
    });
    const reg = updatable[0].registry ?? registry;
    await runMutation(
      () => updateAllPlugins(names, reg || undefined),
      t,
      'plugins.updateAllSuccess',
    );
    setTimeout(() => {
      void mutate();
    }, 5000);
  };

  // C: 打开插件 webui
  const openPluginUI = (p: PluginItem, path: string, label: string) => {
    const mod = p.moduleName ?? p.name;
    const src = buildPluginUrl(mod, path);
    setIframeState({ open: true, src, title: `${p.name} — ${label}` });
  };

  // 快捷键
  useShortcuts({
    togglePlugins: () => {
      void handleToggleAll(allDisabled);
    },
    openInstallPlugins: () => setInstallOpen(true),
  });

  const updatableCount = plugins.filter(hasUpdate).length;

  return (
    <div className="flex h-full flex-col">
      {/* toolbar */}
      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-3">
        <h2 className="text-sm font-semibold text-neutral-900">
          {t('nav.plugins')}
          {plugins.length > 0 && (
            <span className="ml-2 text-xs font-normal text-neutral-500">
              ({plugins.length})
            </span>
          )}
        </h2>
        <div className="flex items-center gap-3">
          {/* E: 更新所有 */}
          {updatableCount > 0 && (
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleUpdateAll}
              title={t('plugins.updateAll')}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t('plugins.updateAll')}
              <span className="ml-1 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {updatableCount}
              </span>
            </Button>
          )}

          <button
            type="button"
            onClick={() => setRegistryOpen(true)}
            title={t('plugins.manageRegistry')}
            className="flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-50"
          >
            <Server className="h-3.5 w-3.5" />
            <span className="max-w-[160px] truncate font-mono">
              {registry || t('plugins.registryDefault')}
            </span>
          </button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setInstallOpen(true)}
          >
            <Download className="h-3.5 w-3.5" />
            {t('plugins.install')}
          </Button>
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <span>{t('plugins.disableAll')}</span>
            <Switch
              checked={allDisabled}
              onCheckedChange={(checked) => handleToggleAll(!checked)}
              aria-label={t('plugins.disableAll')}
            />
          </label>
        </div>
      </div>

      {/* grid */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-neutral-400">
            {t('common.loading')}
          </div>
        ) : plugins.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-neutral-400">
            {t('plugins.noPlugins')}
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {plugins.map((p) => {
              const enabled = !disabledMap[p.name];
              const hasErr = !!installErrors[p.name];
              const isUpdatable = hasUpdate(p);
              return (
                <li
                  key={p.name}
                  className={
                    'rounded-lg border bg-white p-3 shadow-sm ' +
                    (hasErr
                      ? 'border-red-300 ring-1 ring-red-200'
                      : 'border-neutral-200')
                  }
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h3
                      className={
                        'truncate font-medium ' +
                        (enabled ? 'text-neutral-900' : 'text-neutral-400')
                      }
                    >
                      {/* D: 错误标记 */}
                      {hasErr && (
                        <TriangleAlert
                          className="mr-1 inline h-3.5 w-3.5 text-red-500"
                          aria-label={t('plugins.installError', { name: p.name })}
                        />
                      )}
                      {p.name}
                    </h3>
                    <div className="flex shrink-0 items-center gap-2">
                      {p.version && (
                        <span
                          className={
                            'text-xs ' +
                            (isUpdatable
                              ? 'font-semibold text-brand-600'
                              : 'text-neutral-500')
                          }
                          title={
                            isUpdatable ? `latest: ${p.latest ?? ''}` : undefined
                          }
                        >
                          v{p.version}
                          {isUpdatable && (
                            <span className="ml-1 text-[10px]">
                              → {p.latest}
                            </span>
                          )}
                        </span>
                      )}
                      <Switch
                        checked={enabled}
                        onCheckedChange={(checked) =>
                          handleTogglePlugin(p, checked)
                        }
                        aria-label={t('plugins.toggleEnabled')}
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          aria-label={t('plugins.menu')}
                          className="rounded p-1 text-neutral-500 hover:bg-neutral-100"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {/* C: webui 入口 */}
                          {p.webui && (
                            <DropdownMenuItem
                              onSelect={() =>
                                openPluginUI(p, p.webui!, t('plugins.openUI'))
                              }
                            >
                              <Globe className="h-4 w-4" />
                              {t('plugins.openUI')}
                            </DropdownMenuItem>
                          )}
                          {p.option && (
                            <DropdownMenuItem
                              onSelect={() =>
                                openPluginUI(
                                  p,
                                  p.option!,
                                  t('plugins.openOption'),
                                )
                              }
                            >
                              <Settings className="h-4 w-4" />
                              {t('plugins.openOption')}
                            </DropdownMenuItem>
                          )}
                          {p.rulesUrl && (
                            <DropdownMenuItem
                              onSelect={() =>
                                openPluginUI(
                                  p,
                                  p.rulesUrl!,
                                  t('plugins.openRules'),
                                )
                              }
                            >
                              <ExternalLink className="h-4 w-4" />
                              {t('plugins.openRules')}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onSelect={(e) => {
                              e.preventDefault();
                              setPendingUninstall(p);
                            }}
                            className="text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                            {t('plugins.uninstall')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* D: 错误消息 */}
                  {hasErr && (
                    <p className="mt-1 text-xs text-red-600">
                      {installErrors[p.name]}
                    </p>
                  )}

                  {p.description && !hasErr && (
                    <p className="mt-1 line-clamp-2 text-xs text-neutral-600">
                      {p.description}
                    </p>
                  )}

                  {/* C: webui / option 快捷按钮 */}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.webui && (
                      <button
                        type="button"
                        onClick={() =>
                          openPluginUI(p, p.webui!, t('plugins.openUI'))
                        }
                        className="inline-flex items-center gap-1 rounded border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs text-brand-700 hover:bg-brand-100"
                      >
                        <Globe className="h-3 w-3" />
                        {t('plugins.openUI')}
                      </button>
                    )}
                    {p.option && (
                      <button
                        type="button"
                        onClick={() =>
                          openPluginUI(p, p.option!, t('plugins.openOption'))
                        }
                        className="inline-flex items-center gap-1 rounded border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-100"
                      >
                        <Settings className="h-3 w-3" />
                        {t('plugins.openOption')}
                      </button>
                    )}
                    {p.homepage && (
                      <a
                        href={p.homepage}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {t('plugins.homepage')}
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* uninstall confirm */}
      <AlertDialog
        open={pendingUninstall !== null}
        onOpenChange={(open) => {
          if (!open) setPendingUninstall(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('plugins.uninstallConfirm', {
                name: pendingUninstall?.name ?? '',
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('plugins.uninstallConfirmDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleUninstall}>
              {t('plugins.uninstall')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* C: 插件 webui / option / rules iframe 对话框 */}
      <IframeDialog
        open={iframeState.open}
        onClose={() => setIframeState(CLOSED_IFRAME)}
        src={iframeState.src}
        title={iframeState.title}
      />

      {installOpen && (
        <InstallPluginDialog
          registry={registry}
          onClose={() => setInstallOpen(false)}
          onInstalled={handleInstalled}
        />
      )}

      {registryOpen && (
        <RegistryDialog
          current={registry}
          onClose={() => setRegistryOpen(false)}
          onPick={(r) => setRegistry(r)}
        />
      )}
    </div>
  );
}
