# piper server（Go 实现）

Go 重写后的 piper 代理后端。决策稿：[docs/GO-REWRITE-PLAN.md](../docs/GO-REWRITE-PLAN.md)。

## 状态

GO-1 ~ GO-7 全部落地（详见 [TASKS.md](./TASKS.md)）。当前 server/ 可独立起服跑端到端：

- **HTTP 转发**：剥 hop-by-hop header，流式 body copy
- **HTTPS MITM**：根证书懒生成（`<dataDir>/certs/root.{key,crt}`，10 年有效）；leaf SNI lazy 签发 + `sync.Map` 缓存 + 自定义 SNI 证书覆盖（`certs/custom/<host>.{key,crt}`）；通过 `tls.Config.GetCertificate` 直接取 SNI
- **CONNECT 分流**：peek 首字节 → `0x16` TLS 走 MITM，非 TLS 透传；`disable://capture` 操作符强制透传（last-write-wins）
- **WebSocket / wss MITM 抓帧**：真正的握手转发 + 双向帧 splice；wss 路径在 MITM 解密后走 ws 包；`api.WSHook` per-session 帧存储 + LRU evict
- **规则引擎**：whistle 文本规则 30 op 子集（host/proxy/redirect/statusCode/file*/method/reqHeaders/resHeaders/replaceStatus/ua/referer/ignore/plugin/autosave/...），CONNECT 阶段 `enable/disable capture` 短路
- **Sobek ESM 脚本**：`plugin://<name>` 走 Sobek runtime；`piper:{fs,http,crypto,url,buffer,log}` 6 个内置模块；沙箱（路径白名单 + 5s 超时）
- **API**：`/cgi-bin/*` 完整端点（init/get-data/get-frames/rules/values/plugins/certs/composer/...），抓包数据 ring buffer + WS 推送
- **认证**：`-proxy-auth` Basic Auth 拦代理请求；`-ui-auth` 拦 UI HTTP API
- **MCP server**：`piper mcp` 子命令暴露 stdio MCP，Claude Code / Cursor 可控制
- **编排能力**：`--event-webhook` 推 capture/lifecycle 事件；`--config-url --identity` 让 piper-cloud 拉起子进程

## 跑起来

```bash
cd server
go run ./cmd/piper -addr :8899
# 默认数据目录 ~/.PiperAppData/.piper；首次启动生成根证书 certs/root.crt
# 装进系统/浏览器信任链后即可抓 HTTPS

# 自定义路径 + 规则文件 + 认证
go run ./cmd/piper \
  -addr :8899 \
  -data-dir /tmp/piper \
  -rules-file /tmp/rules.txt \
  -proxy-auth user:pass \
  -ui-auth admin:secret \
  -log-level debug
```

子命令：

```bash
piper shell          # zero-setup 代理 terminal（仅 macOS POSIX shell）
piper ca install     # macOS Keychain 装入根证书
piper ca export      # 导出根证书 PEM
piper mcp            # stdio MCP server（供 Claude Code / Cursor 接入）
```

## 目录

参考 [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)。简表：

| 包 | 职责 |
|---|---|
| `cmd/piper/` | bin 入口 + 子命令（shell/ca/mcp） |
| `proxy/` | Server + Handler，HTTP/CONNECT/Upgrade/MITM/forward/apply |
| `tunnel/` | 上游 TCP 建连 + ClientHello sniff |
| `ws/` | WebSocket 帧解析 + 双向 proxy |
| `ca/` | 根证书 + leaf 签发 + 自定义证书 |
| `rules/` | whistle 文本规则引擎（parser + match + engine） |
| `script/` | Sobek ESM runtime + piper:* 内置模块 |
| `api/` | chi 路由 + cgi-bin/api 端点 + SSE/WS 推送 |
| `store/` | SQLite（rules / values / sessions） |
| `event/` | 事件总线（外部 webhook） |
| `throttle/` | network throttle |
| `obs/` | slog 日志封装 |
| `internal/mcp/` | MCP server tools |
| `internal/setup/` | developer-setup-hub 诊断 + registry |
| `internal/paths/` | 跨平台路径 |
| `internal/procattr/` | 流量发起进程归属（macOS lsof） |
| `internal/codegen/` | Copy as cURL 等代码生成 |

## 协作契约

`proxy.Config` 把可替换组件以接口形式注入，每个包暴露：

- 一个或多个 `interface`
- 一个零值即可用的 `Nop` / `Direct` / `NotImplemented` 实现 + 真实实现

详见 [TASKS.md](./TASKS.md) 末尾"接口契约"。**铁律**：改接口签名要主 session 串行。

## 决策点（GO-0 已 lock，commit `57701a4f0`）

| 决策 | 选定 |
|---|---|
| D1 HTTP | `net/http` + `go-chi/chi`（chi 仅 api/） |
| D2 TLS/CA | `crypto/tls` + `crypto/x509` |
| D3 插件 | Sobek ESM 引擎（plan §4.6） |
| D4 规则 DSL | 手写 parser + 30 op 子集（plan §4.5），脚本走 D3 |
| D5 日志 | `log/slog` |
| D6/D7 存储 | `modernc.org/sqlite`（rules / values / sessions / certs 同一 db） |
| D8 抓包→前端 | 长轮询（cgi-bin）当前；SSE 取代轮询见 [API-MODERNIZATION-PLAN.md](../docs/API-MODERNIZATION-PLAN.md) |
