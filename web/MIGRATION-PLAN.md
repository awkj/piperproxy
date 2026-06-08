# piper Web UI 迁移计划

> **2026-06-06 校准版**。
>
> - 顶层布局已变更：`apps/webui/` 已 `git mv` 到 `web/`；文档路径全部按 `web/` 计。
> - 后端方向已切换为 [Go 重写](../docs/GO-REWRITE-PLAN.md)；本前端工作**独立于后端进程推进**，Go 后端要求 UI HTTP API 协议兼容（GO-5 切 base URL 即可，前端零改动）。
> - 老的"W2_NEXT_UI 灰度开关 / `apps/proxy/htdocs.js` 双 ROOT"方案**已废止**——`apps/proxy/` 整段处于归档区，前端不再需要嵌入老 whistle ROOT；开发态走 vite dev server，生产态等 Go 后端 GO-5 出来时再决定如何分发静态资源。
>
> 目标：把 whistle 时代的 React 15 + webpack 1 + jQuery + Bootstrap 3 老栈，重写为 Vite + React 19 + TypeScript + Tailwind v4 + shadcn 风格组件 + i18next + Zustand + SWR + ky 的现代栈。

---

## 1. 整体策略

- **像素级 1:1 复刻在前，重设计在后**。第一阶段不做视觉改造，先用 Tailwind 还原老界面，便于回归对比；第二阶段再迭代视觉/可访问性/暗色模式。
- **后端契约不变**。老 `cgi-bin/*` HTTP 接口形状即事实 API，前端只消费、不改造。Go 重写 GO-5 阶段要按这个形状对齐。
- **每切完一块就能跑、能对比**。按对话框/页面切片，单点替换。

---

## 2. 目录结构（已落地）

```
web/                              ← 顶层独立目录（原 apps/webui/）
├── package.json                  # @piper/webui，独立依赖
├── vite.config.ts                # 端口 5173，/cgi-bin 代理到 127.0.0.1:8899
├── tsconfig*.json
├── index.html
├── PROMPTS/                      # ⚠️ 历史 session prompt，路径仍是旧的 biz/webui/htdocs-next
├── src/
│   ├── main.tsx
│   ├── App.tsx                   # 全局 SWRConfig + 顶部栏 + 路由入口
│   ├── styles/index.css          # @import "tailwindcss";
│   ├── i18n/                     # i18next + zh-CN/en-US locales
│   ├── api/                      # ky 实例 + endpoint 类型封装
│   ├── store/                    # Zustand: ui / network / composer / composer-history / frames
│   ├── lib/                      # cn (clsx + tailwind-merge) 等
│   ├── components/ui/            # shadcn 风格原语 (Button / Dialog / ...)
│   └── features/
│       ├── about/                AboutDialog
│       ├── composer/             ComposerPanel + HistorySidebar + BatchSendDialog
│       ├── console/              ConsolePanel + 轮询 + 导出
│       ├── footer/               StatusBar
│       ├── frames/               独立顶层 tab，WS 抓帧 + Sender + Detail
│       ├── https/                HttpsPanel + CertsManager + Cert 上传/详情
│       ├── network/              NetworkPanel + List + Detail + Timeline + 右键菜单 + TreeView
│       ├── placeholder/          通用占位
│       ├── plugins/              PluginsPanel + Install / Registry 对话框
│       ├── rules/                RulesPanel + 自定义高亮 + 新建/重命名分组
│       ├── service/              ServiceDialog
│       ├── settings/             7 个设置对话框 (DNS / Editor / Network / Shortcuts / Sync / Tips)
│       ├── tools/                ToolsDrawer
│       └── values/               ValuesPanel + ImportValuesDialog
```

> 已实现的 feature 模块覆盖原计划的里程碑 0–6 绝大部分；详见第 5 节进度对账。

---

## 3. 技术栈最终选型

| 类别 | 选型 | 备注 |
|---|---|---|
| 构建 | Vite 8 | 冷启动 < 1s，HMR 极快 |
| 包管理 | pnpm |  |
| 框架 | React 19 | 函数组件 + hooks，全面 TS |
| 语言 | TypeScript 5.7 | strict |
| 样式 | Tailwind v4 + `@tailwindcss/vite` | 严格用 v4 语法，CSS-based 配置 |
| 组件原语 | Radix UI + 自写 shadcn 风格封装 | 不引入 shadcn CLI |
| 图标 | lucide-react |  |
| HTTP | ky | fetch 封装，支持重试/超时/钩子 |
| 数据获取 | SWR | 匹配高频轮询场景 |
| 状态管理 | Zustand | 服务端数据走 SWR，本地 UI 状态走 Zustand |
| 国际化 | i18next + react-i18next + browser-languagedetector |  |
| 编辑器 | CodeMirror 6（`@uiw/react-codemirror`） | 含 json / html / xml / js / css 语言包 |
| 工具 | clsx、tailwind-merge、class-variance-authority |  |

> **不引入**：Redux、Bootstrap、jQuery、moment、lodash（按需用原生）。

