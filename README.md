<p align="center">
  <img alt="piper logo" src="./docs/img/piper-logo.svg" width="160" height="160">
</p>

<h1 align="center">piper</h1>

<p align="center">
  <em>HTTP / HTTPS / WebSocket 抓包调试代理</em><br/>
  <sub>whistle 的 fork —— 后端 Go 重写，前端 React 19 + Vite，桌面端先做 macOS</sub>
</p>

<p align="center">
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square"></a>
  <img alt="Go" src="https://img.shields.io/badge/go-1.26-00ADD8.svg?style=flat-square">
  <img alt="React" src="https://img.shields.io/badge/react-19-61DAFB.svg?style=flat-square">
  <img alt="Status" src="https://img.shields.io/badge/status-WIP-F59E0B.svg?style=flat-square">
</p>

中文 · [English](./README-en_US.md)

---

## 关于名字：从 whistle 到 piper

piper 是 [whistle](https://github.com/avwo/whistle) 的 fork。**whistle**（哨子）→ **piper**（吹笛人）—— 都是把"内部气流"变得**可见、可控、可截听**的乐器。
名字同时呼应 HTTP **pipe**（管道）：抓包代理的本质就是一根能被中间人看见、改写、重放的管道。

> 致谢原作者 [@avenwu](https://github.com/avenwu) / `avwo/whistle`（MIT License）。  
> piper 继承 whistle 的：文本规则语法（30 op 子集）、cgi-bin API 协议、默认端口 `8899`、数据目录布局。  
> piper **不**继承的：Node.js 运行时、`vm.createContext` 脚本、Node 插件子进程协议（参见 [docs/GO-REWRITE-PLAN.md](./docs/GO-REWRITE-PLAN.md)）。

## 灵感参考

piper 在保留 whistle 规则引擎的基础上，UI 与产品形态借鉴这三家：

- **[Proxyman](https://proxyman.io/)** —— macOS 原生体验，Composer / Map Local / SSL Pinning 处理
- **[Reqable](https://reqable.com/)** —— 跨端体验，断点 / GraphQL / Compose / 弱网模拟
- **[Rockxy](https://github.com/rockcarry/rockxy)** —— 开源 macOS 替代品，CA 信任引导 / Sobek 风格脚本

详见 [`docs/competitive/`](./docs/competitive/)：
- [`reference/`](./docs/competitive/reference/) — 三家功能详注 + [gap-matrix](./docs/competitive/reference/gap-matrix.md)
- [`specs/`](./docs/competitive/specs/) — P0 / P1 落地 spec（MCP server、Command Palette、Diff Tool、Trust Wizard 等）

## 功能矩阵（当前）

| 类别 | 状态 |
|------|------|
| HTTP / HTTPS MITM（自动签发 leaf 证书） | ✓ |
| WebSocket 抓帧（含 ws.Hook → API 链路） | ✓ |
| whistle 文本规则引擎（30 op 子集） | ✓ |
| cgi-bin API + SSE 实时推送 | ✓ |
| Sobek ESM 脚本运行时（取代 `vm.createContext`） | ✓ |
| SQLite 持久化（取代 `autosave.go`） | ✓ |
| HTTP/2 / TCP 透传 | 规划中 |
| MCP Server（让 Claude Code / Cursor 直接驱动 piper） | P0 in-progress |
| Command Palette / Diff Tool / Trust Wizard | P0 spec ready |

完整状态见 [`docs/GO-REWRITE-PLAN.md`](./docs/GO-REWRITE-PLAN.md) 与 [`server/TASKS.md`](./server/TASKS.md)。

## 快速开始

> 当前阶段以 macOS 为主开发平台，Linux / Windows 仅保留 build 通道。

```bash
# 1. 起后端
cd server
go run ./cmd/piper -addr :8899

# 2. 起前端（开发模式）
cd web
pnpm install
pnpm dev
```

后端默认数据目录：`~/.PiperAppData/.piper/`（证书 / 规则 / 会话 / SQLite 全在这）。

常用 flag：

```
-addr           代理监听地址，默认 :8899
-data-dir       数据目录，默认 ~/.PiperAppData/.piper
-rules-file     启动时加载的规则文件（whistle 文本格式）
-proxy-auth     代理认证 user:pass
-ui-auth        UI 认证 user:pass
-log-level      debug | info | warn | error
```

CA 证书首次启动会自动生成（`~/.PiperAppData/.piper/certs/root.{crt,key}`），系统信任流程见 [`docs/competitive/specs/p1-trust-wizard.md`](./docs/competitive/specs/p1-trust-wizard.md)。

### 老用户：从 0.x 升级时怎么处理 CA

老版本 piper（macOS）会把 CA 私钥密封在系统 Keychain 里，导致每次启动都弹一次授权框。新版改为只用磁盘文件，启动零授权——和 whistle / mitmproxy / Charles 一致。

**判断你属于哪一类**：

```bash
piper ca info
```

- 输出正常 → 你已经是新版状态，无需任何操作
- 报错 `CA 文件状态不一致：找到 root.crt 但缺少 root.key` → 你的旧私钥还密封在 Keychain，按下面任选一种处理

**方案 A：保留旧 CA（推荐）**

```bash
piper ca migrate
```

会从 Keychain 读出旧私钥写到磁盘，然后清掉 Keychain 条目。期间 macOS 会弹**最后一次**授权框（点 Always Allow 或输登录密码）。完成后旧的系统信任链继续有效，启动零授权。

**方案 B：放弃旧 CA、生成全新的**

```bash
piper ca reset
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain \
  "$(piper ca path)"
# 顺手清掉 Keychain 里那个孤儿 key 条目
security delete-generic-password -s com.piper.ca
```

适合不在乎旧信任链失效的场景（机器上没装过老 piper、或你愿意重新装一次信任）。

## 目录结构

```
piper/
├── server/          Go 后端（活跃）
│   ├── cmd/piper/       主入口（含 `mcp` / `shell` / `ca` 子命令）
│   ├── proxy/           HTTP/HTTPS/WS 代理 + MITM
│   ├── ca/              CA / leaf 证书签发
│   ├── rules/           whistle 文本规则引擎
│   ├── script/          Sobek ESM 脚本运行时
│   ├── api/             cgi-bin HTTP API + SSE
│   └── store/           SQLite 持久化
├── web/             React 19 + Vite + TypeScript 前端
└── docs/
    ├── ARCHITECTURE.md       源码地图
    ├── GO-REWRITE-PLAN.md    Go 重写主决策稿
    ├── DEPRECATIONS.md       砍/重做清单
    ├── RENAME-DECISIONS.md   whistle → piper 改名决策
    └── competitive/          竞品借鉴 + 落地 spec
```

## 与上游 whistle 的差异（一句话版）

| 维度 | whistle | piper |
|------|---------|-------|
| 后端 | Node.js | **Go 1.26** |
| 脚本 | `vm.createContext` | **Sobek ESM** |
| 持久化 | 文件 + autosave | **SQLite** |
| CA 算法 | RSA-2048 | ECDSA P-256（迁移中） |
| 插件协议 | `whistle.<plugin>` 子进程 | Sobek 接管 `plugin://`（生态硬切，不兼容） |
| HTTP 头 | `x-whistle-*` | `x-piper-*`（74 个全部硬改） |
| CLI | `w2` / `whistle` / `wproxy` | `piper`（单一） |
| 数据目录 | `~/.WhistleAppData/.whistle/` | `~/.PiperAppData/.piper/` |
| 第三方插件兼容 | — | **不兼容**（接受代价；详见 [RENAME-DECISIONS.md](./docs/RENAME-DECISIONS.md)） |

## License

[MIT](./LICENSE) —— 继承自上游 whistle，原作者 [@avenwu](https://github.com/avenwu)。
