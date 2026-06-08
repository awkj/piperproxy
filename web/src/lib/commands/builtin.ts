import { useEffect } from 'react';
import { toast } from 'sonner';
import { useCommandRegistry } from './registry';
import type { Command } from './types';
import { useNetworkStore } from '@/store/network';
import { useUIStore } from '@/store/ui';
import { useDiffPoolStore } from '@/store/diffPool';
import { useWorkingSessionStore } from '@/store/workingSession';
import { useSearchFiltersStore } from '@/store/searchFilters';
import { setThrottle } from '@/api/throttle';
import { fetchCaptureCurl } from '@/api/network';
import { copyToClipboard } from '@/lib/curl';
import i18n from '@/i18n';

export function useBuiltinCommands() {
  const registerMany = useCommandRegistry((s) => s.registerMany);
  const unregisterMany = useCommandRegistry((s) => s.unregisterMany);

  useEffect(() => {
    const networkStore = useNetworkStore.getState;
    const uiStore = useUIStore.getState;
    const wsStore = useWorkingSessionStore.getState;
    const sfStore = useSearchFiltersStore.getState;

    const cmds: Command[] = [
      {
        id: 'session.toggleTurbo',
        labelKey: 'palette.cmd.toggleTurbo',
        category: 'session',
        keywords: ['turbo', 'performance', 'fast', '极速', '性能'],
        run: () => {
          const { turboMode, setTurboMode } = networkStore();
          setTurboMode(!turboMode);
        },
      },
      {
        id: 'session.toggleWorkingFilter',
        labelKey: 'palette.cmd.toggleWorkingFilter',
        category: 'session',
        keywords: ['pin', 'pinned', 'working session', 'filter', '钉住', '过滤'],
        run: () => wsStore().toggleFilter(),
      },
      {
        id: 'session.unpinAll',
        labelKey: 'palette.cmd.unpinAll',
        category: 'session',
        keywords: ['unpin', 'clear pinned', '取消钉住', '清空固定'],
        run: () => wsStore().clearPinned(),
      },
      {
        id: 'tool.breakpointTemplates',
        labelKey: 'palette.cmd.breakpointTemplates',
        category: 'tool',
        keywords: ['breakpoint', 'template', 'mock', '断点', '模板'],
        run: () => uiStore().setBreakpointTemplatesOpen(true),
      },
      {
        id: 'tool.openSearchFilter',
        labelKey: 'palette.cmd.openSearchFilter',
        category: 'tool',
        shortcut: 'Ctrl+F',
        keywords: ['search', 'filter', 'multi', 'condition', '搜索', '过滤', '条件'],
        run: () => sfStore().setOpen(true),
      },
      {
        id: 'session.toggleRecording',
        labelKey: 'palette.cmd.toggleRecording',
        category: 'session',
        keywords: ['pause', 'resume', 'recording', '暂停', '继续', '录制'],
        run: () => networkStore().togglePaused(),
      },
      {
        id: 'session.clear',
        labelKey: 'palette.cmd.clearCapture',
        category: 'session',
        shortcut: 'Ctrl/Cmd+X',
        keywords: ['clear', 'reset', '清空', '清除'],
        run: () => networkStore().clearCaptureItems(),
      },
      {
        id: 'session.importHar',
        labelKey: 'palette.cmd.importHar',
        category: 'session',
        keywords: ['import', 'har', '导入'],
        run: () => {
          uiStore().setActiveTab('network');
        },
      },
      {
        id: 'view.tabNetwork',
        labelKey: 'palette.cmd.tabNetwork',
        category: 'view',
        keywords: ['network', 'capture', '抓包', '网络'],
        run: () => uiStore().setActiveTab('network'),
      },
      {
        id: 'view.tabRules',
        labelKey: 'palette.cmd.tabRules',
        category: 'view',
        keywords: ['rules', '规则'],
        run: () => uiStore().setActiveTab('rules'),
      },
      {
        id: 'view.tabValues',
        labelKey: 'palette.cmd.tabValues',
        category: 'view',
        keywords: ['values', 'value'],
        run: () => uiStore().setActiveTab('values'),
      },
      {
        id: 'view.tabPlugins',
        labelKey: 'palette.cmd.tabPlugins',
        category: 'view',
        keywords: ['plugins', '插件'],
        run: () => uiStore().setActiveTab('plugins'),
      },
      {
        id: 'view.tabComposer',
        labelKey: 'palette.cmd.tabComposer',
        category: 'view',
        keywords: ['composer', 'request', '请求'],
        run: () => uiStore().setActiveTab('composer'),
      },
      {
        id: 'view.tabFrames',
        labelKey: 'palette.cmd.tabFrames',
        category: 'view',
        keywords: ['frames', 'websocket', 'ws', 'frame', '帧'],
        run: () => uiStore().setActiveTab('frames'),
      },
      {
        id: 'view.tabHttps',
        labelKey: 'palette.cmd.tabHttps',
        category: 'view',
        keywords: ['https', 'ssl', 'tls', 'cert', '证书'],
        run: () => uiStore().setActiveTab('https'),
      },
      {
        id: 'view.tabConsole',
        labelKey: 'palette.cmd.tabConsole',
        category: 'view',
        keywords: ['console', 'log', '日志', '控制台'],
        run: () => uiStore().setActiveTab('console'),
      },
      {
        id: 'view.tabSetup',
        labelKey: 'palette.cmd.tabSetup',
        category: 'view',
        keywords: ['setup', 'hub', 'install', '集成', '安装'],
        run: () => uiStore().setActiveTab('setup'),
      },
      {
        id: 'tool.installCa',
        labelKey: 'palette.cmd.installCa',
        category: 'tool',
        keywords: ['ca', 'cert', 'certificate', 'trust', 'wizard', '证书', '安装', '信任', '引导'],
        run: () => {
          uiStore().setActiveTab('https');
          uiStore().setTrustWizardOpen(true);
        },
      },
      {
        id: 'tool.openTools',
        labelKey: 'palette.cmd.openTools',
        category: 'tool',
        keywords: ['tools', 'toolbox', '工具'],
        run: () => uiStore().setToolsOpen(true),
      },
      {
        id: 'setting.networkSettings',
        labelKey: 'palette.cmd.networkSettings',
        category: 'setting',
        keywords: ['network', 'settings', '抓包设置', '网络设置'],
        run: () => uiStore().setNetworkSettingsOpen(true),
      },
      {
        id: 'setting.shortcuts',
        labelKey: 'palette.cmd.shortcuts',
        category: 'setting',
        keywords: ['shortcuts', 'hotkey', 'keybind', '快捷键'],
        run: () => uiStore().setShortcutsSettingsOpen(true),
      },
      {
        id: 'setting.sync',
        labelKey: 'palette.cmd.sync',
        category: 'setting',
        keywords: ['sync', '同步'],
        run: () => uiStore().setSyncDialogOpen(true),
      },
      {
        id: 'setting.service',
        labelKey: 'palette.cmd.service',
        category: 'setting',
        keywords: ['proxy', 'service', 'port', 'system proxy', '系统代理', '端口'],
        run: () => uiStore().setServiceOpen(true),
      },
      {
        id: 'setting.about',
        labelKey: 'palette.cmd.about',
        category: 'setting',
        keywords: ['about', 'version', '关于', '版本'],
        run: () => uiStore().setAboutOpen(true),
      },
      {
        id: 'setting.bypass',
        labelKey: 'palette.cmd.bypass',
        category: 'setting',
        keywords: ['bypass', 'ssl pinning', 'passthrough', '放行', '绕过', '透传'],
        run: () => uiStore().setBypassOpen(true),
      },
      {
        id: 'session.throttleOff',
        labelKey: 'palette.cmd.throttleOff',
        category: 'session',
        keywords: ['throttle', 'off', '弱网', '关闭'],
        run: () => { void setThrottle({ preset: 'off', upBps: 0, downBps: 0, latencyMs: 0 }); },
      },
      {
        id: 'session.throttleOffline',
        labelKey: 'palette.cmd.throttleOffline',
        category: 'session',
        keywords: ['offline', 'throttle', '离线', '弱网'],
        run: () => { void setThrottle({ preset: 'offline', upBps: 0, downBps: 0, latencyMs: 0 }); },
      },
      {
        id: 'session.throttle2G',
        labelKey: 'palette.cmd.throttle2G',
        category: 'session',
        keywords: ['2g', 'gprs', 'throttle', '弱网'],
        run: () => { void setThrottle({ preset: 'gprs', upBps: 0, downBps: 0, latencyMs: 0 }); },
      },
      {
        id: 'session.throttle3G',
        labelKey: 'palette.cmd.throttle3G',
        category: 'session',
        keywords: ['3g', 'throttle', '弱网'],
        run: () => { void setThrottle({ preset: '3g', upBps: 0, downBps: 0, latencyMs: 0 }); },
      },
      {
        id: 'session.throttle4G',
        labelKey: 'palette.cmd.throttle4G',
        category: 'session',
        keywords: ['4g', 'lte', 'throttle', '弱网'],
        run: () => { void setThrottle({ preset: '4g', upBps: 0, downBps: 0, latencyMs: 0 }); },
      },
      {
        id: 'rule.newGroup',
        labelKey: 'palette.cmd.newRuleGroup',
        category: 'rule',
        keywords: ['rule', 'group', 'new', '规则', '分组', '新建'],
        run: () => {
          uiStore().setActiveTab('rules');
        },
      },
      {
        id: 'rule.enableAll',
        labelKey: 'palette.cmd.enableAllRules',
        category: 'rule',
        keywords: ['enable', 'all', 'rules', '启用', '规则'],
        run: () => {
          uiStore().setActiveTab('rules');
        },
      },
      {
        id: 'doc.whistleDocs',
        labelKey: 'palette.cmd.whistleDocs',
        category: 'doc',
        keywords: ['docs', 'documentation', 'whistle', '文档'],
        run: () => {
          window.open('https://wproxy.org/whistle/', '_blank');
        },
      },
      {
        id: 'doc.github',
        labelKey: 'palette.cmd.github',
        category: 'doc',
        keywords: ['github', 'source', 'repo', '源码'],
        run: () => {
          window.open('https://github.com/awkj/piper', '_blank');
        },
      },
      {
        id: 'view.openSetupHub',
        labelKey: 'palette.cmd.openSetupHub',
        category: 'view',
        keywords: ['setup hub', 'setup', 'developer', '集成中心', '开发者'],
        run: () => uiStore().setActiveTab('setup'),
      },
      {
        id: 'tool.copyCurl',
        labelKey: 'palette.cmd.copyCurl',
        category: 'tool',
        shortcut: 'Alt+S',
        keywords: ['curl', 'copy', 'export', '复制', 'cURL'],
        run: () => {
          const { selectedId } = networkStore();
          if (!selectedId) {
            toast.error(i18n.t('network.context.copyCurl') + ': ' + i18n.t('common.empty'));
            return;
          }
          void (async () => {
            try {
              const cmd = await fetchCaptureCurl(selectedId);
              const ok = await copyToClipboard(cmd);
              if (ok) toast.success(i18n.t('common.copied'));
              else toast.error(i18n.t('errors.fetchFailed'));
            } catch {
              toast.error(i18n.t('errors.fetchFailed'));
            }
          })();
        },
      },
      {
        id: 'tool.diffFlows',
        labelKey: 'palette.cmd.diffFlows',
        category: 'tool',
        shortcut: 'Ctrl/Cmd+Y',
        keywords: ['diff', 'compare', '对比', '差异', 'flow'],
        run: () => {
          const diffStore = useDiffPoolStore.getState();
          const multiIds = networkStore().multiSelectIds;
          const captureItems = networkStore().captureItems;
          if (multiIds.length >= 2) {
            const items = multiIds
              .slice(0, 2)
              .map((id) => captureItems.find((c) => c.id === id))
              .filter((x): x is NonNullable<typeof x> => x != null);
            diffStore.openWith(items);
          } else {
            diffStore.setOpen(true);
          }
        },
      },
    ];

    const ids = cmds.map((c) => c.id);
    registerMany(cmds);
    return () => unregisterMany(ids);
  }, [registerMany, unregisterMany]);
}
