# piper

HTTP/HTTPS/WebSocket 抓包调试代理。**whistle** 的 fork：保留 whistle 文本规则语法 + cgi-bin API 协议；后端用 Go 重写（取代 whistle 的 Node.js 实现），前端 React 19 + Vite，加一个共享的 `@piper/ui-kit`。

源码目录请看 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)——按目录列出每个包的职责和入口文件，本文件不重复。

## 当前状态（2026-06-07）

**Go 后端主线**已经走完 GO-1 ~ GO-7：CA/HTTPS MITM ✓ · whistle 文本规则引擎（30 op 子集）✓ · cgi-bin API ✓ · WebSocket 抓帧 ✓ · Sobek ESM 脚本运行时 ✓ · 内置 mock/proxyauth/uiauth/自定义 SNI 证书/autosave ✓。server/ 可独立起服跑端到端。

**生态编排** T-piper-1/2/3 已落地：`@piper/ui-kit` 抽好（rules/https 组件已迁入，piper-cloud 通过 npm 消费）；`ca.Authority / api.Capturer / event.Emitter` 三 SPI 抽好；`--event-webhook / --config-url / --identity / /piper-cgi/healthz / /piper-cgi/identify` 编排能力齐全。

**MCP server** `piper mcp` 子命令暴露 stdio MCP，Claude Code / Cursor 可直接控制 piper（读抓包、写规则、命中规则等）。

**前端 React 19 + Vite**：`web/` 是 thin app shell，依赖 `@piper/ui-kit` 拼装；工具链保留 vite + Node.js + pnpm。

下一阶段工作三条主线（都不在本文件展开，挂去权威稿）：
- API 现代化（cgi-bin → REST + SSE 取代轮询）：[docs/API-MODERNIZATION-PLAN.md](./docs/API-MODERNIZATION-PLAN.md)
- 竞品借鉴 P0/P1 spec：[docs/competitive/](./docs/competitive/) （多数已 completed）
- 清理 backlog（前端面板合并、autosave 让位 SQLite、RSA → ECDSA）：[docs/DEPRECATIONS.md](./docs/DEPRECATIONS.md)

## 与原版 whistle 的关系

- 原版仓库（参考实现）：`../github/whistle`（即 `/Users/doctor/Developer/personal/github/whistle`），作者 avenwu / `avwo/whistle`，License MIT
- piper **继承** whistle 的：HTTP API 协议（cgi-bin 端点 / 前端 schema）、规则文本语法（30 op 子集，详见 [docs/GO-REWRITE-PLAN.md](./docs/GO-REWRITE-PLAN.md) §4.5）、默认端口 8899、数据目录布局
- piper **不继承**的：Node.js 运行时（重写为 Go）、`vm.createContext` 脚本（改用 Sobek ESM）、Node 插件子进程协议（改由 Sobek 接管 `plugin://`）
- 命名映射：whistle → piper，`.whistle/` → `.piper/`，`local.whistlejs.com` → `local.piper.test`

参考 whistle 实现时直接读 `../github/whistle/lib/`、`../github/whistle/biz/webui/`。

## 顶层布局

```
piper/
├── server/             Go 后端（活跃，详见 server/README.md）
├── web/                React 19 前端（详见 web/MIGRATION-PLAN.md）
├── packages/ui-kit/    @piper/ui-kit 共享组件（piper-cloud 也消费）
├── docs/               设计/规划文档（活的；索引见 ARCHITECTURE.md）
└── pnpm-workspace.yaml workspace 含 web/ + packages/*
```

`apps/proxy/`（whistle Node 实现）+ `apps/webui/` 老前端 + `packages/weinre/` 已在 Go 重写完成后全部删除。Node 时代的重构归档文档（REFACTOR-PLAN / refactor/ / sessions/G2-G6.5 / RENAME-DECISIONS / UPSTREAM-MAPPING / J2-VM-AUDIT / htdocs-next-TODO / test-speedup）已在 2026-06-07 整体删除——需要历史可查 git log。

## 技术栈

- 后端：Go 1.26，`net/http` + `go-chi/chi` + `crypto/tls` + `grafana/sobek` + `modernc.org/sqlite`
- 前端：React 19 + Vite + TypeScript + pnpm
- 共享：`@piper/ui-kit`（pnpm workspace 内部消费，piper-cloud 通过 npm 消费）

## 必读

任何继续推进 Go 后端的 session：先读 [docs/GO-REWRITE-PLAN.md](./docs/GO-REWRITE-PLAN.md)（决策稿，D1–D8 lock）+ [server/TASKS.md](./server/TASKS.md)（已完成 Track 索引 + 下一阶段指针）。

任何涉及 piper-cloud / `@piper/ui-kit` / SPI 的 session：先读 [docs/ECOSYSTEM-PLAN.md](./docs/ECOSYSTEM-PLAN.md)（三层切分决策 + 跨仓库依赖）。

任何砍/合并/重做 server 或 web 现有功能的 session：先读 [docs/DEPRECATIONS.md](./docs/DEPRECATIONS.md)（清理 backlog + sprint 调度入口在 docs/competitive/README.md）。
