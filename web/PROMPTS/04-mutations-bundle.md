# Prompt 04：Mutations 集合（Plugins / Values / HTTPS）

> 先读 `biz/webui/htdocs-next/PROMPTS/00-shared-context.md`。

## 背景

新前端 Plugins / Values / HTTPS 三个面板目前只有**只读**展示。这个 prompt 把所有"写"操作补上：禁用、卸载、新建、删除、重命名、HTTP/2 开关。

它们共享同一种模式（`api.post(...).json()` + `mutate()` 刷新 SWR + `toast` 反馈），可以一次性做完。

## 三个模块的范围

### A. Plugins（`src/features/plugins/PluginsPanel.tsx`）

老接口（已确认）：
- `cgi-bin/plugins/disable-plugin`：body `{ name, disabled: 0|1 }`
- `cgi-bin/plugins/disable-all-plugins`：body `{ disabledAllPlugins: 0|1 }`
- `cgi-bin/plugins/uninstall`：body `{ list: ['name1','name2'] }`
- `cgi-bin/plugins/registry-list`、`add-registry`：注册源管理（v2，可选做）

补到 `src/api/plugins.ts`：

```ts
export const disablePlugin = (name: string, disabled: boolean) =>
  api.post('cgi-bin/plugins/disable-plugin', { json: { name, disabled: disabled ? 1 : 0 } }).json<{ec:number}>();

export const uninstallPlugin = (name: string) =>
  api.post('cgi-bin/plugins/uninstall', { json: { list: [name] } }).json<{ec:number}>();

export const disableAllPlugins = (disabled: boolean) =>
  api.post('cgi-bin/plugins/disable-all-plugins', { json: { disabledAllPlugins: disabled ? 1 : 0 } }).json<{ec:number}>();
```

UI：每个插件卡片右上角加一个开关（Radix Switch 或自写）+ 一个"卸载"菜单项（用 Radix DropdownMenu 三点按钮）。顶栏加"禁用所有插件"开关。卸载前用 Radix AlertDialog 二次确认。

### B. Values（`src/features/values/ValuesPanel.tsx`）

老接口：
- `cgi-bin/values/list2`（已用）
- `cgi-bin/values/add`：body `{ name, value, key? }`
- `cgi-bin/values/remove`：body `{ name }`
- `cgi-bin/values/rename`：body `{ name, newName }`
- `cgi-bin/values/recycle/list`、`view`、`remove`：回收站

补 `src/api/values.ts` 的 mutation 函数。

UI：
- 列表顶部加 "新建" 按钮（lucide `Plus`），点击弹 Radix Dialog 输入 name + value，提交后 `mutate()`。
- 列表项右键 / 鼠标悬停显露"重命名"和"删除"按钮。
- 重命名也走对话框；删除走 AlertDialog 二次确认。
- 顶栏加一个 "回收站" 按钮，打开抽屉/对话框列出已删除项，可恢复或彻底删除。

### C. HTTPS（`src/features/https/HttpsPanel.tsx`）

老接口：
- `cgi-bin/https-status`（已用）
- `cgi-bin/intercept-https-connects`（已用）
- `cgi-bin/enable-http2`：body `{ enable }`
- `cgi-bin/get-custom-certs-info`、`get-custom-certs-files`、`certs/upload`、`certs/remove`：自定义证书

补两个区块：
1. **HTTP/2 开关**：和现有的"拦截 HTTPS"开关同样模式。
2. **自定义证书列表**：用 SWR 拉 `cgi-bin/get-custom-certs-info`，列出 hostname + 过期时间，每行删除按钮；底部"上传证书"用 `<input type="file" multiple>` 包成 FormData POST 到 `certs/upload`。

## 通用助手

新建 `src/lib/mutate.ts`：

```ts
import { toast } from 'sonner';
import type { i18n } from 'i18next';

export async function runMutation<T>(
  fn: () => Promise<{ ec: number; em?: string } & T>,
  t: i18n['t'],
  successKey?: string
): Promise<boolean> {
  try {
    const res = await fn();
    if (res.ec === 0) {
      if (successKey) toast.success(t(successKey));
      return true;
    }
    toast.error(res.em ?? t('errors.fetchFailed'));
    return false;
  } catch (e) {
    toast.error(String(e));
    return false;
  }
}
```

让三个模块的 mutation 都走这个，避免每处都写一遍 try/catch。

## i18n key

补到 `en-US.json` / `zh-CN.json`：

```json
{
  "common": {
    "confirmDelete": "Delete \"{{name}}\"?",
    "confirmDeleteDesc": "This action cannot be undone.",
    "saveSuccess": "Saved",
    "deleteSuccess": "Deleted",
    "uploadSuccess": "Uploaded"
  },
  "plugins": {
    "uninstallConfirm": "Uninstall plugin \"{{name}}\"?",
    "registry": "Registry"
  },
  "values": {
    "newDialogTitle": "New Value",
    "renameDialogTitle": "Rename",
    "name": "Name",
    "value": "Value",
    "recycle": "Recycle Bin",
    "restore": "Restore"
  },
  "https": {
    "enableHttp2": "Enable HTTP/2",
    "customCerts": "Custom Certificates",
    "uploadCert": "Upload Certificate",
    "expiresAt": "Expires {{date}}"
  }
}
```

zh-CN 对照填中文。

## 验收

- `pnpm typecheck` `pnpm build` 通过。
- Plugins：能禁用插件（图标灰掉）、卸载（确认后消失）、禁用所有插件。
- Values：能新建、重命名、删除（带确认）；删除后能从回收站恢复。
- HTTPS：HTTP/2 能开关；能上传/删除自定义证书。
- 失败操作（断网、`ec !== 0`）出红色 toast 而不是崩溃。

## 提交

3 个独立 commit，每个 commit 标题单独说明：
- `feat(plugins): 增加禁用/卸载/全局开关`
- `feat(values): 完整 CRUD + 回收站`
- `feat(https): HTTP/2 开关 + 自定义证书管理`
