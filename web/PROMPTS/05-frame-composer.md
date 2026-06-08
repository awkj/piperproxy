# Prompt 05：Frame Composer（WebSocket 帧重放）

> 先读 `biz/webui/htdocs-next/PROMPTS/00-shared-context.md`。
> 同时建议浏览 `CLAUDE.md` 和 `docs/ARCHITECTURE.md`（仓库根，描述当前重构后的架构）。

## 背景

老前端有完整的 WebSocket 帧抓取/查看/重放功能，新前端目前缺。这是 Composer 之外的第二个"主动出击"工具：

- **HTTP Composer**（已实装于 `features/composer/ComposerPanel.tsx`）：构造 HTTP 请求并发送一次。
- **Frame Composer**（你要做的）：连上一个 WebSocket，发送/接收文本帧或二进制帧，看时序。

老实现散在：`biz/webui/htdocs/src/js/{frame-composer,frame-list,frame-data,frame-modal,frames}.js`。

## 目标

新增独立顶层 tab **"Frame"**，模块路径 `htdocs-next/src/features/frames/`，提供：

1. **连接控制**：URL 输入（`ws://` / `wss://`） + Connect / Disconnect + 当前状态指示（CONNECTING / OPEN / CLOSED + 错误显示）。
2. **发送帧**：text/binary（base64 hex 输入即可）二选一 + body 编辑器（用 `<CodeView language="json/text">`） + Send 按钮。
3. **帧日志**：双向帧的时间序列列表（虚拟列表，参考 `features/network/NetworkList.tsx`）。每行：方向（↓ 收 / ↑ 发）、时间戳、opcode、size、预览。点击展开看完整 payload。
4. **暂停/继续**接收（不影响连接）。
5. **清空日志**。
6. **保存常用帧**（可选）：localStorage 存几个 named template，点击塞进发送区。如果时间紧，留 TODO。

> 这个 tab **不依赖任何 cgi-bin 接口**——前端浏览器直接 `new WebSocket(url)`。所以也不需要改 `api/`。但代理流量经过 whistle 时，whistle 后端会自动捕获，可在 Network tab 看到对应 WS 连接。

## 落地步骤

### 1. 加 tab

`src/store/ui.ts`：`TABS` 数组追加 `'frames'`。
`src/components/TopNav.tsx`：`TAB_ICON` 加 `frames: Radio` 或 `Wifi`（lucide）；i18n key `nav.frames`。
`src/App.tsx`：`TAB_PANEL` 加 `frames: FramesPanel`。

### 2. 类型与 store

`src/features/frames/types.ts`：

```ts
export type Direction = 'in' | 'out';
export type FrameKind = 'text' | 'binary' | 'ping' | 'pong' | 'close';

export interface FrameLogEntry {
  id: string;       // crypto.randomUUID() 或 nanoid
  direction: Direction;
  kind: FrameKind;
  timestamp: number;
  size: number;
  preview: string;  // 前 200 字节文本或 hex
  payload: string;  // 完整内容
}
```

`src/store/frames.ts`（Zustand，**不要 persist 整个日志**——爆 localStorage；只 persist 上次 URL）：

```ts
interface FramesState {
  url: string;          setUrl(v: string): void;
  status: 'idle' | 'connecting' | 'open' | 'closed' | 'error';
  error: string | null;
  log: FrameLogEntry[];
  paused: boolean;      togglePaused(): void;
  appendFrame(e: FrameLogEntry): void;
  clearLog(): void;
  setStatus(s: FramesState['status'], err?: string | null): void;
}
```

只 persist `{ url }`，key `w-frames-url`。

### 3. WS 客户端封装

`src/features/frames/useFrameSocket.ts`：

