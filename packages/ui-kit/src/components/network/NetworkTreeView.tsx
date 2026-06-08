import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useTranslation } from 'react-i18next'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useNetworkStore } from '../../stores/network'
import type { NetworkItem } from '../../types'
import { RowContextMenu } from './RowContextMenu'

interface Props {
  items: NetworkItem[]
  highlightNew?: boolean
  onSendToComposer?: (item: NetworkItem) => void
  onMutateValues?: () => void
}

const ROW_HEIGHT = 26
const HIGHLIGHT_NEW_MS = 5_000

interface HostNode {
  type: 'host'
  key: string
  host: string
  count: number
}
interface PathNode {
  type: 'path'
  key: string
  host: string
  pathPrefix: string
  count: number
}
interface LeafNode {
  type: 'leaf'
  key: string
  item: NetworkItem
}
type FlatNode = (HostNode | PathNode | LeafNode) & { depth: number }

interface GroupedTree {
  hostOrder: string[]
  byHost: Map<string, { pathOrder: string[]; byPath: Map<string, NetworkItem[]>; total: number }>
}

function splitPath(p: string | undefined): { dir: string; rest: string } {
  if (!p) return { dir: '/', rest: '' }
  const qIdx = p.indexOf('?')
  const pure = qIdx >= 0 ? p.slice(0, qIdx) : p
  const lastSlash = pure.lastIndexOf('/')
  if (lastSlash <= 0) return { dir: '/', rest: p }
  return { dir: pure.slice(0, lastSlash) || '/', rest: p.slice(lastSlash + 1) }
}

function groupItems(items: NetworkItem[]): GroupedTree {
  const tree: GroupedTree = { hostOrder: [], byHost: new Map() }
  for (const it of items) {
    const host = it.hostname || '(unknown)'
    if (!tree.byHost.has(host)) {
      tree.byHost.set(host, { pathOrder: [], byPath: new Map(), total: 0 })
      tree.hostOrder.push(host)
    }
    const hostEntry = tree.byHost.get(host)!
    const { dir } = splitPath(it.path)
    if (!hostEntry.byPath.has(dir)) {
      hostEntry.byPath.set(dir, [])
      hostEntry.pathOrder.push(dir)
    }
    hostEntry.byPath.get(dir)!.push(it)
    hostEntry.total += 1
  }
  return tree
}

function buildFlat(
  tree: GroupedTree,
  collapsedHosts: Set<string>,
  collapsedPaths: Set<string>,
): FlatNode[] {
  const out: FlatNode[] = []
  for (const host of tree.hostOrder) {
    const hostEntry = tree.byHost.get(host)!
    const hostKey = `H::${host}`
    out.push({ type: 'host', key: hostKey, host, count: hostEntry.total, depth: 0 })
    if (collapsedHosts.has(host)) continue
    for (const dir of hostEntry.pathOrder) {
      const list = hostEntry.byPath.get(dir)!
      const pathKey = `P::${host}::${dir}`
      out.push({ type: 'path', key: pathKey, host, pathPrefix: dir, count: list.length, depth: 1 })
      if (collapsedPaths.has(pathKey)) continue
      for (const item of list) {
        out.push({ type: 'leaf', key: `L::${item.id}`, item, depth: 2 })
      }
    }
  }
  return out
}

function formatStatus(item: NetworkItem): string {
  if (item.reqError) return 'Req Err'
  if (item.resError) return 'Res Err'
  return item.res?.statusCode ? String(item.res.statusCode) : '—'
}

function statusColor(s: string): string {
  if (s === '—') return 'text-neutral-400'
  const code = Number(s)
  if (Number.isNaN(code)) return 'text-red-600'
  if (code >= 500) return 'text-red-600'
  if (code >= 400) return 'text-amber-600'
  if (code >= 300) return 'text-blue-600'
  return 'text-emerald-600'
}

