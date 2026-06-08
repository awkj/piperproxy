import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import type { NetworkItem } from '../../types'

interface Props {
  item: NetworkItem
}

interface Segment {
  labelKey: string
  start: number
  duration: number
  colorClass: string
}

function buildSegments(item: NetworkItem): {
  segments: Segment[]
  total: number
} {
  const start = item.startTime
  if (!start) return { segments: [], total: 0 }

  const segments: Segment[] = []

  if (item.dnsTime && item.dnsTime > start) {
    segments.push({
      labelKey: 'stalled',
      start: 0,
      duration: item.dnsTime - start,
      colorClass: 'bg-neutral-300',
    })
  }

  const dnsAnchor = item.dnsTime ?? start
  if (item.httpsTime && item.httpsTime > dnsAnchor && item.requestTime) {
    segments.push({
      labelKey: 'connect',
      start: dnsAnchor - start,
      duration: item.httpsTime - dnsAnchor,
      colorClass: 'bg-amber-400',
    })
    if (item.requestTime > item.httpsTime) {
      segments.push({
        labelKey: 'request',
        start: item.httpsTime - start,
        duration: item.requestTime - item.httpsTime,
        colorClass: 'bg-blue-400',
      })
    }
  } else if (item.requestTime && item.requestTime > dnsAnchor) {
    segments.push({
      labelKey: 'connect',
      start: dnsAnchor - start,
      duration: item.requestTime - dnsAnchor,
      colorClass: 'bg-amber-400',
    })
  }

  if (item.requestTime && item.responseTime && item.responseTime > item.requestTime) {
    segments.push({
      labelKey: 'waiting',
      start: item.requestTime - start,
      duration: item.responseTime - item.requestTime,
      colorClass: 'bg-violet-400',
    })
  }

  if (item.responseTime && item.endTime && item.endTime > item.responseTime) {
    segments.push({
      labelKey: 'response',
      start: item.responseTime - start,
      duration: item.endTime - item.responseTime,
      colorClass: 'bg-emerald-500',
    })
  }

  const totalCandidate =
    (item.endTime ?? item.responseTime ?? item.requestTime ?? item.dnsTime ?? 0) - start
  const total = totalCandidate > 0 ? totalCandidate : 0
  return { segments, total }
}

function fmt(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export function NetworkTimeline({ item }: Props) {
  const { t } = useTranslation()
  const { segments, total } = buildSegments(item)

  if (!total || segments.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-neutral-400">
        {t('network.detail.timelineEmpty')}
      </div>
    )
  }

  return (
    <div className="space-y-2 p-4 text-xs">
      <div className="flex items-center justify-between text-neutral-500">
        <span className="truncate" title={item.url}>
          {item.url}
        </span>
        <span className="ml-3 shrink-0 font-mono">
          {t('network.detail.timelineLabels.total')}: {fmt(total)}
        </span>
      </div>
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1.5">
        {segments.map((seg, i) => {
          const ratio = total > 0 ? seg.start / total : 0
          const widthRatio = total > 0 ? seg.duration / total : 0
          return (
            <div key={`${seg.labelKey}-${i}`} className="contents">
              <div className="text-right text-neutral-600">
                {t(`network.detail.timelineLabels.${seg.labelKey}`)}
              </div>
              <div className="relative h-4 rounded bg-neutral-100">
                <div
                  className={cn('absolute h-4 rounded', seg.colorClass)}
                  style={{
                    left: `${Math.min(100, Math.max(0, ratio * 100))}%`,
                    width: `${Math.min(100, Math.max(0.5, widthRatio * 100))}%`,
                  }}
                />
              </div>
              <div className="font-mono text-neutral-500">{fmt(seg.duration)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
