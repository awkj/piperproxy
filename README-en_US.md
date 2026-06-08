<p align="center">
  <img alt="piper logo" src="./docs/img/piper-logo.svg" width="160" height="160">
</p>

<h1 align="center">piper</h1>

<p align="center">
  <em>HTTP / HTTPS / WebSocket capture & debugging proxy</em><br/>
  <sub>Fork of whistle — Go backend, React 19 + Vite frontend, macOS-first</sub>
</p>

<p align="center">
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square"></a>
  <img alt="Go" src="https://img.shields.io/badge/go-1.26-00ADD8.svg?style=flat-square">
  <img alt="React" src="https://img.shields.io/badge/react-19-61DAFB.svg?style=flat-square">
  <img alt="Status" src="https://img.shields.io/badge/status-WIP-F59E0B.svg?style=flat-square">
</p>

[中文](./README.md) · English

---

## On the name: from whistle to piper

piper is a fork of [whistle](https://github.com/avwo/whistle). **whistle** → **piper** — both make hidden airflow **visible, controllable, listenable**. The name also nods to HTTP **pipe**: a capture proxy is exactly a pipe that a man-in-the-middle can see, rewrite, and replay.

> Credit to the upstream author [@avenwu](https://github.com/avenwu) / `avwo/whistle` (MIT License).
> piper inherits from whistle: the rule text syntax (a 30-op subset), the cgi-bin API protocol, default port `8899`, and the data-directory layout.
> piper does **not** inherit: the Node.js runtime, `vm.createContext` scripting, or the Node plugin subprocess protocol. See [docs/GO-REWRITE-PLAN.md](./docs/GO-REWRITE-PLAN.md).

## Inspirations

On top of whistle's rule engine, piper's UX and product shape borrow from:

- **[Proxyman](https://proxyman.io/)** — native macOS feel, Composer / Map Local / SSL Pinning flow
- **[Reqable](https://reqable.com/)** — cross-platform UX, breakpoints / GraphQL / Compose / network throttling
- **[Rockxy](https://github.com/rockcarry/rockxy)** — open-source macOS alternative, CA trust wizard, Sobek-style scripts

See [`docs/competitive/`](./docs/competitive/):
- [`reference/`](./docs/competitive/reference/) — feature notes for the three + [gap-matrix](./docs/competitive/reference/gap-matrix.md)
- [`specs/`](./docs/competitive/specs/) — P0 / P1 implementation specs (MCP server, Command Palette, Diff Tool, Trust Wizard, …)

## Feature matrix (current)

| Area | Status |
|------|--------|
| HTTP / HTTPS MITM (auto leaf signing) | ✓ |
| WebSocket frame capture (ws.Hook → API) | ✓ |
| whistle text rule engine (30-op subset) | ✓ |
| cgi-bin API + SSE live streaming | ✓ |
| Sobek ESM script runtime (replaces `vm.createContext`) | ✓ |
| SQLite persistence (replaces `autosave.go`) | ✓ |
| HTTP/2 · raw TCP tunnelling | planned |
| MCP server (drive piper from Claude Code / Cursor) | P0 in-progress |
| Command Palette · Diff Tool · Trust Wizard | P0 spec ready |

Full status: [`docs/GO-REWRITE-PLAN.md`](./docs/GO-REWRITE-PLAN.md) and [`server/TASKS.md`](./server/TASKS.md).

## Quick start

> macOS is the primary development target. Linux / Windows currently keep build compatibility only.

```bash
# 1. backend
cd server
go run ./cmd/piper -addr :8899

# 2. frontend (dev mode)
cd web
pnpm install
pnpm dev
```

Default data directory: `~/.PiperAppData/.piper/` (certs, rules, sessions, SQLite — all under here).

Common flags:

```
-addr           proxy listen address, defaults to :8899
-data-dir       data directory, defaults to ~/.PiperAppData/.piper
-rules-file     rule file to load on start (whistle text format)
-proxy-auth     proxy auth user:pass
-ui-auth        UI auth user:pass
-log-level      debug | info | warn | error
```

A CA is generated on first launch (`~/.PiperAppData/.piper/certs/root.{crt,key}`). System trust flow lives in [`docs/competitive/specs/p1-trust-wizard.md`](./docs/competitive/specs/p1-trust-wizard.md).

### Upgrading from 0.x: handling the CA

Older piper (macOS) sealed the CA private key in the system Keychain, which prompted for authorization on every launch. The new version stores the key in a regular file under the data directory — same as whistle / mitmproxy / Charles — so launch is silent.

Check which side of the migration you're on:

```bash
piper ca info
```

- Prints CA info → you're already on the new layout, do nothing
- Errors with `CA 文件状态不一致 / cert found but key missing` → your old key is still in Keychain, pick one of the options below

**Option A: keep the existing CA (recommended)**

```bash
piper ca migrate
```

Reads the old key from Keychain, writes it to disk, then deletes the Keychain entry. macOS will prompt for authorization **one last time** (click Always Allow or enter your login password). Existing system trust stays valid; subsequent launches are silent.

**Option B: drop the old CA and generate a fresh one**

```bash
piper ca reset
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain \
  "$(piper ca path)"
# Optional: clean up the orphaned Keychain entry
security delete-generic-password -s com.piper.ca
```

Use this if you don't mind re-trusting (e.g., the box never had old piper, or you'd rather start fresh).

## Layout

```
piper/
├── server/          Go backend (active)
│   ├── cmd/piper/       main entrypoint (with `mcp` / `shell` / `ca` subcommands)
│   ├── proxy/           HTTP/HTTPS/WS proxy + MITM
│   ├── ca/              CA / leaf signing
│   ├── rules/           whistle text rule engine
│   ├── script/          Sobek ESM script runtime
│   ├── api/             cgi-bin HTTP API + SSE
│   └── store/           SQLite persistence
├── web/             React 19 + Vite + TypeScript frontend
└── docs/
    ├── ARCHITECTURE.md       source map
    ├── GO-REWRITE-PLAN.md    Go rewrite decision doc
    ├── DEPRECATIONS.md       cut / redo list
    ├── RENAME-DECISIONS.md   whistle → piper rename decisions
    └── competitive/          competitive notes + specs
```

## Differences from upstream whistle (one-liner)

| Dimension | whistle | piper |
|-----------|---------|-------|
| Backend | Node.js | **Go 1.26** |
| Scripts | `vm.createContext` | **Sobek ESM** |
| Persistence | files + autosave | **SQLite** |
| CA algo | RSA-2048 | ECDSA P-256 (migrating) |
| Plugin protocol | `whistle.<plugin>` subprocess | Sobek-managed `plugin://` (hard-cut, not compatible) |
| HTTP headers | `x-whistle-*` | `x-piper-*` (74 keys hard-renamed) |
| CLI | `w2` / `whistle` / `wproxy` | `piper` (single) |
| Data dir | `~/.WhistleAppData/.whistle/` | `~/.PiperAppData/.piper/` |
| Third-party plugin compat | — | **broken on purpose** — see [RENAME-DECISIONS.md](./docs/RENAME-DECISIONS.md) |

## License

[MIT](./LICENSE) — inherited from upstream whistle by [@avenwu](https://github.com/avenwu).
