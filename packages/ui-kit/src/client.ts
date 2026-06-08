// PiperApiClient 是 docs/ECOSYSTEM-PLAN.md §4.1 中 "组件不写死 fetch URL" 的注入边界。
//
// 首版只声明本 plan stage C 真正用到的方法 + 一个 baseUrl 用于派生 SSE / WebSocket URL。
// 后续 Stage D/E 抽组件（NetworkList / RulesEditor / HttpsPanel 等）时按需扩展，
// 但 baseUrl + get + post 三件套是稳定承诺。
//
// piper 自身在 web/ 用 createDefaultClient({ baseUrl: '/' }) 走同源相对路径；
// piper-cloud 控制面用 createDefaultClient({ baseUrl: 'https://...' }) 走绝对 URL。

import ky, { type KyInstance } from 'ky';

export interface PiperApiClient {
  /** 基础 URL（可以是 "/" 或 "https://example.com"），用于派生 EventSource / WebSocket 这类 fetch 之外的 URL。 */
  baseUrl: string;
  /** 标准 fetch 风格 GET，返回解析后的 JSON。 */
  get<T>(path: string): Promise<T>;
  /** 标准 fetch 风格 POST。body 会序列化为 JSON。 */
  post<T>(path: string, body?: unknown): Promise<T>;
  /**
   * 底层 ky 实例（host app 旧代码兼容用）。
   * 新代码不应依赖；ui-kit 内部组件不会用这个字段。
   * Stage D/E 之后可以考虑去掉。
   */
  raw: KyInstance;
}

export interface DefaultClientOptions {
  /** 默认 "/" = 同源相对路径。绝对 URL 必须以 "/" 结尾，方便拼路径。 */
  baseUrl?: string;
  /** ?authorization=xxx → 头部 x-whistle-auth；保持 piper 当前行为。 */
  authToken?: string;
  /** 自定义 fetch 钩子；piper-cloud 可在这里塞租户 token / 审计头等。 */
  beforeRequest?: (request: Request) => void | Promise<void>;
}

/** 把 baseUrl 末尾的斜杠规范化掉，避免 "//api/x" 双斜杠。 */
function trimTrailingSlash(s: string): string {
  if (s === '/' || s === '') return '';
  return s.endsWith('/') ? s.slice(0, -1) : s;
}

function joinPath(baseUrl: string, path: string): string {
  const base = trimTrailingSlash(baseUrl);
  if (!path.startsWith('/')) path = `/${path}`;
  return `${base}${path}`;
}

export function createDefaultClient(opts: DefaultClientOptions = {}): PiperApiClient {
  const baseUrl = opts.baseUrl ?? '/';
  const authToken = opts.authToken;

  const raw = ky.create({
    prefixUrl: baseUrl === '/' ? '/' : baseUrl,
    timeout: 30_000,
    retry: { limit: 1 },
    hooks: {
      beforeRequest: [
        (request) => {
          if (authToken) request.headers.set('x-whistle-auth', authToken);
        },
        ...(opts.beforeRequest ? [opts.beforeRequest] : []),
      ],
    },
  });

  // ky 的 prefixUrl 要求 path 不带前导 "/"；统一在调用处剥一下。
  const stripLeadingSlash = (p: string) => (p.startsWith('/') ? p.slice(1) : p);

  return {
    baseUrl,
    raw,
    get<T>(path: string) {
      return raw.get(stripLeadingSlash(path)).json<T>();
    },
    post<T>(path: string, body?: unknown) {
      const init: { json?: unknown } = {};
      if (body !== undefined) init.json = body;
      return raw.post(stripLeadingSlash(path), init).json<T>();
    },
  };
}

/** 给 ui-kit 内部和 host 都能用的工具：在 baseUrl 上拼一个绝对 URL（用于 EventSource / WebSocket）。 */
export function resolveAbsoluteUrl(client: PiperApiClient, path: string): string {
  if (client.baseUrl === '/' || client.baseUrl === '') {
    // 同源相对：让浏览器自己 resolve。
    return path.startsWith('/') ? path : `/${path}`;
  }
  return joinPath(client.baseUrl, path);
}
