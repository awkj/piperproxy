# Prompt 03：Network 面板增强（列定制 + Timeline + 右键菜单）

> 先读 `biz/webui/htdocs-next/PROMPTS/00-shared-context.md`。

## 背景

`biz/webui/htdocs-next/src/features/network/` 已有：
- `NetworkPanel.tsx`：1.5s 轮询，连接列表 + 详情。
- `NetworkList.tsx`：`@tanstack/react-virtual` 虚拟列表，固定 7 列。
- `NetworkDetail.tsx`：5 个 tab（Overview / 请求头 / 请求体 / 响应头 / 响应体）。
- `NetworkToolbar.tsx`：暂停/清空/过滤。

老前端有更多功能需要补：列显示/宽度自定义、Timeline tab、右键菜单（Copy URL、Copy as cURL、Replay）。

## 目标

### 1. 列定制 + 持久化

在 `htdocs-next/src/store/network.ts` 加：

```ts
interface ColumnConfig {
  visible: boolean;
  width: number;
}
// columns: Record<columnKey, ColumnConfig>
```

用 `zustand/middleware` 的 `persist`（参考 `src/store/ui.ts`）存 localStorage（key `w-network-columns`）。

`NetworkList.tsx` 改用 store 里的列配置，遍历 `columns` 顺序渲染表头和 cell。表头右键菜单（用 Radix `ContextMenu`，需先 `pnpm add @radix-ui/react-context-menu`）：
- 显示/隐藏每列的勾选项
- 重置默认

列宽支持鼠标拖拽改变（在表头右边缘加一个 4px 的 `cursor-col-resize` 把手 div，listen `mousedown`/`mousemove`/`mouseup` 调 `setColumnWidth`）。

### 2. Timeline tab

`NetworkDetail.tsx` 加第 6 个 tab `'timeline'`。

数据来源：`NetworkItem` 里通常有 `dnsTime`、`requestTime`、`requestEndTime`、`responseTime`、`responseEndTime` 这些时间戳字段——先 `grep -n "Time" biz/webui/htdocs/src/js/detail.js | head -20` 确认确切字段名（也可能在 `item.req.startTime` 等嵌套里）。

渲染一个简单的水平条形图：
- DNS（dnsTime）
- Connect（如果有）
- Request 发送
- Waiting（TTFB）
- Response 接收

每段一行，`<div className="h-4 bg-brand-500" style={{ marginLeft: `${ratio * 100}%`, width: `${duration / total * 100}%` }} />`。

文案 i18n key 加在 `network.detail.timeline.*`。

### 3. 行右键菜单

`NetworkList.tsx` 行外层包一个 Radix `ContextMenu`：

```tsx
<ContextMenu.Root>
  <ContextMenu.Trigger asChild>{rowDiv}</ContextMenu.Trigger>
  <ContextMenu.Portal>
    <ContextMenu.Content className="...tailwind...">
      <ContextMenu.Item onSelect={() => copy(item.url)}>{t('network.context.copyUrl')}</ContextMenu.Item>
      <ContextMenu.Item onSelect={() => copy(toCurl(item))}>{t('network.context.copyCurl')}</ContextMenu.Item>
      <ContextMenu.Item onSelect={() => replayInComposer(item)}>{t('network.context.replay')}</ContextMenu.Item>
    </ContextMenu.Content>
  </ContextMenu.Portal>
</ContextMenu.Root>
```

`toCurl(item)` 写一个工具函数 `htdocs-next/src/lib/curl.ts`：
```ts
export function toCurl(item: NetworkItem): string {
  const parts = ['curl', '-X', item.method ?? 'GET'];
  for (const [k, v] of Object.entries(item.req?.headers ?? {})) {
    parts.push('-H', JSON.stringify(`${k}: ${v}`));
  }
  if (item.req?.body) parts.push('--data-raw', JSON.stringify(item.req.body));
  parts.push(JSON.stringify(item.url));
  return parts.join(' ');
}
```

`replayInComposer(item)`：
- 在 `src/store/composer.ts` 新建 store，存当前要塞进 Composer 的初始值。
- `ComposerPanel.tsx` 在 mount 时读取 store 的 prefill 数据并 `reset(formValues)`，读完清掉。
- `replayInComposer` 写入 store + `useUIStore.getState().setActiveTab('composer')`。

复制成功用 sonner toast：`toast.success(t('common.copied'))`。

## i18n 新 key

补到 `en-US.json` / `zh-CN.json`：
```json
{
  "network": {
    "columns_menu": { "showColumn": "Show column", "reset": "Reset columns" },
    "context": { "copyUrl": "Copy URL", "copyCurl": "Copy as cURL", "replay": "Replay in Composer" },
    "detail": {
      "timeline": "Timeline",
      "timelineLabels": { "dns": "DNS", "connect": "Connect", "request": "Request", "waiting": "Waiting (TTFB)", "response": "Response" }
    }
  }
}
```

## 验收

- `pnpm typecheck` `pnpm build` 通过。
- 列右键能勾掉/恢复列，刷新页面后保留。
- 拖拽表头右边缘能改列宽，刷新后保留。
- Timeline tab 显示彩色条形（即使数据缺失也不崩）。
- 行右键 → Copy URL → 粘贴板有 URL；Copy as cURL → 粘贴板可执行；Replay → 跳到 Composer 且表单已预填。

## 提交

`feat(network): 列定制 + Timeline + 行右键菜单`
