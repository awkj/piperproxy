import { useEffect, useRef, useCallback, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useTranslation } from 'react-i18next'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { ArrowUp, Check, MessageCircle, Pencil, Wrench } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useNetworkStore, COLUMN_KEYS, type ColumnKey } from '../../stores/network'
import type { NetworkItem } from '../../types'
import { setHighlight, setComment } from '../../api/network'
import { RowContextMenu } from './RowContextMenu'
import { TimingDialog } from './TimingDialog'
import { MethodBadge } from '../MethodBadge'
import { copyToClipboard } from '../../lib/curl'
import { usePiperApi } from '../../context'
import { toast } from 'sonner'

interface Props {
  items: NetworkItem[]
  highlightNew?: boolean
  onSendToComposer?: (item: NetworkItem) => void
  onMutateValues?: () => void
}

const ROW_HEIGHT = 28
const HIGHLIGHT_NEW_MS = 5_000

function formatStatus(item: NetworkItem): string {
  if (item.reqError) return 'Req Err'
  if (item.resError) return 'Res Err'
  return item.res?.statusCode ? String(item.res.statusCode) : '—'
}

function formatTimestamp(item: NetworkItem): string {
  if (!item.startTime) return '—'
  const d = new Date(item.startTime)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${hh}:${mm}:${ss}.${ms}`
}

function formatTime(item: NetworkItem): string {
  if (!item.endTime || !item.startTime) return '—'
  const ms = item.endTime - item.startTime
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`
}

function formatMs(ms?: number): string {
  if (ms == null) return '—'
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`
}

function formatSize(bytes?: number): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function ProtocolLabel({ item }: { item: NetworkItem }) {
  const url = item.url || ''
  const proto = (item.protocol || '').toLowerCase()
  const isH2 = proto.includes('2')
  const isWss = url.startsWith('wss://')
  const isWs = url.startsWith('ws://')
  const isHttps = url.startsWith('https://')

  let label = 'http'
  let cls = 'text-neutral-400'
  if (isWss) {
    label = 'wss'
    cls = 'text-amber-600'
  } else if (isWs) {
    label = 'ws'
    cls = 'text-amber-500'
  } else if (isHttps) {
    label = isH2 ? 'h2' : 'https'
    cls = 'text-emerald-600'
  } else if (isH2) {
    label = 'h2'
    cls = 'text-violet-600'
  }
  return (
    <span className={cn('text-[11px] font-mono uppercase tracking-tight', cls)}>{label}</span>
  )
}

function statusDotCls(item: NetworkItem): string {
  if (item.reqError || item.resError) return 'bg-red-500'
  if (!item.endTime) return 'bg-neutral-300'
  const code = item.res?.statusCode ?? 0
  if (code >= 500) return 'bg-red-500'
  if (code >= 400) return 'bg-amber-500'
  if (code >= 200) return 'bg-emerald-500'
  return 'bg-neutral-300'
}

function statusBadgeCls(s: string): string {
  if (s === '—') return 'text-neutral-400'
  const code = Number(s)
  if (Number.isNaN(code)) return 'text-red-600 font-semibold'
  if (code >= 500) return 'rounded border border-red-300/70 px-1 text-red-600 font-semibold'
  if (code >= 400) return 'rounded border border-amber-300/70 px-1 text-amber-700 font-semibold'
  if (code >= 300) return 'text-sky-600 font-semibold'
  return 'text-emerald-600 font-semibold'
}

function typeColor(_: string): string {
  return 'text-neutral-500'
}

function getCellValue(item: NetworkItem, key: ColumnKey, index?: number): string {
  switch (key) {
    case 'index':
      return index != null ? String(index + 1) : '—'
    case 'method':
      return item.method ?? '—'
    case 'result':
      return formatStatus(item)
    case 'protocol':
      return item.protocol ?? '—'
    case 'hostname':
      return item.hostname || '—'
    case 'path':
      return item.path || '—'
    case 'type':
      return item.type || '—'
    case 'timestamp':
      return formatTimestamp(item)
    case 'time':
      return formatTime(item)
    case 'clientIp':
      return item.clientIp ?? '—'
    case 'hostIp':
      return item.hostIp ?? '—'
    case 'process':
      return item.processName || '—'
    case 'size':
      return formatSize(item.res?.size ?? item.req?.size)
    case 'dns':
      return formatMs(item.dnsTime)
    case 'request':
      return formatMs(item.requestTime)
    case 'response':
      return formatMs(item.responseTime)
    case 'ttfb':
      return formatMs(item.ttfb)
    case 'graphqlOp':
      return item.graphqlOp || '—'
    case 'edit':
    case 'comment':
    case 'tools':
      return ''
    case 'id':
      return item.id ? `#${item.id}` : '—'
  }
}

