# server/ Track 索引 + 下一阶段

> Go 重写主线（GO-1 ~ GO-7）已经全部落地，server/ 可独立起服跑端到端。本文档现在只做两件事：
> 1. 已完成 Track 的一行索引 + commit 引用（用来回溯设计原因）
> 2. 下一阶段工作的指针（不在本文件展开，挂去对应权威稿）

## 已完成 Track（按 GO-REWRITE-PLAN §3 阶段对应）

| Track | 范围 | commit | 备注 |
|---|---|---|---|
| **GO-1 / 骨架** | server/ 目录布局 + interface 注入 + Nop 默认实现 | `dd52256a6` `2bc6b445d` | 决策稿 commit `57701a4f0` lock 了 D1–D8 |
| **GO-2 / Track A · CA + HTTPS MITM** | `ca/` RSA-2048 根证书懒生成 + leaf SNI sync.Map 缓存；`proxy/connect.go` peek 分流 + `mitm.go` singleConnListener；`-data-dir` flag | (主 session) | `ca_test.go` 覆盖根生成/幂等/leaf/缓存/磁盘 |
| **GO-4 / Track B · 规则引擎** | `rules/{parser,match,engine_impl}.go`：30 op 子集 + 手写行解析（注释/多行/inline 值/远程 stub）+ 模式匹配（精确/正则/通配/前缀/负向）；KnownOps 白名单 | `c381e4355` | `engine_test.go` 23 测试 + `testdata/golden/basic.rules` |
| **GO-4 / Track B 集成** | `proxy/apply.go` `planFromAction`：directives → 短路/转发/请求改写/响应改写；`forward.go` 按 plan 执行；CONNECT 阶段 `enable/disable capture` last-write-wins | (Track B 同 PR) | `forward_test.go` 9 测试 + `connect_test.go` 3 测试 |
| **GO-5 / Track C · cgi-bin API** | chi 路由 + `api/router.go` + `capture.go` ring buffer + WS 推送；端点对齐 whistle `biz/webui/cgi-bin/` | `5f83acaf6` | 前端 zero-code 切到 Go 后端 |
| **Track D · 黄金集 fixture** | `rules/testdata/golden/`：50 组 input/expected JSON 覆盖 37 op + 8 模式变体 + 2 组合 | `5003e0d3d` | 手工编写（whistle Node 实现做对照） |
| **GO-3 / Track E · WebSocket** | `ws/{frame,handshake,proxy,ws}.go`：RFC 6455 帧解析 + 双向 splice；`proxy/upgrade.go` Hijack → 上游 dial → TLS Client → ForwardHandshake → ProxyFrames；MITM `isWebSocketUpgrade` 分流 | `43fab5d18` | `ws_test.go` 8 测试 |
| **Track E 集成 · ws.Hook → api** | `api/ws_hook.go`：`NewSession(r)` 工厂 + per-session 帧存储 + 全局 LRU evict；`proxy/upgrade.go` type-assert 升级 hook；`/cgi-bin/get-frames` 真返回数据 | (Track E 同 PR) | `ws_hook_test.go` 6 测试 |
| **GO-6 / Track F · Sobek ESM 运行时** | `script/{runtime,sandbox,resolver,script}.go` + 6 个 piper:* 内置模块（fs/http/crypto/url/buffer/log）；ESM only + 沙箱（路径白名单/超时/内存）；async/await microtask pump；编译缓存 | `f66767d3a` | `script_test.go` 10 测试 |
| **GO-7 / G1 · plugin 操作符接入** | `apply.go` plugin op → `scriptPath`；`forward.go` 调 `scripts.Resolve` 让脚本接管转发 | (主 session) | `plugin_test.go` |
| **GO-7 / G2 · file/rawfile/xfile mock** | `mockFile/mockRawFile/mockXFile` plan 字段；`shortCircuit` 处理文件 mock + Content-Type 推断；`xfile` 不存在 fall-through | (主 session) | `file_mock_test.go` |
| **GO-7 / G3 · proxyauth** | `-proxy-auth user:pass` + `Proxy-Authorization` 校验 + 407 | (主 session) | `proxyauth_test.go` |
| **GO-7 / G4 · uiauth** | `-ui-auth` flag + chi middleware Basic Auth + WWW-Authenticate | (主 session) | `api/uiauth_test.go` |
| **GO-7 / G5 · 自定义 SNI 证书** | `ca/manager.go` `<dataDir>/certs/custom/*` 优先于自动签发；`/cgi-bin/certs/{all,upload,remove}` 实现 | (主 session) | `ca/custom_cert_test.go` |
| **GO-7 / G6 · autosave 操作符** | `apply.go` `autosaveDir`；`forward.go` 异步 JSON dump；`-autosave` 全局 flag | (主 session) | `autosave_test.go` |

## 编排能力（来自 ECOSYSTEM-PLAN T-piper-2 / T-piper-3，已落地）

- `ca.Authority` / `api.Capturer` / `event.Emitter` 三个 SPI 已抽（commit 见 [ECOSYSTEM-PLAN.md](../docs/ECOSYSTEM-PLAN.md)）
- `--event-webhook URL` flag 启用外部事件推送
- `--config-url` `--identity` flag + `/piper-cgi/healthz` + `/piper-cgi/identify`（不走 uiAuth）—— 解锁 piper-cloud P3 编排
- `internal/mcp/` + `cmd/piper/mcp.go`：stdio MCP server，供 Claude Code / Cursor 控制 piper

## 下一阶段工作（指针，不在本文件展开）

- **API 现代化**：[docs/API-MODERNIZATION-PLAN.md](../docs/API-MODERNIZATION-PLAN.md) —— `/cgi-bin/*` → `/api/*` RESTful + SSE 取代 1500ms 轮询 + body 懒加载
- **竞品借鉴 spec**：[docs/competitive/](../docs/competitive/) —— P0/P1 多数已 completed，P2 backlog 待抽
- **清理 backlog**：[docs/DEPRECATIONS.md](../docs/DEPRECATIONS.md) —— `autosave.go` 让位 SQLite store、RSA-2048 → ECDSA P-256、前端面板合并
- **生态推进**：[docs/ECOSYSTEM-PLAN.md](../docs/ECOSYSTEM-PLAN.md) —— piper-cloud P3/P4/P5 已 unblock；`@piper/ui-kit` Stage E 已完成（rules/https 组件迁入）
- **规则语义补全**：剩余 17 个 op（reqBody/resBody/reqReplace/resReplace/reqDelay/resDelay/reqSpeed/resSpeed/tpl/jsonp/urlReplace/urlParams/reqCookies/resCookies/resCors 等）按需补；`rules/SPEC-CHECKLIST.md` 列对照

## 接口契约（仍然有效，给后续 session）

| 包 | 接口 | 默认实现 | 改这里就要协调 |
|---|---|---|---|
| `ca` | `Authority` | `Nop` / `NewManager` | 改接口签名 |
| `tunnel` | `Dialer` | `Direct` | 改接口签名 |
| `ws` | `Hook` | `NopHook` / `api.WSHook` | 改接口签名 |
| `rules` | `Engine` | `Nop` / `New`+`NewFromFile` | 改 `Action.Directives` 字段 |
| `script` | `Manager` | `Nop` / `RealManager` | 改接口签名 |
| `api` | `Handler` (= `http.Handler`) | `NotImplemented` / `NewRouter` | — |
| `event` | `Emitter` | `Nop` / webhook | 改 Event 字段 |

**铁律**：包内随便扩接口实现，但改接口签名 / 改 `proxy/handler.go` 分发逻辑要主 session 串行做。
