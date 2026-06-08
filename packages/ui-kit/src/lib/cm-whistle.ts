// CodeMirror 6 StreamLanguage for the Whistle rules DSL.
// 移植自老前端 biz/webui/htdocs/src/js/rules-mode.js（CM5 defineMode('rules')）。

import { StreamLanguage, type StreamParser } from '@codemirror/language'

const IPV4_PORT_RE =
  /^(?:::(?:ffff:)?)?(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(?::(\d+))?$/
const FULL_IPV6_RE = /^[\da-f]{1,4}(?::[\da-f]{1,4}){7}$/
const SHORT_IPV6_RE = /^[\da-f]{1,4}(?::[\da-f]{1,4}){0,6}$/
const IP_WITH_PORT_RE = /^\[([:\da-f.]+)\](?::(\d+))?$/i
const PLUGIN_VAR_RE = /^%[a-z\d_-]+[=.]/i
const DOT_PATTERN_RE = /^\.[\w-]+(?:[?$]|$)/
const DOT_DOMAIN_RE = /^\.[^./?]+\.[^/?]/

const HOST_RE = /^x?hosts?:\/\//
const HEAD_RE = /^head:\/\//
const WEINRE_RE = /^weinre:\/\//
const PROXY_RE =
  /^x?(?:proxy|https?-proxy|http2https-proxy|https2http-proxy|internal-proxy|internal-https?-proxy):\/\//
const REQ_RE =
  /^(?:referer|auth|ua|forwardedFor|reqCookies|reqDelay|reqSpeed|reqCors|reqHeaders|method|reqType|reqCharset|reqBody|reqPrepend|reqAppend|reqReplace|reqWrite|reqWriteRaw):\/\//
const RES_RE =
  /^(?:resScript|frameScript|resRules|responseFor|resCookies|resHeaders|trailers|replaceStatus|resDelay|resSpeed|resCors|resType|resCharset|cache|attachment|download|resBody|resPrepend|resAppend|css(?:Append|Prepend|Body)?|html(?:Append|Prepend|Body)?|js(?:Append|Prepend|Body)?|resReplace|resMerge|resWrite|resWriteRaw):\/\//
const PARAMS_RE =
  /^(?:urlParams|params|reqMerge|urlReplace|pathReplace):\/\//
const LOG_RE = /^log:\/\//
const STYLE_RE = /^style:\/\//
const FILTER_RE = /^(?:excludeFilter|filter):\/\//
const LINE_PROPS_RE = /^lineProps:\/\//
const PLUGIN_RE =
  /^(?:pipe|sniCallback):\/\/|^(?:plugin|whistle)\.[a-z\d_-]+:\/\//i
const HEADER_REPLACE_RE = /^headerReplace:\/\//
const IGNORE_RE = /^(?:ignore|skip):\/\//
const ENABLE_RE = /^(?:includeFilter|enable):\/\//
const DISABLE_RE = /^disable:\/\//
const CIPHER_RE = /^(?:cipher|tlsOptions):\/\//
const DELETE_RE = /^delete:\/\//
const SOCKS_RE = /^x?socks:\/\//
const PAC_RE = /^pac:\/\//
const RULES_FILE_RE = /^(?:rules?(?:File|Script)|reqScript|reqRules):\/\//
const URL_RE = /^(?:https?|wss?|tunnel):\/\//i
const ANY_RULE_RE = /^[\w.-]+:\/\//i
const LOCAL_PATH_RE = /^[a-z]:(?:\\|\/(?!\/))/i
const ABS_PATH_RE = /^\/[^/]/
const PORT_PATTERN_RE = /^:\d{1,5}$/
const REGEXP_LITERAL_RE = /^\/[^/](.*)\/i?$/
const REGEXP_DOLLAR_RE = /^\$/
const AT_RE = /^@/
const BRACE_RE = /^\{.*\}$/
const ANGLE_RE = /^<.*>$/
const PAREN_RE = /^\(.*\)$/
const WILDCARD_HEAD_RE = /^(?:\$?(?:https?:|wss?:|tunnel:)?\/\/)?([^/?]+)/

type Tag =
  | 'comment'
  | 'keyword'
  | 'atom'
  | 'number'
  | 'string'
  | 'string.special'
  | 'variableName'
  | 'variableName.special'
  | 'attributeName'
  | 'typeName'
  | 'tagName'
  | 'meta'
  | 'propertyName'
  | 'operator'
  | 'invalid'

function isPort(port: string | undefined): boolean {
  if (!port) return true
  const n = Number(port)
  return n > 0 && n <= 65535
}

function isIP(input: string): boolean {
  let str = input
  let port: string | undefined
  const m = IP_WITH_PORT_RE.exec(str)
  if (m) {
    str = m[1]
    port = m[2]
    if (port && !isPort(port)) return false
  }
  const m4 = IPV4_PORT_RE.exec(str)
  if (m4) {
    return port ? true : isPort(m4[1])
  }
  const idx = str.indexOf('::')
  if (idx !== -1) {
    if (str === '::' || str.indexOf('::', idx + 1) !== -1) return false
    const parts = str.split('::', 2)
    str = parts[0] && parts[1] ? parts.join(':') : parts[0] || parts[1]
    return SHORT_IPV6_RE.test(str)
  }
  return FULL_IPV6_RE.test(str)
}

function isWildcard(str: string): boolean {
  const m = WILDCARD_HEAD_RE.exec(str)
  if (!m) return false
  const domain = m[1]
  return (
    domain.indexOf('*') !== -1 ||
    domain.indexOf('~') !== -1 ||
    DOT_DOMAIN_RE.test(domain)
  )
}

function isRegExpLiteral(str: string): boolean {
  return REGEXP_LITERAL_RE.test(str) || REGEXP_DOLLAR_RE.test(str)
}

function isRegUrl(str: string): boolean {
  return /^\^/.test(str) || DOT_PATTERN_RE.test(str)
}

function classifyRule(str: string): Tag | null {
  if (HOST_RE.test(str)) return 'number'
  if (HEAD_RE.test(str)) return 'propertyName'
  if (WEINRE_RE.test(str)) return 'atom'
  if (PROXY_RE.test(str)) return 'tagName'
  if (REQ_RE.test(str)) return 'variableName'
  if (RES_RE.test(str)) return 'typeName'
  if (PARAMS_RE.test(str)) return 'meta'
  if (LOG_RE.test(str)) return 'atom'
  if (STYLE_RE.test(str)) return 'atom'
  if (PLUGIN_RE.test(str)) return 'variableName.special'
  if (HEADER_REPLACE_RE.test(str)) return 'variableName.special'
  if (FILTER_RE.test(str)) return 'invalid'
  if (LINE_PROPS_RE.test(str)) return 'invalid'
  if (IGNORE_RE.test(str)) return 'invalid'
  if (ENABLE_RE.test(str)) return 'atom'
  if (DISABLE_RE.test(str)) return 'invalid'
  if (CIPHER_RE.test(str)) return 'atom'
  if (DELETE_RE.test(str)) return 'invalid'
  if (SOCKS_RE.test(str)) return 'variableName.special'
  if (PAC_RE.test(str)) return 'variableName.special'
  if (RULES_FILE_RE.test(str)) return 'variableName.special'
  if (URL_RE.test(str)) return 'string.special'
  if (isWildcard(str)) return 'attributeName'
  if (ANY_RULE_RE.test(str)) return 'keyword'
  return null
}

function classifyToken(raw: string): Tag | null {
  if (!raw) return null
  const ruleTag = classifyRule(raw)
  if (ruleTag) return ruleTag
  if (isRegExpLiteral(raw)) return 'attributeName'
  if (isRegUrl(raw)) return 'attributeName'
  if (PORT_PATTERN_RE.test(raw)) return 'attributeName'
  if (AT_RE.test(raw)) return 'atom'
  if (PLUGIN_VAR_RE.test(raw)) return 'variableName.special'
  if (isWildcard(raw)) return 'attributeName'
  if (isIP(raw)) return 'number'
  if (BRACE_RE.test(raw) || ANGLE_RE.test(raw) || PAREN_RE.test(raw))
    return 'keyword'
  if (LOCAL_PATH_RE.test(raw) || ABS_PATH_RE.test(raw)) return 'keyword'
  return null
}

interface State {
  inLine: boolean
}

const parser: StreamParser<State> = {
  startState(): State {
    return { inLine: false }
  },

  token(stream, state) {
    if (stream.eatSpace()) return null
    if (stream.match(/^#.*/, true)) return 'comment'
    if (stream.match(/^\$\{[^}]+\}/, true)) return 'variableName.special'
    if (stream.peek() === '`') {
      stream.next()
      stream.eatWhile((ch) => ch !== '`')
      stream.eat('`')
      return 'string'
    }
    if (stream.peek() === '!') {
      stream.next()
      return 'operator'
    }
    let tok = ''
    while (!stream.eol()) {
      const ch = stream.peek()
      if (!ch) break
      if (/\s/.test(ch) || ch === '#') break
      tok += ch
      stream.next()
    }
    if (!tok) {
      stream.next()
      return null
    }
    state.inLine = true
    return classifyToken(tok)
  },

  blankLine(state) {
    state.inLine = false
  },

  languageData: {
    commentTokens: { line: '#' },
  },
}

export const whistleLang = StreamLanguage.define(parser)
