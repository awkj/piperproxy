import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pin, PinOff, Globe, ChevronRight, ChevronDown, AppWindow } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { NetworkItem } from '../../types'
import { useWorkingSessionStore } from '../../stores/workingSession'

interface Props {
  items: NetworkItem[]
}

interface DomainStat {
  value: string
  count: number
}

function SidebarItem({
  label,
  count,
  active,
  pinned,
  onSelect,
  onPin,
}: {
  label: string
  count?: number
  active: boolean
  pinned?: boolean
  onSelect: () => void
  onPin?: () => void
}) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        'group flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[12px] transition-colors select-none',
        active ? 'bg-blue-500 text-white' : 'text-neutral-700 hover:bg-neutral-200/60',
      )}
    >
      <span className="flex-1 truncate">{label}</span>
      {count != null && (
        <span
          className={cn(
            'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
            active ? 'bg-blue-400 text-white' : 'bg-neutral-200 text-neutral-500',
          )}
        >
          {count > 999 ? '999+' : count}
        </span>
      )}
      {onPin && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onPin()
          }}
          className={cn(
            'shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100',
            active ? 'hover:bg-blue-400' : 'hover:bg-neutral-300',
            pinned && 'opacity-100',
          )}
          title={pinned ? 'Unpin' : 'Pin'}
        >
          {pinned ? <PinOff className="h-2.5 w-2.5" /> : <Pin className="h-2.5 w-2.5" />}
        </button>
      )}
    </div>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="mt-3 mb-0.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
      {label}
    </div>
  )
}

function CollapsibleGroup({
  label,
  defaultOpen = true,
  count,
  children,
}: {
  label: string
  defaultOpen?: boolean
  count?: number
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 px-1 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 hover:text-neutral-600"
      >
        {open ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
        <span className="flex-1 text-left">{label}</span>
        {count != null && count > 0 && (
          <span className="text-neutral-400 normal-case tracking-normal">{count}</span>
        )}
      </button>
      {open && <div>{children}</div>}
    </div>
  )
}

export function NetworkSidebar({ items }: Props) {
  const { t } = useTranslation()
  const activeDomain = useWorkingSessionStore((s) => s.activeDomain)
  const setActiveDomain = useWorkingSessionStore((s) => s.setActiveDomain)
  const pinned = useWorkingSessionStore((s) => s.pinned)
  const pin = useWorkingSessionStore((s) => s.pin)
  const unpin = useWorkingSessionStore((s) => s.unpin)
  const isPinned = useWorkingSessionStore((s) => s.isPinned)
  const filterEnabled = useWorkingSessionStore((s) => s.filterEnabled)
  const toggleFilter = useWorkingSessionStore((s) => s.toggleFilter)

  const domainStats: DomainStat[] = useMemo(() => {
    const grouped = Object.groupBy(items, (it) => it.hostname || '')
    return Object.entries(grouped)
      .filter(([d]) => d !== '')
      .map(([value, group]) => ({ value, count: group?.length ?? 0 }))
      .toSorted((a, b) => b.count - a.count)
  }, [items])

  const totalCount = items.length
  const pinnedDomains = pinned.filter((p) => p.type === 'domain')
  const unpinnedDomains = domainStats.filter(
    (d) => !pinned.some((p) => p.type === 'domain' && p.value === d.value),
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-neutral-200 px-2 py-2">
        <button
          type="button"
          onClick={toggleFilter}
          className={cn(
            'flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
            filterEnabled
              ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
              : 'text-neutral-500 hover:bg-neutral-100',
          )}
        >
          <Pin className="h-3 w-3 shrink-0" />
          {t('network.sidebar.pinnedOnly')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 py-1.5">
        <SidebarItem
          label={t('network.sidebar.all')}
          count={totalCount}
          active={activeDomain === null}
          onSelect={() => setActiveDomain(null)}
        />

        {pinnedDomains.length > 0 && (
          <CollapsibleGroup
            label={t('network.sidebar.favorites')}
            count={pinnedDomains.length}
            defaultOpen
          >
            {pinnedDomains.map((p) => {
              const stat = domainStats.find((d) => d.value === p.value)
              return (
                <SidebarItem
                  key={`pin-${p.value}`}
                  label={p.value}
                  count={stat?.count}
                  active={activeDomain === p.value}
                  pinned
                  onSelect={() => setActiveDomain(activeDomain === p.value ? null : p.value)}
                  onPin={() => unpin({ type: 'domain', value: p.value })}
                />
              )
            })}
          </CollapsibleGroup>
        )}

        <CollapsibleGroup
          label={t('network.sidebar.allGroup')}
          count={unpinnedDomains.length}
          defaultOpen
        >
          <div className="group flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-neutral-400 select-none">
            <AppWindow className="h-3 w-3 shrink-0" />
            <span className="flex-1 truncate">{t('network.sidebar.applications')}</span>
            <span className="text-[9px] uppercase tracking-wider">{t('network.sidebar.soon')}</span>
          </div>

          <SectionHeader label={t('network.sidebar.domains')} />
          {unpinnedDomains.map(({ value, count }) => (
            <SidebarItem
              key={value}
              label={value}
              count={count}
              active={activeDomain === value}
              pinned={isPinned({ type: 'domain', value })}
              onSelect={() => setActiveDomain(activeDomain === value ? null : value)}
              onPin={() =>
                isPinned({ type: 'domain', value })
                  ? unpin({ type: 'domain', value })
                  : pin({ type: 'domain', value })
              }
            />
          ))}

          {domainStats.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Globe className="h-6 w-6 text-neutral-300" />
              <span className="text-[11px] text-neutral-400">{t('network.sidebar.empty')}</span>
            </div>
          )}
        </CollapsibleGroup>
      </div>
    </div>
  )
}