---

## 4. 开发态运行

```sh
# 1) 起后端（仍是归档区 Node 实现，提供 cgi-bin）
pnpm --filter @piper/proxy dev     # 或仓库根 npm run start，默认 8899

# 2) 起前端
cd web
pnpm dev                           # 5173
```

Vite 已在 `vite.config.ts` 配 `/cgi-bin` 代理到 `127.0.0.1:8899`，前端代码直接 `ky.get('cgi-bin/...')` 即可。

> WebSocket（实时抓包流 / Frame）需要在代理里加 `ws: true`，迁移相关功能时再补。

### 生产态（暂缓）

`pnpm build` 输出 `web/dist/`，但**当前不需要把 dist 接回 `apps/proxy/`**：
- 老 `W2_NEXT_UI` 灰度方案随 `apps/proxy/` 归档而废止
- Go 后端 GO-5 阶段会重新决定 UI 静态资源由谁分发（很可能直接 `server/internal/ui/` 内嵌或独立托管）
- 在那之前，前端只在 dev 模式跑

---

## 5. 进度对账（2026-06-06）

> 已扫过 `web/src/features/` 目录结构得出。✅ 表示模块文件存在；⚠️ 表示文件存在但细节未核（如功能完整度、边缘场景）；⏳ 表示未做。

### 里程碑 0–1 · 脚手架与全局壳 ✅

- [x] Vite / React 19 / TS / Tailwind v4 / i18n / SWR / ky / Zustand 接通
- [x] 顶部菜单栏 + 全局 tab 切换（Zustand persist）
- [x] 错误边界 + sonner Toast
- [x] About 对话框 + 语言切换器

### 里程碑 2 · Network 抓包面板

- [x] `cgi-bin/get-data` 轮询 + 暂停/继续 + 清空
- [x] 虚拟列表（`@tanstack/react-virtual`）
- [x] 状态码颜色编码
- [x] 详情面板：Overview / 请求头 / 请求体 / 响应头 / 响应体
- [x] CodeMirror 6 viewer (`<CodeView>` 按 content-type 选语言)
- [x] 文本过滤（URL / method / 状态码）
- [x] **Timeline tab**（`NetworkTimeline.tsx`）⚠️ 待人工核：字段映射是否完整
- [x] **右键菜单**（`RowContextMenu.tsx`）⚠️ 待人工核：是否含复制 cURL / 重放到 Composer
- [x] **Tree 视图**（`NetworkTreeView.tsx`，原计划未列）
- [ ] 列宽/列显示自定义（存 localStorage）⏳
- [ ] 大列表性能 profile（>10k 条）⏳

### 里程碑 3 · Rules 编辑器

- [x] 规则列表（`cgi-bin/rules/list2?order=1`）
- [x] CodeMirror 6 编辑器
- [x] 保存（`cgi-bin/rules/select`）+ 脏状态 + Toast
- [x] **whistle DSL 自定义高亮 / 自动补全**（`cm-whistle-autocomplete.ts` + `hints.ts` + `protocols.ts`）⚠️ 待人工核：与老 `lib/rules/syntax.js` 行为 diff
- [x] **新建/重命名分组**（`NewGroupDialog.tsx` + `RenameDialog.tsx`）
- [ ] 删除分组 ⚠️ 待核（可能已在 `RulesToolbar.tsx`）
- [ ] 启用/禁用规则（多选/单选模式）⚠️ 待核
- [ ] 导入/导出 ⏳

### 里程碑 4 · Composer

- [x] react-hook-form + zod 校验
- [x] 发送到 `cgi-bin/composer`
- [x] 响应展示（CodeView）
- [x] **历史记录 + 收藏**（`HistorySidebar.tsx` + `store/composer-history.ts`）
- [x] **批量并发 / 循环发送**（`BatchSendDialog.tsx` + `use-batch-send.ts`）
- [x] **Frame Composer**（独立 `features/frames/` 模块，已成为顶层 tab）

### 里程碑 5 · Plugins / Values

- [x] Plugins 卡片网格
- [x] **安装对话框**（`InstallPluginDialog.tsx` + `use-install-errors.ts`）
- [x] **注册源切换**（`RegistryDialog.tsx`）⚠️ Go 重写 D3 决定后可能要重做（如 plugin 协议彻底重设计）
- [ ] 禁用/卸载 ⚠️ 待核
- [x] Values 列表 + 只读 CodeView
- [x] **导入**（`ImportValuesDialog.tsx`）
- [ ] 新建/重命名/删除/导出/recycle ⚠️ 待核

### 里程碑 6 · HTTPS / 系统对话框

- [x] HTTPS 状态查询 + 拦截开关 + 下载根证书
- [x] **Certs 管理**（`CertsManager.tsx` + `CertDetailDialog.tsx` + `CertUploadDialog.tsx`）
- [ ] HTTP/2 开关 ⚠️ 待核
- [x] **Settings 7 个对话框**：DNS / Editor / Network / Shortcuts / Sync / Tips
- [x] **Console**（独立 `features/console/`）
- [x] **Tools Drawer**
- [x] **Service** 对话框
- [ ] Weinre ⏳（apps/proxy/devtools 在归档区，是否值得做要看 Go 端是否保留）

