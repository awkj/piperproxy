# Prompt 07：Bundle 代码分包

> 先读 `biz/webui/htdocs-next/PROMPTS/00-shared-context.md`。

## 背景

`pnpm build` 输出单 bundle **1.21 MB / 394 KB gzip**，构建警告超过 500 KB。CodeMirror 6（含 5 种语言）+ react-virtual + radix-ui 多个原语 + react-hook-form + zod 等都打到一个 chunk。

每个顶层 tab（Network / Rules / Values / Plugins / Composer / Frames / HTTPS）只在被点开时才需要其代码。改成按 tab 懒加载即可：初始 bundle 落到 ~200 KB gzip，tab 切到时才下载该 panel 的 chunk。

## 目标

1. `src/App.tsx` 把 `TAB_PANEL` 里的 6 个 panel 改成 `React.lazy(() => import(...))`。
2. `MainContent` 用 `<Suspense fallback={<TabFallback />}>` 包起来。
3. About 对话框（`features/about/AboutDialog`）也走 lazy（用户大概率不会立刻打开）。
4. CodeMirror 语言包（`@codemirror/lang-*`）当前在 `src/components/CodeView.tsx` 里 top-level import——拆成 dynamic import：进 CodeView 后按 language 动态加载对应 lang 包。这样 Network / Rules 都依赖 CodeView 但 lang 包只在第一次用到时下载。
5. 验证产物：rolldown 应自动出多个 chunk，初始 chunk gzip 应 < 250 KB，每个 panel chunk gzip 在 30-100 KB 之间。

## 实现要点

### App.tsx

```tsx
import { lazy, Suspense } from 'react';
const NetworkPanel = lazy(() => import('@/features/network/NetworkPanel').then(m => ({ default: m.NetworkPanel })));
// ... 其它 5 个
const AboutDialog = lazy(() => import('@/features/about/AboutDialog').then(m => ({ default: m.AboutDialog })));

const TAB_PANEL = { network: NetworkPanel, /* ... */ } as const;

function TabFallback() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-neutral-400">
      {/* i18n key common.loading */}
    </div>
  );
}

// MainContent 内：
<Suspense fallback={<TabFallback />}>
  <Panel />
</Suspense>
```

### CodeView.tsx

把 `EXT_MAP` 改成 `Promise<Extension>` 返回：

```ts
const EXT_LOADER: Record<CodeLang, () => Promise<Extension | undefined>> = {
  json: () => import('@codemirror/lang-json').then(m => m.json()),
  html: () => import('@codemirror/lang-html').then(m => m.html()),
  // ...
  whistle: () => import('@/lib/cm-whistle').then(m => m.whistleLang),
  text: () => Promise.resolve(undefined),
};
```

组件内部：

```tsx
const [extensions, setExtensions] = useState<Extension[]>([]);
useEffect(() => {
  let cancelled = false;
  EXT_LOADER[language]?.().then(ext => {
    if (!cancelled && ext) setExtensions([ext]);
    else if (!cancelled) setExtensions([]);
  });
  return () => { cancelled = true; };
}, [language]);
```

加载中先显示空白 / Skeleton，CM 在 ext 到达后再渲染（用 key 强制 remount，或直接挂到 `<CodeMirror extensions={extensions} ...>`，CM 会响应 props 变化）。

## 不要做

- 不要碰 `features/rules/`（Agent 06 正在改）
- 不要改 i18n key（`common.loading` 已经存在）
- 不要改其它 panel 的代码（如果 lazy 包装暴露了某个组件没默认导出，加一个适配层即可）

## 验证

```sh
cd biz/webui/htdocs-next
./node_modules/.bin/tsc -b --noEmit         # 干净
./node_modules/.bin/vite build               # 通过
ls -lh dist/assets/                          # 应该看到 6+ 个 js chunk，初始 chunk 明显变小
```

手动验证：
- `pnpm dev` 启动，开浏览器 Network 面板（DevTools 那个），刷新页面：初始 JS 请求应只下载入口 chunk，切到 Rules tab 时再下载 rules 相关 chunk。

## 提交

`perf(htdocs-next): tab 与 CodeMirror 语言包按需懒加载`

输出：commit hash + 初始 chunk gzip 大小 + 每个 panel chunk 估算大小，150 字内。