- 一个 hook，接收 store 的 `url`、`paused`、callbacks。
- 内部 ref 持有 `WebSocket | null`。
- `connect()` / `disconnect()` 暴露给 UI。
- `onmessage`：把 `event.data` 包成 `FrameLogEntry`（text 直接存，binary 用 `await blob.text()` 拿 utf-8 fallback + `Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join(' ')` 算 hex）。如果 `paused`，跳过 `appendFrame` 但仍接收（不能 `WebSocket` 层暂停）。
- `onerror`/`onclose` 更新 status。
- 卸载时 `socket.close()`。

```ts
export function useFrameSocket() {
  const { url, paused, appendFrame, setStatus } = useFramesStore();
  const sockRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => { /* … */ }, [url]);
  const disconnect = useCallback(() => { /* … */ }, []);
  const send = useCallback((kind: 'text' | 'binary', body: string) => { /* … */ }, []);

  useEffect(() => () => sockRef.current?.close(), []);
  return { connect, disconnect, send };
}
```

### 4. UI 组件

```
features/frames/
├── FramesPanel.tsx      # 顶层布局：上半发送区，下半日志
├── FramesToolbar.tsx    # URL 输入 + Connect/Disconnect + 状态徽章 + 暂停/清空
├── FramesSender.tsx     # 发送区：kind 切换 + body 编辑器 + Send
├── FramesLog.tsx        # 虚拟列表（@tanstack/react-virtual，参考 NetworkList）
└── FrameDetail.tsx      # 选中行展开看 payload，用 CodeView
```

### 5. i18n key

en-US / zh-CN 同步加：

```json
{
  "nav": { "frames": "Frame" / "WS 帧" },
  "frames": {
    "url": "WebSocket URL",
    "connect": "Connect",
    "disconnect": "Disconnect",
    "status": {
      "idle": "Not connected",
      "connecting": "Connecting…",
      "open": "Connected",
      "closed": "Closed",
      "error": "Error"
    },
    "send": "Send",
    "kind": { "text": "Text", "binary": "Binary (hex)" },
    "body": "Body",
    "log": "Frames",
    "direction": { "in": "Received", "out": "Sent" },
    "clear": "Clear log",
    "pause": "Pause",
    "resume": "Resume",
    "noFrames": "No frames yet",
    "invalidHex": "Invalid hex input"
  }
}
```

zh-CN 用中文。**不要**和 Network 的 i18n key 重复（namespace 隔离开）。

### 6. 二进制 hex 输入解析

在 `FramesSender.tsx` 里，binary 模式下 body 是 hex 字符串（允许空格分隔），转 `Uint8Array` 时严格校验：

```ts
function hexToBytes(hex: string): Uint8Array | null {
  const clean = hex.replace(/\s+/g, '');
  if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2) return null;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i*2, 2), 16);
  return out;
}
```

校验失败 toast 提示 `t('frames.invalidHex')`。

## 验证

```sh
cd biz/webui/htdocs-next
pnpm typecheck   # 必须干净
pnpm build       # 必须通过
pnpm dev         # 浏览器自测：连一个公开 WS（例如 wss://echo.websocket.events 或 ws://127.0.0.1:9001）
```

手动验收：
1. 输入 echo URL → Connect → 状态变 Open。
2. 发文本 "hello" → 日志同时出现 ↑ 和 ↓ 两行。
3. 切到二进制，输入 `48 65 6c 6c 6f` → Send → ↑ 行 size=5。
4. Pause 后再发，↓ 行不再增加；Resume 后恢复。
5. Disconnect → 状态变 Closed，再点 Connect 能重连。
6. 切到别的 tab 再切回，状态保持，但日志可以不保留（reload 行为可接受）。

## 提交

`feat(frames): WebSocket 帧重放面板（Frame Composer）`

## 不要做

- 不要改 `features/composer/`、`features/network/`、`features/rules/`、`features/{plugins,values,https}/` 的任何文件——这些是其他 worktree 的领地，避免合并冲突。
- 不要改 `cgi-bin/`、`lib/`、`bin/`。
- 不要改根 `package.json` 或 `htdocs/`（老前端）。