### 里程碑 7 · 接入 + 灰度 ❌ 整段废止

- ❌ `W2_NEXT_UI` 灰度开关（apps/proxy 已归档）
- ❌ 把 dist 接回老 ROOT（同上）
- 替代方案：等 Go 后端 GO-5 出来时按新架构重做静态资源分发

---

## 6. Go 重写期间的前端工作排序

> 后端切 Go 之前，前端可独立推进的事项，按 ROI 排序。

| 优先级 | 工作 | 备注 |
|---|---|---|
| ★★★ | **Rules 语法高亮人工核对** + 启用/禁用规则、删除分组 | 高频功能，差距在"用得舒服"层面 |
| ★★★ | **Network 列宽/列显示自定义** + 详情字段完整度核查 | 纯前端，对 Go baseline 验证有用 |
| ★★ | **Values 新建/重命名/删除/导出** | 后端契约不变，补齐就闭环 |
| ★★ | **Plugins 禁用/卸载** | ⚠️ 但**不要碰**安装源相关协议层改动——Go D3 决定后可能整体重设计 |
| ★★ | **HTTPS / Settings 缺口核查**（HTTP/2 开关、Certs 详情完备性） | 低风险，扫尾 |
| ★★ | **i18n 自动化护栏**（ESLint 规则 / CI grep） | 越早装越省事 |
| ★ | **大列表性能 profile**（>10k 抓包条目） | 等 Go 后端吞吐上去再痛，先建 baseline |
| ★ | **PROMPTS/ 路径清理** | 历史 session prompt 路径仍是 `biz/webui/htdocs-next`，文档卫生 |

---

## 7. i18n 落地规则

### 强制约定

- **任何新组件都不允许出现硬编码可见英文字符串**。包括 `placeholder`、`title`、`aria-label`、`alt`。
- 所有 key 走 `t('namespace.key')` 形式，按业务模块分 namespace（`about.*`、`network.*`、`rules.*`…）。
- 第一阶段 `zh-CN.json` 内容**先填同英文**或留 TODO，等功能稳定后统一找译者翻译。
- 数字、日期、字节大小用 `Intl.NumberFormat` / `Intl.DateTimeFormat`。

### 切换体验

- 默认按 `localStorage('w-locale') > navigator.language`。
- 切换语言写 localStorage，**不要 reload**（i18next 自带响应式更新）。

### 自动化护栏（待做）

- ESLint 自定义规则：JSX 文本节点出现非空白 ASCII 字符串则报错。
- 或在 CI 跑一个 grep 脚本扫硬编码字符串。

---

## 8. 状态管理边界

| 数据 | 存哪 | 理由 |
|---|---|---|
| 服务端响应（`cgi-bin/*`） | SWR | 自动缓存、自动重新校验、轮询 |
| 实时 WS 事件（抓包流、frame） | Zustand store + 手写 WS 客户端 | SWR 不擅长流式数据 |
| 跨组件 UI 开关（对话框、tab、列宽、过滤器） | Zustand | 单一来源、可持久化 localStorage |
| 单组件局部状态（输入框 value、hover） | `useState` | 不要用 Zustand 包小事 |
| URL 状态（路由、查询参数） | URL 本身 / TanStack Router | 暂不引入路由，等需要分享链接时再说 |

---

## 9. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| Go 后端 cgi-bin 协议对齐偏差 | 高 | 关键 endpoint 在 `web/src/api/` 集中包装，留 schema 兜底；Go GO-5 阶段做 diff |
| Plugins 协议被 Go D3 重设计 | 中-高 | Plugins 面板里碰协议字段的工作暂缓 |
| 大列表性能（数万抓包条目） | 高 | `@tanstack/react-virtual` 已用；避免 `useMemo` 滥用 |
| WS 重连/心跳/退避 | 中 | 单独写 `lib/ws.ts`（待补），所有 WS 走它；带指数退避 |
| 老接口字段命名不一致 | 中 | 在 `api/` 层做类型映射，组件只看干净 TS 类型 |
| Tailwind v4 仍在演进 | 低 | 锁 minor 版本；只用稳定特性 |
| 翻译延迟交付 | 低 | i18n 先打通 key，文案后补 |

---

## 10. 验收标准（每个工作项通用）

- [ ] `pnpm typecheck` 干净
- [ ] `pnpm build` 通过，bundle 体积无异常增长（>20% 需要 review）
- [ ] UI 与老版肉眼一致（同分辨率截图比对）；或新设计需先单独签字
- [ ] 主路径手动跑通
- [ ] 所有可见字符串走 i18n，`grep -RE "['\"][A-Z][a-zA-Z ]{3,}['\"]" src/features/<module>` 无漏网
- [ ] 没有引入 jQuery / Bootstrap / moment / lodash
