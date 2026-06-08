import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import JsonView from '@uiw/react-json-view'
import { CodeView, detectLanguage, type CodeLang } from '../CodeView'
import { MethodBadge } from '../MethodBadge'
import { cn } from '../../lib/cn'
import type { NetworkItem } from '../../types'
import { usePiperApi } from '../../context'
import { resolveAbsoluteUrl } from '../../client'

interface Props {
  item?: NetworkItem
  /** 注入到详情区域底部的额外内容，供宿主扩展（如请求溯源、安全分析面板）。 */
  detailFooter?: (item: NetworkItem | undefined) => React.ReactNode
}

type ReqTab = 'headers' | 'query' | 'body' | 'raw' | 'cookies'
type RespTab = 'headers' | 'body' | 'raw' | 'cookies' | 'preview'

const REQ_TABS: ReqTab[] = ['headers', 'query', 'body', 'raw', 'cookies']
const RESP_TABS: RespTab[] = ['headers', 'body', 'raw', 'cookies', 'preview']

function getContentType(headers?: Record<string, string>): string {
  if (!headers) return ''
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === 'content-type') return v
  }
  return ''
}
function isJsonCT(h?: Record<string, string>) {
  return /\bjson\b/i.test(getContentType(h))
}
function isImageCT(h?: Record<string, string>) {
  return /^image\//i.test(getContentType(h).trim())
}
function isHtmlCT(h?: Record<string, string>) {
  return /\bhtml\b/i.test(getContentType(h))
}
function isFormUrlEncoded(h?: Record<string, string>) {
  return /x-www-form-urlencoded/i.test(getContentType(h))
}
function isMultipart(h?: Record<string, string>) {
  return /multipart\/form-data/i.test(getContentType(h))
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function parseCookieHeader(val: string): Array<[string, string]> {
  return val
    .split(';')
    .map((p) => {
      const idx = p.indexOf('=')
      if (idx < 0) return [p.trim(), ''] as [string, string]
      return [p.slice(0, idx).trim(), p.slice(idx + 1).trim()] as [string, string]
    })
    .filter(([k]) => k.length > 0)
}

function parseSetCookieHeader(val: string): Array<[string, string]> {
  const first = val.split(';')[0]?.trim() ?? ''
  const idx = first.indexOf('=')
  if (idx < 0) return [[first, '']] as Array<[string, string]>
  return [[first.slice(0, idx), first.slice(idx + 1)]] as Array<[string, string]>
}

function reconstructRawRequest(item: NetworkItem): string {
  const { req, url } = item
  try {
    const u = new URL(url)
    const pathAndQuery = `${u.pathname}${u.search}`
    const method = req.method ?? item.method ?? 'GET'
    let raw = `${method} ${pathAndQuery} HTTP/1.1\r\n`
    const headers = req.headers ?? {}
    for (const [k, v] of Object.entries(headers)) raw += `${k}: ${v}\r\n`
    raw += '\r\n'
    if (req.body) raw += req.body
    return raw
  } catch {
    return '(could not reconstruct raw request)'
  }
}

function reconstructRawResponse(item: NetworkItem): string {
  const { res } = item
  if (!res) return '(no response yet)'
  const status = res.statusCode ?? 0
  const msg = res.statusMessage ?? ''
  let raw = `HTTP/1.1 ${status} ${msg}\r\n`
  const headers = res.headers ?? {}
  for (const [k, v] of Object.entries(headers)) raw += `${k}: ${v}\r\n`
  raw += '\r\n'
  if (res.body) raw += res.body
  return raw
}

function KvTable({ rows }: { rows: Array<[string, string]> }) {
  if (rows.length === 0) return null
  return (
    <table className="w-full text-xs">
      <tbody>
        {rows.map(([k, v], i) => (
          <tr key={i} className="border-b border-neutral-100">
            <td className="w-1/3 align-top px-3 py-1.5 font-medium text-neutral-700 break-all">
              {k}
            </td>
            <td className="break-all px-3 py-1.5 text-neutral-600">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function HeaderTable({ headers, search }: { headers?: Record<string, string>; search: string }) {
  if (!headers || Object.keys(headers).length === 0) return null
  const rows = Object.entries(headers).filter(
    ([k, v]) =>
      !search ||
      k.toLowerCase().includes(search.toLowerCase()) ||
      v.toLowerCase().includes(search.toLowerCase()),
  )
  if (rows.length === 0) return null
  return (
    <table className="w-full text-xs">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-b border-neutral-100">
            <td className="w-1/3 align-top px-3 py-1.5 font-medium text-neutral-700 break-all">
              {k}
            </td>
            <td className="break-all px-3 py-1.5 text-neutral-600">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

type BodyMode = 'pretty' | 'raw'

function BodyModeToggle({
  mode,
  setMode,
  t,
}: {
  mode: BodyMode
  setMode: (m: BodyMode) => void
  t: (k: string) => string
}) {
  return (
    <div className="flex gap-0.5 rounded border border-neutral-200 bg-neutral-50 p-0.5 text-[11px]">
      {(['pretty', 'raw'] as BodyMode[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => setMode(m)}
          className={cn(
            'rounded px-2 py-0.5 transition-colors',
            mode === m
              ? 'bg-white font-medium text-neutral-900 shadow-sm'
              : 'text-neutral-500 hover:text-neutral-800',
          )}
        >
          {t(`network.detail.bodyMode.${m}`)}
        </button>
      ))}
    </div>
  )
}

interface LazyBodyProps {
  inlineBody?: string
  fetchUrl: string
  language: CodeLang
  t: (k: string) => string
  jsonCapable?: boolean
  truncated?: boolean
  encoding?: string
  mode: BodyMode
  setMode: (m: BodyMode) => void
}

function LazyBody({
  inlineBody,
  fetchUrl,
  language,
  t,
  jsonCapable,
  truncated,
  encoding,
  mode,
  setMode,
}: LazyBodyProps) {
  const [fetched, setFetched] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [errored, setErrored] = useState(false)
  const triggered = useRef(false)

  if (inlineBody) {
    return (
      <BodyView
        body={inlineBody}
        language={language}
        t={t}
        jsonCapable={jsonCapable}
        truncated={truncated}
        encoding={encoding}
        mode={mode}
        setMode={setMode}
      />
    )
  }
  if (fetched !== null) {
    return (
      <BodyView
        body={fetched || undefined}
        language={language}
        t={t}
        jsonCapable={jsonCapable}
        truncated={truncated}
        encoding={encoding}
        mode={mode}
        setMode={setMode}
      />
    )
  }
  if (errored) {
    return <div className="p-4 text-xs text-red-500">{t('network.detail.loadBodyFailed')}</div>
  }
  if (!triggered.current) {
    triggered.current = true
    setLoading(true)
    fetch(fetchUrl)
      .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
      .then((text) => {
        setFetched(text)
        setLoading(false)
      })
      .catch(() => {
        setErrored(true)
        setLoading(false)
      })
  }
  if (loading) {
    return (
      <div className="flex h-24 items-center justify-center text-xs text-neutral-400">
        {t('common.loading')}
      </div>
    )
  }
  return null
}

function BodyView({
  body,
  language,
  t,
  jsonCapable,
  truncated,
  encoding,
  mode,
  setMode,
}: {
  body?: string
  language: CodeLang
  t: (k: string) => string
  jsonCapable?: boolean
  truncated?: boolean
  encoding?: string
  mode: BodyMode
  setMode: (m: BodyMode) => void
}) {
  const [parseError, setParseError] = useState<string | null>(null)

  const parsed = useMemo(() => {
    if (!body || !jsonCapable || mode !== 'pretty') {
      setParseError(null)
      return null
    }
    try {
      const v = JSON.parse(body)
      setParseError(null)
      return v
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err))
      return null
    }
  }, [body, mode, jsonCapable])

  if (!body) {
    return <div className="p-4 text-xs text-neutral-400">{t('network.detail.noBody')}</div>
  }

  const enc = (encoding || '').toLowerCase().trim()
  const unsupportedEnc =
    enc && !['', 'identity', 'gzip', 'x-gzip', 'deflate', 'br', 'zstd'].includes(enc)

  const showJsonView = mode === 'pretty' && jsonCapable && parsed !== null
  void setMode

  return (
    <div className="relative flex h-full flex-col">
      {(truncated || unsupportedEnc || parseError) && (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-1 text-[11px] text-amber-800">
          {truncated && (
            <span>⚠ 此 body 已被截断（超过 8 MiB），请用 cURL / 新窗口查看完整内容。</span>
          )}
          {unsupportedEnc && (
            <span className="ml-2">⚠ 不支持的压缩格式 {enc}，展示的是原始字节。</span>
          )}
          {parseError && (
            <span className="ml-2">⚠ JSON 格式化失败：{parseError}（已退回原始视图）</span>
          )}
        </div>
      )}
      <div className="flex-1 overflow-auto">
        {showJsonView ? (
          <div className="p-2 text-[12px]">
            <JsonView
              value={parsed as object}
              displayDataTypes={false}
              displayObjectSize={false}
              enableClipboard={false}
              collapsed={2}
              indentWidth={30}
              style={{
                background: 'transparent',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
            />
          </div>
        ) : (
          <CodeView value={body} language={language} readOnly height="100%" lineWrapping />
        )}
      </div>
    </div>
  )
}

function PaneTabBar<T extends string>({
  side,
  tabs,
  active,
  onChange,
  t,
  rightSlot,
}: {
  side: 'req' | 'resp'
  tabs: readonly T[]
  active: T
  onChange: (v: T) => void
  t: (k: string) => string
  rightSlot?: React.ReactNode
}) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-neutral-200 bg-neutral-50/60 px-3 py-1.5 text-xs">
      <span className="font-semibold text-neutral-900">
        {t(side === 'req' ? 'network.detail.requestPane' : 'network.detail.responsePane')}
      </span>
      <div className="flex flex-1 items-center gap-2 overflow-x-auto">
        {tabs.map((tabId) => (
          <button
            key={tabId}
            type="button"
            onClick={() => onChange(tabId)}
            className={cn(
              'shrink-0 rounded px-1 py-0.5 transition-colors',
              active === tabId
                ? 'font-medium text-brand-600'
                : 'text-neutral-500 hover:text-neutral-800',
            )}
          >
            {t(`network.detail.${tabId}`)}
          </button>
        ))}
      </div>
      {rightSlot}
    </div>
  )
}

function ImageBody({
  fetchUrl,
  contentType,
  size,
  t,
}: {
  fetchUrl: string
  contentType: string
  size?: number
  t: (k: string) => string
}) {
  const [errored, setErrored] = useState(false)
  if (errored) {
    return <div className="p-4 text-xs text-red-500">{t('network.detail.loadBodyFailed')}</div>
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto bg-neutral-100 p-3">
        <img
          src={fetchUrl}
          alt=""
          onError={() => setErrored(true)}
          className="mx-auto max-h-full max-w-full bg-[conic-gradient(at_25%_25%,_#eee_25%,_white_0_50%,_#eee_0_75%,_white_0)] bg-[length:16px_16px] object-contain shadow-sm"
        />
      </div>
      <div className="border-t border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[11px] text-neutral-500">
        {contentType}
        {typeof size === 'number' && size > 0 ? ` · ${formatBytes(size)}` : ''}
      </div>
    </div>
  )
}

export function NetworkDetail({ item, detailFooter }: Props) {
  const { t } = useTranslation()
  const client = usePiperApi()
  const [reqTab, setReqTab] = useState<ReqTab>('query')
  const [respTab, setRespTab] = useState<RespTab>('body')
  const [reqBodyMode, setReqBodyMode] = useState<BodyMode>('pretty')
  const [respBodyMode, setRespBodyMode] = useState<BodyMode>('pretty')
  const [headerSearch, setHeaderSearch] = useState('')

  const reqLang = useMemo(
    () => detectLanguage(item?.req?.headers?.['content-type']),
    [item],
  )
  const respLang = useMemo(
    () => detectLanguage(item?.res?.headers?.['content-type']),
    [item],
  )

  const reqCookies: Array<[string, string]> = useMemo(() => {
    if (!item) return []
    const val = Object.entries(item.req?.headers ?? {}).find(
      ([k]) => k.toLowerCase() === 'cookie',
    )?.[1]
    return val ? parseCookieHeader(val) : []
  }, [item])

  const respCookies: Array<[string, string]> = useMemo(() => {
    if (!item) return []
    const pairs: Array<[string, string]> = []
    for (const [k, v] of Object.entries(item.res?.headers ?? {})) {
      if (k.toLowerCase() === 'set-cookie') {
        pairs.push(...parseSetCookieHeader(v))
      }
    }
    return pairs
  }, [item])

  const queryParams: Array<[string, string]> = useMemo(() => {
    if (!item) return []
    try {
      const u = new URL(item.url)
      return Array.from(u.searchParams.entries())
    } catch {
      return []
    }
  }, [item])

  const formData: Array<[string, string]> | null = useMemo(() => {
    if (!item) return null
    const body = item.req?.body
    if (!body) return null
    if (isFormUrlEncoded(item.req?.headers)) {
      try {
        return Array.from(new URLSearchParams(body).entries())
      } catch {
        return null
      }
    }
    return null
  }, [item])

  if (!item) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-400">
        {t('network.detail.selectRequest')}
      </div>
    )
  }

  const hasReqBody = !!item.req?.body || (item.req?.size ?? 0) > 0
  const hasRespBody = !!item.res?.body || (item.res?.size ?? 0) > 0

  const statusCode = item.res?.statusCode
  const statusColor = statusCode
    ? statusCode >= 500
      ? 'bg-red-100 text-red-700'
      : statusCode >= 400
        ? 'bg-amber-100 text-amber-700'
        : statusCode >= 300
          ? 'bg-sky-100 text-sky-700'
          : 'bg-emerald-100 text-emerald-700'
    : 'bg-neutral-100 text-neutral-500'

  const reqBodyUrl = resolveAbsoluteUrl(
    client,
    `api/captures/${encodeURIComponent(item.id)}/req/body`,
  )
  const resBodyUrl = resolveAbsoluteUrl(
    client,
    `api/captures/${encodeURIComponent(item.id)}/res/body`,
  )

  return (
    <>
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-neutral-100 bg-white px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <MethodBadge method={item.method ?? 'GET'} />
          {statusCode && (
            <span
              className={cn(
                'shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                statusColor,
              )}
            >
              {statusCode}
              {item.res?.statusMessage ? ` ${item.res.statusMessage}` : ''}
            </span>
          )}
          <span
            className="min-w-0 flex-1 truncate font-mono text-[11px] text-neutral-500"
            title={item.url}
          >
            {item.url}
          </span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Request */}
        <div className="flex flex-1 flex-col overflow-hidden border-r border-neutral-200">
          <PaneTabBar
            side="req"
            tabs={REQ_TABS}
            active={reqTab}
            onChange={setReqTab}
            t={t}
            rightSlot={
              reqTab === 'body' && isJsonCT(item.req?.headers) ? (
                <BodyModeToggle mode={reqBodyMode} setMode={setReqBodyMode} t={t} />
              ) : undefined
            }
          />
          {reqTab === 'headers' && (
            <div className="shrink-0 border-b border-neutral-100 bg-white px-3 py-1.5">
              <input
                type="text"
                value={headerSearch}
                onChange={(e) => setHeaderSearch(e.target.value)}
                placeholder={t('network.detail.searchHeaders')}
                className="h-6 w-full rounded border border-neutral-300 bg-white px-2 text-[11px] focus:border-brand-500 focus:outline-none"
              />
            </div>
          )}
          <div className="flex-1 overflow-auto">
            {reqTab === 'headers' &&
              (Object.keys(item.req?.headers ?? {}).length > 0 ? (
                <HeaderTable headers={item.req?.headers} search={headerSearch} />
              ) : (
                <div className="p-3 text-xs text-neutral-400">—</div>
              ))}
            {reqTab === 'query' &&
              (queryParams.length === 0 ? (
                <div className="p-3 text-xs text-neutral-400">{t('network.detail.noQuery')}</div>
              ) : (
                <KvTable rows={queryParams} />
              ))}
            {reqTab === 'body' &&
              (!hasReqBody ? (
                <div className="p-3 text-xs text-neutral-400">{t('network.detail.noBody')}</div>
              ) : isImageCT(item.req?.headers) ? (
                <ImageBody
                  key={item.id + '-req-img'}
                  fetchUrl={reqBodyUrl}
                  contentType={getContentType(item.req?.headers)}
                  size={item.req?.size}
                  t={t}
                />
              ) : (isFormUrlEncoded(item.req?.headers) || isMultipart(item.req?.headers)) &&
                formData &&
                formData.length > 0 ? (
                <KvTable rows={formData} />
              ) : (
                <LazyBody
                  key={item.id + '-req'}
                  inlineBody={item.req?.body}
                  fetchUrl={reqBodyUrl}
                  language={reqLang}
                  t={t}
                  jsonCapable={isJsonCT(item.req?.headers)}
                  truncated={item.req?.truncated}
                  encoding={item.req?.headers?.['content-encoding']}
                  mode={reqBodyMode}
                  setMode={setReqBodyMode}
                />
              ))}
            {reqTab === 'raw' && (
              <CodeView value={reconstructRawRequest(item)} language="text" readOnly height="100%" />
            )}
            {reqTab === 'cookies' &&
              (reqCookies.length === 0 ? (
                <div className="p-3 text-xs text-neutral-400">{t('network.detail.noCookies')}</div>
              ) : (
                <KvTable rows={reqCookies} />
              ))}
          </div>
        </div>

        {/* Response */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <PaneTabBar
            side="resp"
            tabs={RESP_TABS}
            active={respTab}
            onChange={setRespTab}
            t={t}
            rightSlot={
              respTab === 'body' && isJsonCT(item.res?.headers) ? (
                <BodyModeToggle mode={respBodyMode} setMode={setRespBodyMode} t={t} />
              ) : undefined
            }
          />
          {respTab === 'headers' && (
            <div className="shrink-0 border-b border-neutral-100 bg-white px-3 py-1.5">
              <input
                type="text"
                value={headerSearch}
                onChange={(e) => setHeaderSearch(e.target.value)}
                placeholder={t('network.detail.searchHeaders')}
                className="h-6 w-full rounded border border-neutral-300 bg-white px-2 text-[11px] focus:border-brand-500 focus:outline-none"
              />
            </div>
          )}
          <div className="flex-1 overflow-auto">
            {respTab === 'headers' &&
              (Object.keys(item.res?.headers ?? {}).length > 0 ? (
                <HeaderTable headers={item.res?.headers} search={headerSearch} />
              ) : (
                <div className="p-3 text-xs text-neutral-400">—</div>
              ))}
            {respTab === 'body' &&
              (!hasRespBody ? (
                <div className="p-3 text-xs text-neutral-400">{t('network.detail.noBody')}</div>
              ) : isImageCT(item.res?.headers) ? (
                <ImageBody
                  key={item.id + '-res-img'}
                  fetchUrl={resBodyUrl}
                  contentType={getContentType(item.res?.headers)}
                  size={item.res?.size}
                  t={t}
                />
              ) : (
                <LazyBody
                  key={item.id + '-res'}
                  inlineBody={item.res?.body}
                  fetchUrl={resBodyUrl}
                  language={respLang}
                  t={t}
                  jsonCapable={isJsonCT(item.res?.headers)}
                  truncated={item.res?.truncated}
                  encoding={item.res?.headers?.['content-encoding']}
                  mode={respBodyMode}
                  setMode={setRespBodyMode}
                />
              ))}
            {respTab === 'raw' && (
              <CodeView
                value={reconstructRawResponse(item)}
                language="text"
                readOnly
                height="100%"
              />
            )}
            {respTab === 'cookies' &&
              (respCookies.length === 0 ? (
                <div className="p-3 text-xs text-neutral-400">{t('network.detail.noCookies')}</div>
              ) : (
                <KvTable rows={respCookies} />
              ))}
            {respTab === 'preview' &&
              (isImageCT(item.res?.headers) ? (
                <ImageBody
                  key={item.id + '-preview-img'}
                  fetchUrl={resBodyUrl}
                  contentType={getContentType(item.res?.headers)}
                  size={item.res?.size}
                  t={t}
                />
              ) : isHtmlCT(item.res?.headers) ? (
                <iframe
                  src={item.url}
                  title="preview"
                  sandbox="allow-same-origin allow-scripts"
                  className="h-full w-full border-0"
                />
              ) : !hasRespBody ? (
                <div className="p-3 text-xs text-neutral-400">{t('network.detail.noBody')}</div>
              ) : (
                <LazyBody
                  key={item.id + '-preview'}
                  inlineBody={item.res?.body}
                  fetchUrl={resBodyUrl}
                  language={respLang}
                  t={t}
                  truncated={item.res?.truncated}
                  encoding={item.res?.headers?.['content-encoding']}
                  mode={respBodyMode}
                  setMode={setRespBodyMode}
                />
              ))}
          </div>
        </div>
      </div>
    </div>
    {detailFooter && (
      <div className="shrink-0">{detailFooter(item)}</div>
    )}
    </>
  )
}