function formatTime(item: NetworkItem): string {
  if (!item.endTime || !item.startTime) return '—'
  const ms = item.endTime - item.startTime
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`
}

export function NetworkTreeView({ items, highlightNew = false, onSendToComposer, onMutateValues }: Props) {
  const { t } = useTranslation()
  const parentRef = useRef<HTMLDivElement>(null)

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!highlightNew) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [highlightNew])

  const selectedId = useNetworkStore((s) => s.selectedId)
  const setSelectedId = useNetworkStore((s) => s.setSelectedId)
  const multiSelectIds = useNetworkStore((s) => s.multiSelectIds)
  const removeIds = useNetworkStore((s) => s.removeIds)

  const tree = useMemo(() => groupItems(items), [items])
  const [collapsedHosts, setCollapsedHosts] = useState<Set<string>>(() => new Set())
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(() => new Set())
  const flat = useMemo(
    () => buildFlat(tree, collapsedHosts, collapsedPaths),
    [tree, collapsedHosts, collapsedPaths],
  )

  const virtualizer = useVirtualizer({
    count: flat.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 16,
  })

  const toggleHost = (host: string) => {
    setCollapsedHosts((prev) => {
      const next = new Set(prev)
      if (next.has(host)) next.delete(host)
      else next.add(host)
      return next
    })
  }
  const togglePath = (key: string) => {
    setCollapsedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="flex h-full flex-col text-xs">
      <div className="sticky top-0 z-10 flex border-b border-neutral-200 bg-neutral-50 px-2 py-1.5 font-medium text-neutral-600">
        {t('network.tree.header', { count: items.length })}
      </div>
      <div ref={parentRef} className="flex-1 overflow-auto">
        {flat.length === 0 ? (
          <div className="flex h-full items-center justify-center text-neutral-400">
            {t('common.empty')}
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vRow) => {
              const node = flat[vRow.index]!
              const style: React.CSSProperties = {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: vRow.size,
                transform: `translateY(${vRow.start}px)`,
              }

              if (node.type === 'host') {
                const collapsed = collapsedHosts.has(node.host)
                return (
                  <div
                    key={node.key}
                    style={style}
                    onClick={() => toggleHost(node.host)}
                    className="flex cursor-pointer items-center gap-1 border-b border-neutral-100 bg-neutral-50/60 px-2 hover:bg-neutral-100"
                  >
                    {collapsed ? (
                      <ChevronRight className="h-3 w-3 text-neutral-500" />
                    ) : (
                      <ChevronDown className="h-3 w-3 text-neutral-500" />
                    )}
                    <span className="truncate font-mono text-neutral-800">{node.host}</span>
                    <span className="ml-auto pr-2 text-neutral-400">{node.count}</span>
                  </div>
                )
              }

              if (node.type === 'path') {
                const collapsed = collapsedPaths.has(node.key)
                return (
                  <div
                    key={node.key}
                    style={style}
                    onClick={() => togglePath(node.key)}
                    className="flex cursor-pointer items-center gap-1 border-b border-neutral-100 px-2 hover:bg-neutral-50"
                  >
                    <div style={{ width: 16, flexShrink: 0 }} />
                    {collapsed ? (
                      <ChevronRight className="h-3 w-3 text-neutral-500" />
                    ) : (
                      <ChevronDown className="h-3 w-3 text-neutral-500" />
                    )}
                    <span className="truncate font-mono text-neutral-600">
                      {node.pathPrefix || '/'}
                    </span>
                    <span className="ml-auto pr-2 text-neutral-400">{node.count}</span>
                  </div>
                )
              }

              const item = node.item
              const focused = item.id === selectedId
              const checked = multiSelectIds.includes(item.id)
              const isNew =
                highlightNew &&
                typeof item.startTime === 'number' &&
                now - item.startTime <= HIGHLIGHT_NEW_MS
              const status = formatStatus(item)
              const { rest } = splitPath(item.path)
              const leafLabel = rest || item.path || '/'
              return (
                <RowContextMenu
                  key={node.key}
                  item={item}
                  checked={checked}
                  onSendToComposer={onSendToComposer}
                  onMutateValues={onMutateValues}
                  onRemoveSelected={() => {
                    const ids =
                      checked && multiSelectIds.length > 0 ? multiSelectIds : [item.id]
                    removeIds(ids)
                  }}
                  onRemoveOthers={() => {
                    const keep = new Set(
                      checked && multiSelectIds.length > 0 ? multiSelectIds : [item.id],
                    )
                    const others = items.map((x) => x.id).filter((id) => !keep.has(id))
                    removeIds(others)
                  }}
                >
                  <div
                    style={style}
                    onClick={() => setSelectedId(item.id)}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 border-b border-neutral-100 px-2 hover:bg-neutral-50',
                      isNew && 'bg-emerald-50/70 hover:bg-emerald-50',
                      checked && 'bg-amber-50 hover:bg-amber-50',
                      focused && 'bg-brand-50 hover:bg-brand-50',
                      checked && focused && 'bg-amber-100 hover:bg-amber-100',
                    )}
                  >
                    <div style={{ width: 32, flexShrink: 0 }} />
                    <span className="w-12 shrink-0 truncate font-mono text-neutral-700">
                      {item.method ?? '—'}
                    </span>
                    <span className={cn('w-12 shrink-0 truncate font-mono', statusColor(status))}>
                      {status}
                    </span>
                    <span className="flex-1 truncate text-neutral-700" title={item.path ?? ''}>
                      {leafLabel}
                    </span>
                    <span className="shrink-0 pl-2 text-right font-mono text-neutral-500">
                      {formatTime(item)}
                    </span>
                  </div>
                </RowContextMenu>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
