// 前端 RuleName 常量，与后端 `lib/rules/protocols.js` 保持一致。
//
// 来源：`lib/rules/protocols.js` 的 `protocols` 数组及 `aliasProtocols` 映射。
// 由于 `lib/` 是后端代码，前端 bundle 不引用，这里维护一份镜像。
// **如果后端 protocols.js 增删 RuleName，需要同步更新此文件。**

/** 内置 RuleName（不含别名） */
export const PROTOCOLS: readonly string[] = [
  'G',
  'style',
  'host',
  'rule',
  'pipe',
  'weinre',
  'proxy',
  'https2http-proxy',
  'http2https-proxy',
  'internal-proxy',
  'pac',
  'filter',
  'ignore',
  'enable',
  'disable',
  'delete',
  'log',
  'plugin',
  'referer',
  'auth',
  'ua',
  'urlParams',
  'params',
  'resMerge',
  'replaceStatus',
  'method',
  'cache',
  'attachment',
  'forwardedFor',
  'responseFor',
  'rulesFile',
  'resScript',
  'frameScript',
  'reqDelay',
  'resDelay',
  'headerReplace',
  'reqSpeed',
  'resSpeed',
  'reqType',
  'resType',
  'reqCharset',
  'resCharset',
  'reqCookies',
  'resCookies',
  'reqCors',
  'resCors',
  'reqHeaders',
  'resHeaders',
  'trailers',
  'reqPrepend',
  'resPrepend',
  'reqBody',
  'resBody',
  'reqAppend',
  'resAppend',
  'urlReplace',
  'reqReplace',
  'resReplace',
  'reqWrite',
  'resWrite',
  'reqWriteRaw',
  'resWriteRaw',
  'cssAppend',
  'htmlAppend',
  'jsAppend',
  'cssBody',
  'htmlBody',
  'jsBody',
  'cssPrepend',
  'htmlPrepend',
  'jsPrepend',
  'cipher',
  'sniCallback',
];

/** 别名 -> 真实 RuleName。补全里把别名也作为候选项展示。 */
export const ALIAS_PROTOCOLS: Readonly<Record<string, string>> = {
  ruleFile: 'rulesFile',
  ruleScript: 'rulesFile',
  rulesScript: 'rulesFile',
  reqScript: 'rulesFile',
  reqRules: 'rulesFile',
  resRules: 'resScript',
  pathReplace: 'urlReplace',
  download: 'attachment',
  skip: 'ignore',
  'http-proxy': 'proxy',
  'xhttp-proxy': 'xproxy',
  hosts: 'host',
  xhost: 'host',
  html: 'htmlAppend',
  js: 'jsAppend',
  reqMerge: 'params',
  tlsOptions: 'cipher',
  css: 'cssAppend',
  excludeFilter: 'filter',
  includeFilter: 'filter',
  P: 'G',
};

/** 仅响应阶段生效的 RuleName。 */
export const PURE_RES_PROTOCOLS: readonly string[] = [
  'replaceStatus',
  'cache',
  'attachment',
  'resMerge',
  'resDelay',
  'resSpeed',
  'resType',
  'resCharset',
  'resCookies',
  'resCors',
  'resHeaders',
  'trailers',
  'resPrepend',
  'resBody',
  'resAppend',
  'resReplace',
  'resWrite',
  'resWriteRaw',
  'cssAppend',
  'htmlAppend',
  'jsAppend',
  'cssBody',
  'htmlBody',
  'jsBody',
  'cssPrepend',
  'htmlPrepend',
  'jsPrepend',
  'responseFor',
  'log',
  'weinre',
];

/** RuleName 在补全 UI 上的分类（用于 detail 文案 / 可视化分组）。 */
export type RuleCategory =
  | 'host'
  | 'req'
  | 'res'
  | 'proxy'
  | 'plugin'
  | 'filter'
  | 'control'
  | 'misc';

const HOST_NAMES = new Set(['host', 'hosts', 'xhost']);
const PROXY_NAMES = new Set([
  'proxy',
  'http-proxy',
  'xhttp-proxy',
  'https2http-proxy',
  'http2https-proxy',
  'internal-proxy',
  'pac',
  'sniCallback',
]);
const FILTER_NAMES = new Set(['filter', 'includeFilter', 'excludeFilter']);
const CONTROL_NAMES = new Set([
  'enable',
  'disable',
  'ignore',
  'skip',
  'delete',
  'rule',
  'G',
  'P',
  'pipe',
  'cipher',
  'tlsOptions',
  'style',
  'log',
  'weinre',
  'lineProps',
]);
const PLUGIN_NAMES = new Set(['plugin']);

/** 把 RuleName 归类，未知一律 misc。 */
export function classifyRuleName(name: string): RuleCategory {
  if (HOST_NAMES.has(name)) return 'host';
  if (PROXY_NAMES.has(name)) return 'proxy';
  if (FILTER_NAMES.has(name)) return 'filter';
  if (CONTROL_NAMES.has(name)) return 'control';
  if (PLUGIN_NAMES.has(name)) return 'plugin';
  if (PURE_RES_PROTOCOLS.includes(name) || /^res|^css|^html|^js/.test(name))
    return 'res';
  if (
    name.startsWith('req') ||
    name === 'method' ||
    name === 'referer' ||
    name === 'auth' ||
    name === 'ua' ||
    name === 'forwardedFor' ||
    name === 'urlParams' ||
    name === 'params' ||
    name === 'urlReplace' ||
    name === 'pathReplace' ||
    name === 'rulesFile' ||
    name === 'reqScript' ||
    name === 'reqRules' ||
    name === 'frameScript' ||
    name === 'rulesScript'
  )
    return 'req';
  return 'misc';
}

/** 所有候选 RuleName（含别名），按字母排序。 */
export function getAllRuleNames(): string[] {
  const set = new Set<string>(PROTOCOLS);
  for (const alias of Object.keys(ALIAS_PROTOCOLS)) set.add(alias);
  return Array.from(set).toSorted((a, b) => a.localeCompare(b));
}
