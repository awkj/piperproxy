// 协议子选项 hint 数据，镜像自老栈 `biz/webui/htdocs/src/js/rules-hint.js`：
//
//  - FILTERS：filter:// / includeFilter:// / excludeFilter:// 后允许的过滤项
//  - HEADERS：headerReplace:// 后的 header 替换模式
//  - DEL_HINTS：delete:// 后的删除目标
//  - LINE_PROPS_HINTS：lineProps:// 行属性
//  - ENABLE_HINTS / DISABLE_HINTS：enable:// / disable:// 开关项
//
// 与老栈数据保持一致；如老栈补充新项，此文件需要同步。

export const FILTER_HINTS: readonly string[] = [
  '<keyword or regex for URL>',
  'm:<keyword or regex for HTTP method>',
  'b:<keyword or regex for request body>',
  's:<keyword or regex for response status code>',
  'clientIp:<keyword or regex for client IP address>',
  'serverIp:<keyword or regex for server IP address>',
  'chance:<probability between 0 and 1>',
  'reqH.header-key:<keyword or regex for request header value>',
  'resH.header-key:<keyword or regex for response header value>',
];

export const HEADER_REPLACE_HINTS: readonly string[] = [
  'reqH.header-key:(keyword|regex)=<replacement>',
  'resH.header-key:(keyword|regex)=<replacement>',
  'trailer.header-key:(keyword|regex)=<replacement>',
];

export const DEL_HINTS: readonly string[] = [
  'pathname.<index>',
  'urlParams.<param-key>',
  'reqHeaders.<header-key>',
  'resHeaders.<header-key>',
  'reqCookies.<cookie-key>',
  'resCookies.<cookie-key>',
  'reqBody.<key.path>',
  'resBody.<key.path>',
  'pathname',
  'urlParams',
  'reqType',
  'resType',
  'reqCharset',
  'resCharset',
  'reqBody',
  'resBody',
];

export const LINE_PROPS_HINTS: readonly string[] = [
  'important',
  'safeHtml',
  'strictHtml',
  'disableAutoCors',
  'disableUserLogin',
  'enableUserLogin',
  'internal',
  'internalOnly',
  'internalProxy',
  'proxyFirst',
  'proxyHost',
  'proxyHostOnly',
  'proxyTunnel',
  'weakRule',
  'enableBigData',
];

export const ENABLE_HINTS: readonly string[] = [
  'abort',
  'abortReq',
  'abortRes',
  'authCapture',
  'auto2http',
  'bigData',
  'br',
  'gzip',
  'deflate',
  'capture',
  'captureIp',
  'captureStream',
  'clientCert',
  'clientId',
  'clientIp',
  'customParser',
  'flushHeaders',
  'forHttp',
  'forHttps',
  'forceReqWrite',
  'forceResWrite',
  'h2',
  'http2',
  'httpH2',
  'hide',
  'hideComposer',
  'hideCaptureError',
  'showHost',
  'ignoreSend',
  'ignoreReceive',
  'pauseSend',
  'pauseReceive',
  'inspect',
  'interceptConsole',
  'internalProxy',
  'proxyFirst',
  'proxyHost',
  'proxyTunnel',
  'keepCSP',
  'keepAllCSP',
  'keepCache',
  'keepAllCache',
  'keepClientId',
  'safeHtml',
  'strictHtml',
  'multiClient',
  'reqMergeBigData',
  'resMergeBigData',
  'requestWithMatchedRules',
  'responseWithMatchedRules',
  'tunnelHeadersFirst',
  'useLocalHost',
  'useSafePort',
  'userLogin',
  'weakRule',
  'socket',
  'websocket',
];

export const DISABLE_HINTS: readonly string[] = [
  '301',
  'abort',
  'abortReq',
  'abortRes',
  'authCapture',
  'auto2http',
  'autoCors',
  'ajax',
  'bigData',
  'capture',
  'captureIp',
  'captureStream',
  'clientCert',
  'clientId',
  'clientIp',
  'customParser',
  'cache',
  'dnsCache',
  'csp',
  'cookies',
  'reqCookies',
  'resCookies',
  'flushHeaders',
  'forHttp',
  'forHttps',
  'forceReqWrite',
  'forceResWrite',
  'gzip',
  'h2',
  'http2',
  'httpH2',
  'hide',
  'hideComposer',
  'hideCaptureError',
  'interceptConsole',
  'internalProxy',
  'proxyFirst',
  'proxyHost',
  'proxyTunnel',
  'keepCSP',
  'keepAllCSP',
  'keepCache',
  'keepAllCache',
  'keepAlive',
  'keepClientId',
  'keepH2Session',
  'safeHtml',
  'strictHtml',
  'multiClient',
  'proxyConnection',
  'ua',
  'proxyUA',
  'referer',
  'rejectUnauthorized',
  'reqMergeBigData',
  'resMergeBigData',
  'requestWithMatchedRules',
  'responseWithMatchedRules',
  'secureOptions',
  'servername',
  'timeout',
  'trailerHeader',
  'trailers',
  'tunnelAuthHeader',
  'tunnelHeadersFirst',
  'useLocalHost',
  'useSafePort',
  'userLogin',
  'weakRule',
];

/** 协议头 -> 子选项 hint 列表 + i18n key（用于 detail 文案）。 */
export interface SubHintGroup {
  /** 完整协议头，包括 `://`。 */
  readonly protocol: string;
  /** 候选子项数组。 */
  readonly hints: readonly string[];
  /** detail 分类 key（i18n `rules.hints.*` 下的子键）。 */
  readonly category:
    | 'filter'
    | 'header'
    | 'delete'
    | 'lineProps'
    | 'enable'
    | 'disable';
}

/**
 * 接受协议头 hint 触发的 RuleName 列表。注意：`filter://` / `includeFilter://`
 * / `excludeFilter://` 共享 FILTER_HINTS；几个别名也归到这里。
 */
export const SUB_HINT_GROUPS: readonly SubHintGroup[] = [
  { protocol: 'filter://', hints: FILTER_HINTS, category: 'filter' },
  { protocol: 'includeFilter://', hints: FILTER_HINTS, category: 'filter' },
  { protocol: 'excludeFilter://', hints: FILTER_HINTS, category: 'filter' },
  { protocol: 'headerReplace://', hints: HEADER_REPLACE_HINTS, category: 'header' },
  { protocol: 'delete://', hints: DEL_HINTS, category: 'delete' },
  { protocol: 'lineProps://', hints: LINE_PROPS_HINTS, category: 'lineProps' },
  { protocol: 'enable://', hints: ENABLE_HINTS, category: 'enable' },
  { protocol: 'disable://', hints: DISABLE_HINTS, category: 'disable' },
];

/** 子选项分类的 UI 文案。 */
export type SubHintCategory = SubHintGroup['category'];
export type SubHintLabels = Readonly<Record<SubHintCategory, string>>;

export const DEFAULT_SUB_HINT_LABELS: SubHintLabels = {
  filter: 'filter',
  header: 'header replace',
  delete: 'delete target',
  lineProps: 'line property',
  enable: 'enable',
  disable: 'disable',
};

/** 变量补全分类。 */
export type VarHintCategory = 'value' | 'plugin' | 'pluginVar';
export type VarHintLabels = Readonly<Record<VarHintCategory, string>>;

export const DEFAULT_VAR_HINT_LABELS: VarHintLabels = {
  value: 'value',
  plugin: 'plugin',
  pluginVar: 'plugin var',
};
