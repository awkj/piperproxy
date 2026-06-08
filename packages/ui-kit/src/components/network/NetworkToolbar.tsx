import { useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { type RefObject } from 'react'
import { ChevronLeft, ChevronRight, Download, Filter, Pin, Search, Zap } from 'lucide-react'
import { useNetworkStore } from '../../stores/network'
import { useWorkingSessionStore } from '../../stores/workingSession'
import { useSearchFiltersStore } from '../../stores/searchFilters'
import { ThrottleDropdown } from '../ThrottleDropdown'
import { ToolbarButton, ToolbarGroup, ToolbarLabel, toolbarIconCls } from '../ui/toolbar'
import { TypeFilterTabs } from './TypeFilterTabs'
import { usePiperApi } from '../../context'
import { resolveAbsoluteUrl } from '../../client'

const TOOLBAR_SIZE = 'xs' as const
const ICON = toolbarIconCls(TOOLBAR_SIZE)

interface Props {
  count: number
  searchInputRef?: RefObject<HTMLInputElement | null>
  layoutButtons?: ReactNode
  /** 注入到工具栏右侧（layoutButtons 之前）的额外内容，供宿主扩展。 */
  toolbarExtras?: ReactNode
}

export function NetworkToolbar({ count, searchInputRef, layoutButtons, toolbarExtras }: Props) {
  const { t } = useTranslation()
  const client = usePiperApi()
  const filter = useNetworkStore((s) => s.filter)
  const setFilter = useNetworkStore((s) => s.setFilter)
  const turboMode = useNetworkStore((s) => s.turboMode)
  const setTurboMode = useNetworkStore((s) => s.setTurboMode)
  const turboCount = useNetworkStore((s) => s.turboCount)
  const filterEnabled = useWorkingSessionStore((s) => s.filterEnabled)
  const toggleFilter = useWorkingSessionStore((s) => s.toggleFilter)
  const pinned = useWorkingSessionStore((s) => s.pinned)
  const searchFilterOpen = useSearchFiltersStore((s) => s.open)
  const toggleSearchFilter = useSearchFiltersStore((s) => s.toggleOpen)
  const searchClauses = useSearchFiltersStore((s) => s.filterSet.clauses)
  const selectionIndex = useNetworkStore((s) => s.selectionIndex)
  const selectionHistoryLen = useNetworkStore((s) => s.selectionHistory.length)
  const navigateBack = useNetworkStore((s) => s.navigateBack)
  const navigateForward = useNetworkStore((s) => s.navigateForward)
  const multiSelectIds = useNetworkStore((s) => s.multiSelectIds)
  const canBack = selectionIndex > 0
  const canForward = selectionIndex < selectionHistoryLen - 1

  const harAnchorRef = useRef<HTMLAnchorElement>(null)
  const handleExportHAR = () => {
    const base = resolveAbsoluteUrl(client, 'api/captures/export.har')
    const url =
      multiSelectIds.length > 0
        ? `${base}?ids=${encodeURIComponent(multiSelectIds.join(','))}`
        : base
    if (harAnchorRef.current) {
      harAnchorRef.current.href = url
      harAnchorRef.current.click()
    }
  }

  const searchActive = searchFilterOpen || searchClauses.length > 0

  return (
    <ToolbarGroup size={TOOLBAR_SIZE} className="border-b border-neutral-200 px-2 py-1">
      <div className="flex shrink min-w-0 items-center overflow-hidden">
        <TypeFilterTabs />
      </div>

      <div className="mx-0.5 h-4 w-px bg-neutral-200" />

      <ToolbarButton
        iconOnly
        onClick={navigateBack}
        disabled={!canBack}
        title={t('network.navBack')}
        aria-label={t('network.navBack')}
      >
        <ChevronLeft className={ICON} />
      </ToolbarButton>
      <ToolbarButton
        iconOnly
        onClick={navigateForward}
        disabled={!canForward}
        title={t('network.navForward')}
        aria-label={t('network.navForward')}
      >
        <ChevronRight className={ICON} />
      </ToolbarButton>

      <ToolbarButton
        iconOnly
        onClick={toggleSearchFilter}
        active={searchActive}
        title={`${t('search.title')} (Ctrl+F)`}
      >
        <Filter className={ICON} />
      </ToolbarButton>

      <div className="relative w-48 shrink-0">
        <Search className="pointer-events-none absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-neutral-400" />
        <input
          ref={searchInputRef}
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('network.filterPlaceholder')}
          className="h-6 w-full rounded-md border border-neutral-200 bg-white pl-6 pr-2 text-[11px] focus:border-brand-500 focus:outline-none"
        />
      </div>

      <ThrottleDropdown />

      {pinned.length > 0 && (
        <ToolbarButton
          onClick={toggleFilter}
          tone={filterEnabled ? 'info' : 'default'}
          active={filterEnabled}
          title={t('network.toolbar.pinnedOnly')}
        >
          <Pin className={ICON} />
          <span>{t('network.toolbar.pinnedOnly')}</span>
        </ToolbarButton>
      )}

      <ToolbarButton
        onClick={() => setTurboMode(!turboMode)}
        tone={turboMode ? 'warning' : 'default'}
        active={turboMode}
        title={t('network.toolbar.turboMode')}
      >
        <Zap className={ICON} />
        <span>
          {turboMode
            ? t('network.toolbar.turboActive', { count: turboCount })
            : t('network.toolbar.turbo')}
        </span>
      </ToolbarButton>

      <div className="flex-1" />

      <ToolbarButton onClick={handleExportHAR} title={t('network.exportHAR')} aria-label={t('network.exportHAR')}>
        <Download className={ICON} />
        <span>HAR</span>
      </ToolbarButton>

      {/* eslint-disable-next-line jsx-a11y/anchor-has-content */}
      <a ref={harAnchorRef} download className="hidden" />

      <ToolbarLabel mono>{t('network.totalCount', { count })}</ToolbarLabel>

      {toolbarExtras && <div className="flex shrink-0 items-center">{toolbarExtras}</div>}

      {layoutButtons && <div className="flex shrink-0 items-center">{layoutButtons}</div>}
    </ToolbarGroup>
  )
}