export function NetworkList({ items, highlightNew = false, onSendToComposer, onMutateValues }: Props) {
  const { t } = useTranslation()
  const client = usePiperApi()
  const parentRef = useRef<HTMLDivElement>(null)
  const patchCaptureItem = useNetworkStore((s) => s.patchCaptureItem)
  const [commentDialogId, setCommentDialogId] = useState<string | null>(null)
  const [timingItemId, setTimingItemId] = useState<string | null>(null)
  const [commentInput, setCommentInput] = useState('')
  const commentInputRef = useRef<HTMLInputElement>(null)

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!highlightNew) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [highlightNew])

  const [autoStick, setAutoStick] = useState(true)
  const [showBackToTop, setShowBackToTop] = useState(false)
  const prevItemsLen = useRef(items.length)

  useEffect(() => {
    const el = parentRef.current
    if (!el) return
    const onScroll = () => {
      const atTop = el.scrollTop < 40
      if (atTop) {
        setAutoStick(true)
        setShowBackToTop(false)
      } else {
        setAutoStick(false)
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const newLen = items.length
    const oldLen = prevItemsLen.current
    prevItemsLen.current = newLen
    if (newLen === oldLen) return
    if (autoStick) {
      const el = parentRef.current
      if (el) el.scrollTop = 0
    } else if (newLen > oldLen) {
      setShowBackToTop(true)
    }
  }, [items.length, autoStick])

  const scrollToTop = useCallback(() => {
    const el = parentRef.current
    if (el) el.scrollTop = 0
    setAutoStick(true)
    setShowBackToTop(false)
  }, [])

  const selectedId = useNetworkStore((s) => s.selectedId)
  const setSelectedId = useNetworkStore((s) => s.setSelectedId)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!selectedId) return
      if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault()
        const item = useNetworkStore.getState().captureItems.find((x) => x.id === selectedId)
        if (!item) return
        const next = !item.highlighted
        patchCaptureItem(selectedId, { highlighted: next })
        void setHighlight(client, selectedId, next).catch(() => {
          patchCaptureItem(selectedId, { highlighted: item.highlighted })
        })
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
        e.preventDefault()
        const item = useNetworkStore.getState().captureItems.find((x) => x.id === selectedId)
        if (!item) return
        setCommentInput(item.comment ?? '')
        setCommentDialogId(selectedId)
        setTimeout(() => commentInputRef.current?.focus(), 50)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedId, patchCaptureItem, client])

  const multiSelectIds = useNetworkStore((s) => s.multiSelectIds)
  const toggleMultiSelect = useNetworkStore((s) => s.toggleMultiSelect)
  const clearMultiSelect = useNetworkStore((s) => s.clearMultiSelect)
  const removeIds = useNetworkStore((s) => s.removeIds)
  const columns = useNetworkStore((s) => s.columns)
  const toggleColumnVisible = useNetworkStore((s) => s.toggleColumnVisible)
  const setColumnWidth = useNetworkStore((s) => s.setColumnWidth)
  const resetColumns = useNetworkStore((s) => s.resetColumns)

  const visibleColumns = COLUMN_KEYS.filter((k) => columns[k].visible)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })

  const startResize = useCallback(
    (key: ColumnKey, ev: React.MouseEvent<HTMLDivElement>) => {
      ev.preventDefault()
      ev.stopPropagation()
      const startX = ev.clientX
      const startWidth = columns[key].width
      const onMove = (e: MouseEvent) => {
        setColumnWidth(key, startWidth + (e.clientX - startX))
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [columns, setColumnWidth],
  )

  const headerRow = (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div className="sticky top-0 z-10 flex border-b border-neutral-200 bg-neutral-50 font-medium text-neutral-600">
          <div style={{ width: 16, flexShrink: 0 }} />
          {visibleColumns.map((key) => (
            <div
              key={key}
              style={{ width: columns[key].width, flexShrink: 0 }}
              className="relative truncate px-2 py-1.5"
            >
              {t(`network.columns.${key}`)}
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label={t('network.columns_menu.resize')}
                onMouseDown={(e) => startResize(key, e)}
                className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-brand-300"
              />
            </div>
          ))}
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className={cn(
            'z-50 min-w-[200px] rounded-2xl p-[5px]',
            'shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.5),0_24px_60px_rgba(15,23,42,0.20),0_6px_14px_rgba(15,23,42,0.08)]',
            '[font-family:system-ui,-apple-system,BlinkMacSystemFont,"SF_Pro_Text","SF_Pro","Helvetica_Neue",sans-serif]',
          )}
          style={{
            backgroundColor: 'rgba(232, 234, 237, 0.5)',
            backdropFilter: 'blur(20px) saturate(1.8)',
            WebkitBackdropFilter: 'blur(20px) saturate(1.8)',
          }}
        >
          {COLUMN_KEYS.map((key) => (
            <ContextMenu.CheckboxItem
              key={key}
              checked={columns[key].visible}
              onCheckedChange={() => toggleColumnVisible(key)}
              className={cn(
                'flex h-6 cursor-default select-none items-center gap-2',
                'rounded-md px-3 text-[13px] leading-none text-[#1d1d1f] outline-none',
                'data-[highlighted]:bg-gradient-to-b data-[highlighted]:from-[rgba(74,142,245,0.94)] data-[highlighted]:to-[rgba(29,111,237,0.94)]',
                'data-[highlighted]:text-white',
                'data-[highlighted]:shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]',
              )}
            >
              <span className="inline-flex h-3.5 w-3.5 items-center justify-center">
                {columns[key].visible ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : null}
              </span>
              <span>{t(`network.columns.${key}`)}</span>
            </ContextMenu.CheckboxItem>
          ))}
          <ContextMenu.Separator className="mx-3 my-1 h-px bg-black/[0.06]" />
          <ContextMenu.Item
            onSelect={() => resetColumns()}
            className={cn(
              'flex h-6 cursor-default select-none items-center',
              'rounded-md px-3 text-[13px] leading-none text-[#1d1d1f] outline-none',
              'data-[highlighted]:bg-gradient-to-b data-[highlighted]:from-[rgba(74,142,245,0.94)] data-[highlighted]:to-[rgba(29,111,237,0.94)]',
              'data-[highlighted]:text-white',
              'data-[highlighted]:shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]',
            )}
          >
            {t('network.columns_menu.reset')}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )

  const onRowClick = (id: string, ev: React.MouseEvent) => {
    if (ev.metaKey || ev.ctrlKey) {
      toggleMultiSelect(id)
    } else if (ev.shiftKey && selectedId) {
      const idx1 = items.findIndex((x) => x.id === selectedId)
      const idx2 = items.findIndex((x) => x.id === id)
      if (idx1 >= 0 && idx2 >= 0) {
        const [a, b] = idx1 < idx2 ? [idx1, idx2] : [idx2, idx1]
        const range = items.slice(a, b + 1).map((x) => x.id)
        clearMultiSelect()
        for (const id2 of range) toggleMultiSelect(id2)
      }
    } else {
      clearMultiSelect()
    }
    setSelectedId(id)
  }

  const submitComment = async (id: string, value: string) => {
    const prev =
      useNetworkStore.getState().captureItems.find((x) => x.id === id)?.comment ?? ''
    patchCaptureItem(id, { comment: value })
    setCommentDialogId(null)
    try {
      await setComment(client, id, value)
    } catch {
      patchCaptureItem(id, { comment: prev })
    }
  }

  const timingItem = timingItemId ? items.find((x) => x.id === timingItemId) : null

  return (
    <div className="flex h-full flex-col text-xs">
      <TimingDialog item={timingItem ?? undefined} onClose={() => setTimingItemId(null)} />
      {commentDialogId && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCommentDialogId(null)
          }}
        >
          <div className="w-80 rounded-lg border border-neutral-200 bg-white p-4 shadow-xl">
            <p className="mb-2 text-sm font-medium text-neutral-700">
              {t('network.comment.title')}
            </p>
            <input
              ref={commentInputRef}
              type="text"
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitComment(commentDialogId, commentInput)
                if (e.key === 'Escape') setCommentDialogId(null)
              }}
              className="w-full rounded border border-neutral-300 px-2 py-1.5 text-xs outline-none focus:border-brand-500"
              placeholder={t('network.comment.placeholder')}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCommentDialogId(null)}
                className="rounded px-3 py-1 text-xs text-neutral-500 hover:bg-neutral-100"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void submitComment(commentDialogId, commentInput)}
                className="rounded bg-brand-600 px-3 py-1 text-xs text-white hover:bg-brand-700"
              >
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
      {headerRow}

      <div className="relative flex-1 overflow-hidden">
        {showBackToTop && (
          <button
            type="button"
            onClick={scrollToTop}
            title={t('network.backToTop')}
            aria-label={t('network.backToTop')}
            className="absolute top-4 right-4 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg hover:bg-brand-700 focus:outline-none"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        )}
        <div ref={parentRef} className="h-full overflow-auto">
          {items.length === 0 ? (
            <div>
              {Array.from({ length: 40 }).map((_, i) => (
                <div
                  key={i}
                  style={{ height: ROW_HEIGHT }}
                  className={cn(
                    'flex items-center border-b border-neutral-100',
                    i % 2 === 1 && 'bg-neutral-50/50',
                  )}
                >
                  <div style={{ width: 16, flexShrink: 0 }} />
                  {visibleColumns.map((key) => (
                    <div key={key} style={{ width: columns[key].width, flexShrink: 0 }} />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().map((vRow) => {
                const item = items[vRow.index]!
                const focused = item.id === selectedId
                const checked = multiSelectIds.includes(item.id)
                const isNew =
                  highlightNew &&
                  typeof item.startTime === 'number' &&
                  now - item.startTime <= HIGHLIGHT_NEW_MS
                return (
                  <NetworkRow
                    key={item.id}
                    item={item}
                    focused={focused}
                    checked={checked}
                    isNew={isNew}
                    isEven={vRow.index % 2 === 1}
                    rowIndex={vRow.index}
                    visibleColumns={visibleColumns}
                    columns={columns}
                    top={vRow.start}
                    height={vRow.size}
                    onClick={(ev) => onRowClick(item.id, ev)}
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
                    onToggleHighlight={() => {
                      const next = !item.highlighted
                      patchCaptureItem(item.id, { highlighted: next })
                      void setHighlight(client, item.id, next).catch(() => {
                        patchCaptureItem(item.id, { highlighted: item.highlighted })
                      })
                    }}
                    onEditComment={() => {
                      setCommentInput(item.comment ?? '')
                      setCommentDialogId(item.id)
                      setTimeout(() => commentInputRef.current?.focus(), 50)
                    }}
                    onShowTiming={() => setTimingItemId(item.id)}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface RowProps {
  item: NetworkItem
  focused: boolean
  checked: boolean
  isNew: boolean
  isEven: boolean
  rowIndex: number
  visibleColumns: ColumnKey[]
  columns: Record<ColumnKey, { visible: boolean; width: number }>
  top: number
  height: number
  onClick: (ev: React.MouseEvent) => void
  onSendToComposer?: (item: NetworkItem) => void
  onMutateValues?: () => void
  onRemoveSelected: () => void
  onRemoveOthers: () => void
  onToggleHighlight: () => void
  onEditComment: () => void
  onShowTiming: () => void
}

function NetworkRow({
  item,
  focused,
  checked,
  isNew,
  isEven,
  rowIndex,
  visibleColumns,
  columns,
  top,
  height,
  onClick,
  onSendToComposer,
  onMutateValues,
  onRemoveSelected,
  onRemoveOthers,
  onToggleHighlight,
  onEditComment,
  onShowTiming,
}: RowProps) {
  const { t } = useTranslation()
  return (
    <RowContextMenu
      item={item}
      checked={checked}
      onRemoveSelected={onRemoveSelected}
      onRemoveOthers={onRemoveOthers}
      onToggleHighlight={onToggleHighlight}
      onEditComment={onEditComment}
      onShowTiming={onShowTiming}
      onSendToComposer={onSendToComposer}
      onMutateValues={onMutateValues}
    >
      <div
        onClick={onClick}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height,
          transform: `translateY(${top}px)`,
        }}
        className={cn(
          'flex cursor-pointer items-center border-b border-neutral-100 hover:bg-neutral-100/60',
          isEven && !focused && !checked && !item.highlighted && 'bg-neutral-50/50',
          item.highlighted && 'bg-amber-50/60 hover:bg-amber-50',
          checked && 'bg-amber-50 hover:bg-amber-50',
          focused && 'bg-brand-50 hover:bg-brand-50',
          checked && focused && 'bg-amber-100 hover:bg-amber-100',
        )}
      >
        {item.highlighted ? (
          <div className="absolute left-0 top-0 h-full w-0.5 bg-amber-500" />
        ) : isNew ? (
          <div className="absolute left-0 top-0 h-full w-0.5 bg-emerald-400" />
        ) : null}

        <div style={{ width: 16, flexShrink: 0 }} className="flex items-center justify-center">
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              statusDotCls(item),
              !item.endTime && 'animate-pulse',
            )}
          />
        </div>

        {visibleColumns.map((key) => {
          const value = getCellValue(item, key, rowIndex)

          if (key === 'protocol') {
            return (
              <div
                key={key}
                style={{ width: columns[key].width, flexShrink: 0 }}
                className="flex items-center justify-center"
              >
                <ProtocolLabel item={item} />
              </div>
            )
          }

          if (key === 'id') {
            return (
              <div
                key={key}
                style={{ width: columns[key].width, flexShrink: 0 }}
                className="flex items-center justify-end px-2"
                onClick={(ev) => {
                  ev.stopPropagation()
                  void copyToClipboard(item.id ?? '').then((ok) => {
                    if (ok) toast.success(`已复制 ID: ${item.id}`)
                  })
                }}
              >
                <span className="font-mono text-[11px] tabular-nums text-neutral-500 hover:text-brand-600">
                  {value}
                </span>
              </div>
            )
          }

          if (key === 'edit' || key === 'comment' || key === 'tools') {
            return (
              <div
                key={key}
                style={{ width: columns[key].width, flexShrink: 0 }}
                className="flex items-center justify-center"
              >
                {key === 'edit' && (
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation()
                      onSendToComposer?.(item)
                    }}
                    title={t('network.context.replay')}
                    className="inline-flex h-5 w-5 items-center justify-center rounded text-neutral-400 hover:bg-neutral-200/60 hover:text-neutral-700"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
                {key === 'comment' && (
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation()
                      onEditComment()
                    }}
                    title={item.comment || t('network.context.editComment')}
                    className={cn(
                      'inline-flex h-5 w-5 items-center justify-center rounded hover:bg-neutral-200/60',
                      item.comment ? 'text-amber-500' : 'text-neutral-300 hover:text-neutral-700',
                    )}
                  >
                    <MessageCircle className="h-3 w-3" />
                  </button>
                )}
                {key === 'tools' && (
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation()
                      const target = ev.currentTarget
                      const rect = target.getBoundingClientRect()
                      target.dispatchEvent(
                        new MouseEvent('contextmenu', {
                          bubbles: true,
                          cancelable: true,
                          clientX: rect.left + rect.width / 2,
                          clientY: rect.bottom,
                        }),
                      )
                    }}
                    title={t('network.columns.tools')}
                    className="inline-flex h-5 w-5 items-center justify-center rounded text-neutral-400 hover:bg-neutral-200/60 hover:text-neutral-700"
                  >
                    <Wrench className="h-3 w-3" />
                  </button>
                )}
              </div>
            )
          }

          if (key === 'method') {
            return (
              <div
                key={key}
                style={{ width: columns[key].width, flexShrink: 0 }}
                className="flex items-center px-1.5"
              >
                <MethodBadge method={value !== '—' ? value : 'GET'} />
              </div>
            )
          }

          if (key === 'path') {
            return (
              <div
                key={key}
                style={{ width: columns[key].width, flexShrink: 0 }}
                className="flex min-w-0 items-center gap-1.5 truncate px-2 text-neutral-700"
                title={value}
              >
                <span className="truncate">{value}</span>
                {item.comment && (
                  <span title={item.comment} className="inline-flex shrink-0">
                    <MessageCircle className="h-3 w-3 text-amber-500" />
                  </span>
                )}
              </div>
            )
          }

          const extra =
            key === 'result'
              ? cn('font-mono tabular-nums', statusBadgeCls(value))
              : key === 'index'
                ? 'text-right text-[10px] text-neutral-400 font-mono tabular-nums'
                : key === 'timestamp'
                  ? 'text-neutral-500 font-mono tabular-nums text-[11px]'
                  : key === 'time' ||
                      key === 'dns' ||
                      key === 'request' ||
                      key === 'response' ||
                      key === 'ttfb' ||
                      key === 'size'
                    ? 'text-right text-neutral-500 font-mono'
                    : key === 'type'
                      ? cn('tabular-nums', typeColor(value))
                      : key === 'clientIp' || key === 'hostIp'
                        ? 'text-neutral-500'
                        : 'text-neutral-700'
          return (
            <div
              key={key}
              style={{ width: columns[key].width, flexShrink: 0 }}
              className={cn('truncate px-2', extra)}
              title={key === 'hostname' ? value : undefined}
            >
              {value}
            </div>
          )
        })}
      </div>
    </RowContextMenu>
  )
}
