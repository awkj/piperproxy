# 共享上下文（每个子 session 都先读这个）

## 项目快览

- 仓库：`/Users/doctor/Developer/personal/app/whistle`，Whistle 是 Node.js 写的 HTTP/HTTPS/HTTP2/WS 调试代理。
- 老前端：`biz/webui/htdocs/`，React 15 + webpack 1 + jQuery + Bootstrap 3，36k 行硬编码英文。
- **新前端（你工作的地方）**：`biz/webui/htdocs-next/`，已有完整骨架。
- 后端 CGI：`biz/webui/cgi-bin/`，新前端通过 ky/SWR 调用，**接口契约不可改**。
- 老前端继续保留，新前端通过 `W2_NEXT_UI=1` 环境变量灰度（见 prompt 01）。

## 新前端栈（已就位）

| 类别 | 选型 |
|---|---|
| 构建 | Vite 8（`pnpm build` ≈ 300ms） |
| 包管理 | **pnpm 11**（**严禁** npm/yarn） |
| 框架 | React 19 + TypeScript 5（strict） |
| 样式 | **Tailwind v4**（严格 v4 语法，`@import "tailwindcss";`，**禁用 v3 写法**） |
| 组件原语 | Radix UI + 自写 shadcn 风格（`src/components/ui/`） |
| 图标 | `lucide-react` |
| HTTP | `ky`（`src/api/client.ts`） |
| 数据获取 | **SWR**（**不要 TanStack Query**） |
| 状态 | Zustand（`src/store/`） |
| i18n | `react-i18next`，资源在 `src/i18n/locales/{en-US,zh-CN}.json` |
| 编辑器 | CodeMirror 6 via `@uiw/react-codemirror`（封装：`src/components/CodeView.tsx`） |
| 表单 | react-hook-form + zod 3（**zod 4 与 hookform 不兼容**） |
| 通知 | sonner（`toast.success/error`） |

## 强制约定

1. **任何可见字符串必须走 `t('namespace.key')`**——`placeholder`、`title`、`aria-label`、`alt` 都要。
2. 新增文案 → 同时在 `en-US.json` 和 `zh-CN.json` 加 key（值可以先填英文）。
3. 服务端数据用 SWR；本地 UI 状态用 Zustand；表单单值用 `useState`。
4. CodeMirror 显示代码统一用 `<CodeView>`；不要直接用 `@uiw/react-codemirror`。
5. 全程使用 **简体中文** 和我交流（这是用户的全局偏好）。

## 隔离须知（关键，pnpm v11 坑）

在 `htdocs-next/` 跑 `pnpm install` 之前：

```sh
# 1. 确保父仓没有 pnpm-workspace.yaml
ls /Users/doctor/Developer/personal/app/whistle/pnpm-workspace.yaml 2>/dev/null && \
  rm /Users/doctor/Developer/personal/app/whistle/pnpm-workspace.yaml

# 2. 子项目根的 .npmrc 已写好（ignore-workspace=true）
cat /Users/doctor/Developer/personal/app/whistle/biz/webui/htdocs-next/.npmrc

# 3. 跑完 install 立刻验证父仓未污染
ls /Users/doctor/Developer/personal/app/whistle/node_modules/.ignored 2>/dev/null \
  && echo "FATAL: parent contaminated" || echo "OK"
```

如果 `.ignored` 出现，恢复：`cd ../../.. && rm -rf node_modules/.ignored && rm -f pnpm-workspace.yaml`。

## 验收（每个 prompt 通用）

```sh
cd biz/webui/htdocs-next
pnpm typecheck   # 必须干净
pnpm build       # 必须通过
```

UI 行为验证：

```sh
# 终端 1：跑后端（默认 8899）
cd /Users/doctor/Developer/personal/app/whistle && npm run start

# 终端 2：跑新前端
cd biz/webui/htdocs-next && pnpm dev
# 浏览器打开 http://localhost:5173 验证
```

## 提交规范

- 单个 prompt 完成后提交一个 commit，message 用中文，简洁说明改了什么。
- **不要**碰 `biz/webui/htdocs/`（老前端）、`lib/`、`bin/`、`biz/webui/cgi-bin/`。
- **不要**改 `package.json` 根的（whistle 主仓的），只动 `htdocs-next/package.json`。

## 现状文件结构（已有）

```
biz/webui/htdocs-next/
├── src/
│   ├── api/         # client.ts, version.ts, network.ts, rules.ts, composer.ts, plugins.ts, values.ts, https.ts
│   ├── components/  # ui/{button,dialog}, TopNav, ErrorBoundary, GitHubIcon, LanguageSwitcher, CodeView
│   ├── features/
│   │   ├── about/AboutDialog.tsx
│   │   ├── network/{NetworkPanel,NetworkList,NetworkDetail,NetworkToolbar}.tsx
│   │   ├── rules/RulesPanel.tsx
│   │   ├── composer/ComposerPanel.tsx
│   │   ├── plugins/PluginsPanel.tsx
│   │   ├── values/ValuesPanel.tsx
│   │   ├── https/HttpsPanel.tsx
│   │   └── placeholder/Placeholder.tsx
│   ├── i18n/{index.ts,locales/{en-US,zh-CN}.json}
│   ├── store/{ui,network}.ts
│   ├── lib/cn.ts
│   ├── styles/index.css
│   ├── App.tsx
│   └── main.tsx
├── public/img/{whistle.png,favicon.ico}
├── MIGRATION-PLAN.md   # 看这里了解全貌
├── PROMPTS/            # 你正在读这里
└── ...
```
