import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Columns2, PanelRight, Rows2, ExternalLink, PanelLeft } from 'lucide-react'
import { normalizeCapture } from '../../api/network'
import { useCaptureStream } from '../../hooks/useCaptureStream'
import type { CaptureItem } from '../../types'
import { useNetworkStore } from '../../stores/network'
import { useDetailLayoutStore, type DetailLayout } from '../../stores/detailLayout'
import { useWorkingSessionStore } from '../../stores/workingSession'
import { useSearchFiltersStore } from '../../stores/searchFilters'
import { useNetworkPrefs } from '../../stores/networkPrefs'
import { useNetworkShortcuts } from '../../lib/use-network-shortcuts'
import { cn } from '../../lib/cn'
import { NetworkToolbar } from './NetworkToolbar'
import { NetworkList } from './NetworkList'
import { NetworkTreeView } from './NetworkTreeView'
import { NetworkDetail } from './NetworkDetail'
import { NetworkSidebar } from './NetworkSidebar'
import { SearchFilterBar } from './SearchFilterBar'
import { matchesFilterSet } from './filter-match'

function parseExcludeTokens(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

function SidebarPane({ children }: { children: React.ReactNode }) {
  const width = useWorkingSessionStore((s) => s.sidebarWidth)
  const setWidth = useWorkingSessionStore((s) => s.setSidebarWidth)

  const onMouseDown = (ev: React.MouseEvent) => {
    ev.preventDefault()
    const startX = ev.clientX
    const startW = width
    const onMove = (e: MouseEvent) => setWidth(startW + (e.clientX - startX))
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
  }

  return (
    <div
      style={{ width }}
      className="relative shrink-0 overflow-hidden border-r border-neutral-200 bg-neutral-50/80"
    >
      {children}
      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={onMouseDown}
        className="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize hover:bg-brand-300 active:bg-brand-400"
      />
    </div>
  )
}

function LayoutButtons() {
  const { t } = useTranslation()
  const layout = useDetailLayoutStore((s) => s.layout)
  const setLayout = useDetailLayoutStore((s) => s.setLayout)
  const visible = useDetailLayoutStore((s) => s.visible)
  const toggleVisible = useDetailLayoutStore((s) => s.toggleVisible)
  const sidebarVisible = useWorkingSessionStore((s) => s.sidebarVisible)
  const toggleSidebar = useWorkingSessionStore((s) => s.toggleSidebar)

  const LAYOUTS: Array<{ key: DetailLayout; icon: React.ReactNode; title: string }> = [
    { key: 'vertical', icon: <Columns2 className="h-3.5 w-3.5" />, title: t('network.layout.vertical') },
    { key: 'horizontal', icon: <Rows2 className="h-3.5 w-3.5" />, title: t('network.layout.horizontal') },
    { key: 'detached', icon: <ExternalLink className="h-3.5 w-3.5" />, title: t('network.layout.detached') },
  ]

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        title={t('network.sidebar.toggle')}
        onClick={toggleSidebar}
        className={cn(
          'rounded p-1 transition-colors',
          sidebarVisible
            ? 'bg-neutral-200 text-neutral-900'
            : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700',
        )}
      >
        <PanelLeft className="h-3.5 w-3.5" />
      </button>
      <div className="mx-1 h-4 w-px bg-neutral-200" />
      {LAYOUTS.map(({ key, icon, title }) => (
        <button
          key={key}
          type="button"
          title={title}
          aria-label={title}
          onClick={() => setLayout(key)}
          className={cn(
            'rounded p-1 transition-colors',
            layout === key
              ? 'bg-neutral-200 text-neutral-900'
              : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700',
          )}
        >
          {icon}
        </button>
      ))}
      <button
        type="button"
        title={visible ? t('network.layout.hideDetail') : t('network.layout.showDetail')}
        onClick={toggleVisible}
        className={cn(
          'rounded p-1 transition-colors',
          !visible
            ? 'bg-neutral-200 text-neutral-900'
            : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700',
        )}
      >
        <PanelRight className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export interface NetworkPanelProps {
  /** Called when the user requests to send a capture to the Composer. Host opens Composer tab. */
  onSendToComposer?: (item: CaptureItem) => void
  /** Called after mock values are written, so host can refresh its values cache. */
  onMutateValues?: () => void
  /** Optional client IP for "view only own" filter. If omitted, that filter is a no-op. */
  clientIp?: string
  /** Extra content injected into the toolbar right side (before layout buttons). */
  toolbarExtras?: React.ReactNode
  /** Extra content injected below the detail pane. Receives the currently selected item. */
  detailFooter?: (item: CaptureItem | undefined) => React.ReactNode
}

export function NetworkPanel({ onSendToComposer, onMutateValues, clientIp = '', toolbarExtras, detailFooter }: NetworkPanelProps) {
  const { t } = useTranslation()
  const filter = useNetworkStore((s) => s.filter)
  const typeFilter = useNetworkStore((s) => s.typeFilter)
  // 用 useDeferredValue 让输入立即响应，过滤推到低优先级渲染
  const deferredFilter = useDeferredValue(filter)
  const deferredTypeFilter = useDeferredValue(typeFilter)
  const paused = useNetworkStore((s) => s.paused)
  const togglePaused = useNetworkStore((s) => s.togglePaused)
  const selectedId = useNetworkStore((s) => s.selectedId)
  const removedIds = useNetworkStore((s) => s.removedIds)
  const resetRemoved = useNetworkStore((s) => s.resetRemoved)
  const clearMultiSelect = useNetworkStore((s) => s.clearMultiSelect)
  const captureItems = useNetworkStore((s) => s.captureItems)
  const upsertCaptureItem = useNetworkStore((s) => s.upsertCaptureItem)
  const clearCaptureItems = useNetworkStore((s) => s.clearCaptureItems)
  const bufferCaptureItem = useNetworkStore((s) => s.bufferCaptureItem)
  const { prefs, setPref } = useNetworkPrefs()
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const layout = useDetailLayoutStore((s) => s.layout)
  const setLayout = useDetailLayoutStore((s) => s.setLayout)
  const visible = useDetailLayoutStore((s) => s.visible)
  const toggleVisible = useDetailLayoutStore((s) => s.toggleVisible)

  const sidebarVisible = useWorkingSessionStore((s) => s.sidebarVisible)
  const activeDomain = useWorkingSessionStore((s) => s.activeDomain)
  const filterEnabled = useWorkingSessionStore((s) => s.filterEnabled)
  const pinned = useWorkingSessionStore((s) => s.pinned)
  const searchFilterSet = useSearchFiltersStore((s) => s.filterSet)
  const toggleSearchFilter = useSearchFiltersStore((s) => s.toggleOpen)

  const prevPausedRef = useRef(paused)
  const [pausedAt, setPausedAt] = useState(0)
  useEffect(() => {
    if (paused && !prevPausedRef.current) {
      setPausedAt(Date.now())
    } else if (!paused && prevPausedRef.current) {
      setPausedAt(0)
    }
    prevPausedRef.current = paused
  }, [paused])

  const clearList = () => {
    clearCaptureItems()
    resetRemoved()
    clearMultiSelect()
  }

  useNetworkShortcuts({
    clearNetworkSessions: clearList,
    toggleNetworkState: togglePaused,
    focusNetworkSearchBox: () => searchInputRef.current?.focus(),
    switchNetworkView: () => setPref({ treeView: !prefs.treeView }),
    toggleDetailPanel: toggleVisible,
    openSearchFilter: toggleSearchFilter,
    editRepeat: () => {
      const { selectedId: sid, captureItems: items } = useNetworkStore.getState()
      if (!sid) return
      const item = items.find((it) => it.id === sid)
      if (!item) return
      onSendToComposer?.({
        ...item,
        req: { ...item.req, headers: item.req?.headers ?? {} },
      })
    },
  })

  // Chord shortcut: Ctrl+\ then Arrow → switch layout
  const chordActiveRef = useRef(false)
  const chordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === '\\') {
        e.preventDefault()
        chordActiveRef.current = true
        if (chordTimerRef.current) clearTimeout(chordTimerRef.current)
        chordTimerRef.current = setTimeout(() => {
          chordActiveRef.current = false
        }, 1000)
        return
      }
      if (chordActiveRef.current) {
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          setLayout('vertical')
          chordActiveRef.current = false
        } else if (e.key === 'ArrowDown') {
          e.preventDefault()
          setLayout('horizontal')
          chordActiveRef.current = false
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          setLayout('detached')
          chordActiveRef.current = false
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
      if (chordTimerRef.current) clearTimeout(chordTimerRef.current)
    }
  }, [setLayout])

  // Detached preview window
  const detachWindowRef = useRef<Window | null>(null)
  useEffect(() => {
    if (layout !== 'detached') {
      detachWindowRef.current?.close()
      detachWindowRef.current = null
      return
    }
    if (!detachWindowRef.current || detachWindowRef.current.closed) {
      const w = window.open(
        `${location.origin}${location.pathname}?piper-preview=1`,
        'piper-preview',
        'width=900,height=680,menubar=no,toolbar=no,location=no',
      )
      detachWindowRef.current = w
      if (w) {
        const checkClosed = setInterval(() => {
          if (w.closed) {
            clearInterval(checkClosed)
            setLayout('vertical')
            detachWindowRef.current = null
          }
        }, 500)
      }
    }
  }, [layout, setLayout])

  const dispatch = useMemo(() => {
    return (raw: CaptureItem) => {
      const item = normalizeCapture(raw)
      if (useNetworkStore.getState().turboMode) {
        bufferCaptureItem(item)
      } else {
        // 抓包流是高频源，包进 transition 防止用户输入卡顿
        startTransition(() => upsertCaptureItem(item))
      }
    }
  }, [upsertCaptureItem, bufferCaptureItem])

  useCaptureStream<CaptureItem>({
    onStart: dispatch,
    onComplete: dispatch,
  })

  const items = useMemo(() => {
    const removed = new Set(removedIds)
    let result = captureItems.filter((it) => !removed.has(it.id))

    if (pausedAt > 0) {
      result = result.filter((it) => it.startTime <= pausedAt)
    }
    if (prefs.viewOnlyOwn && clientIp) {
      result = result.filter((it) => it.clientIp === clientIp)
    }
    if (deferredFilter) {
      const f = deferredFilter.toLowerCase()
      result = result.filter(
        (it) =>
          it.url.toLowerCase().includes(f) ||
          it.method?.toLowerCase().includes(f) ||
          String(it.res?.statusCode ?? '').includes(f) ||
          (it.type ?? '').includes(f) ||
          (it.processName ?? '').toLowerCase().includes(f),
      )
    }
    if (deferredTypeFilter !== 'all') {
      result = result.filter((it) => {
        const url = it.url || ''
        const ty = it.type || ''
        switch (deferredTypeFilter) {
          case 'http':
            return url.startsWith('http://')
          case 'https':
            return url.startsWith('https://')
          case 'ws':
            return url.startsWith('ws://') || url.startsWith('wss://')
          case 'json':
            return ty === 'json'
          case 'js':
            return ty === 'js'
          case 'css':
            return ty === 'css'
          case 'image':
            return ty === 'image'
          case 'font':
            return ty === 'font'
          case 'media':
            return ty === 'video' || ty === 'audio'
          case 'other':
            return !['json', 'js', 'css', 'image', 'font', 'video', 'audio', 'html', 'xml', 'wasm', 'sse', 'form', 'text'].includes(ty)
          default:
            return true
        }
      })
    }
    if (prefs.excludeFilterEnabled && prefs.excludeFilter) {
      const tokens = parseExcludeTokens(prefs.excludeFilter)
      if (tokens.length > 0) {
        result = result.filter((it) => {
          const url = it.url.toLowerCase()
          const method = (it.method ?? '').toLowerCase()
          const status = String(it.res?.statusCode ?? '')
          const ty = it.type ?? ''
          const proc = (it.processName ?? '').toLowerCase()
          return !tokens.some(
            (tk) =>
              url.includes(tk) ||
              method.includes(tk) ||
              status.includes(tk) ||
              (ty && ty.includes(tk)) ||
              (proc && proc.includes(tk)),
          )
        })
      }
    }
    if (prefs.maxRows > 0 && result.length > prefs.maxRows) {
      result = result.slice(result.length - prefs.maxRows)
    }
    if (searchFilterSet.clauses.length > 0) {
      result = result.filter((it) => matchesFilterSet(it, searchFilterSet))
    }
    return result
  }, [
    captureItems,
    deferredFilter,
    deferredTypeFilter,
    pausedAt,
    removedIds,
    prefs.viewOnlyOwn,
    prefs.excludeFilterEnabled,
    prefs.excludeFilter,
    prefs.maxRows,
    clientIp,
    searchFilterSet,
  ])

  const filteredItems = useMemo(() => {
    let base = items
    if (filterEnabled && pinned.length > 0) {
      base = items.filter((it) =>
        pinned.some((p) => {
          if (p.type === 'domain') return it.hostname === p.value
          if (p.type === 'app') return it.processName === p.value
          return false
        }),
      )
    } else if (activeDomain) {
      base = items.filter((it) => it.hostname === activeDomain)
    }
    return base.toReversed()
  }, [items, filterEnabled, pinned, activeDomain])

  const selected = useMemo(
    () => filteredItems.find((it) => it.id === selectedId),
    [filteredItems, selectedId],
  )

  const bcRef = useRef<BroadcastChannel | null>(null)
  const selectedRef = useRef(selected)
  selectedRef.current = selected

  useEffect(() => {
    const bc = new BroadcastChannel('piper-preview')
    bcRef.current = bc
    bc.onmessage = (ev: MessageEvent) => {
      if (ev.data?.type === 'preview-ready') {
        bc.postMessage({ type: 'select', item: selectedRef.current ?? null })
      }
    }
    return () => bc.close()
  }, [])

  useEffect(() => {
    if (layout === 'detached' && bcRef.current) {
      bcRef.current.postMessage({ type: 'select', item: selected ?? null })
    }
  }, [selected, layout])

  const listContent =
    filteredItems.length === 0 && items.length > 0 ? (
      <div className="flex h-full items-center justify-center text-sm text-neutral-400">
        {t('network.sidebar.noMatch')}
      </div>
    ) : prefs.treeView ? (
      <NetworkTreeView
        items={filteredItems}
        highlightNew={prefs.highlightNew}
        onSendToComposer={onSendToComposer}
        onMutateValues={onMutateValues}
      />
    ) : (
      <NetworkList
        items={filteredItems}
        highlightNew={prefs.highlightNew}
        onSendToComposer={onSendToComposer}
        onMutateValues={onMutateValues}
      />
    )

  const showDetail = visible && layout !== 'detached'

  const sidebarEl = sidebarVisible && (
    <SidebarPane>
      <NetworkSidebar items={items} />
    </SidebarPane>
  )

  const mainCol = (
    <div className="flex flex-1 flex-col overflow-hidden">
      <NetworkToolbar
        count={filteredItems.length}
        searchInputRef={searchInputRef}
        toolbarExtras={toolbarExtras}
        layoutButtons={<LayoutButtons />}
      />
      <SearchFilterBar />
      {layout === 'vertical' ? (
        <div className="flex flex-1 overflow-hidden">
          <div
            className={cn(
              'overflow-hidden',
              showDetail ? 'flex-1 border-r border-neutral-200' : 'flex-1',
            )}
          >
            {listContent}
          </div>
          {showDetail && (
            <div className="w-[45%] min-w-[320px] overflow-hidden">
              <NetworkDetail item={selected} detailFooter={detailFooter} />
            </div>
          )}
        </div>
      ) : layout === 'horizontal' ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div
            className={cn(
              'overflow-hidden',
              showDetail ? 'h-1/2 border-b border-neutral-200' : 'flex-1',
            )}
          >
            {listContent}
          </div>
          {showDetail && (
            <div className="flex-1 overflow-hidden">
              <NetworkDetail item={selected} detailFooter={detailFooter} />
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">{listContent}</div>
      )}
    </div>
  )

  return (
    <div className="flex h-full overflow-hidden">
      {sidebarEl}
      {mainCol}
    </div>
  )
}
