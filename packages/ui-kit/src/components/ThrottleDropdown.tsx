import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Wifi, WifiOff } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { ToolbarButton, useToolbarSize, toolbarIconCls } from './ui/toolbar'
import { usePiperApi } from '../context'

export interface ThrottleConfig {
  preset?: string
  upBps?: number
  downBps?: number
  latencyMs?: number
}

export const THROTTLE_PRESETS = [
  { id: 'off', label: 'No Throttle' },
  { id: 'offline', label: 'Offline' },
  { id: 'gprs', label: 'GPRS (2G)' },
  { id: 'edge', label: 'EDGE' },
  { id: '3g', label: '3G' },
  { id: '4g', label: '4G/LTE' },
  { id: 'dsl', label: 'DSL' },
  { id: 'wifi', label: 'WiFi' },
  { id: 'custom', label: 'Custom…' },
] as const

export type ThrottlePresetId = (typeof THROTTLE_PRESETS)[number]['id']

export interface ThrottleDropdownProps {
  /** Optional override — if provided, skips internal API fetch. */
  config?: ThrottleConfig
  onSetThrottle?: (cfg: ThrottleConfig) => Promise<unknown>
}

export function ThrottleDropdown({ config: configProp, onSetThrottle: onSetThrottleProp }: ThrottleDropdownProps) {
  const { t } = useTranslation()
  const client = usePiperApi()
  const [internalConfig, setInternalConfig] = useState<ThrottleConfig | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const size = useToolbarSize()
  const icon = toolbarIconCls(size)

  // Self-fetch when no external config provided
  useEffect(() => {
    if (configProp !== undefined) return
    let cancelled = false
    const fetch = () => {
      client.get<ThrottleConfig>('api/throttle').then((cfg) => {
        if (!cancelled) setInternalConfig(cfg)
      }).catch(() => {})
    }
    fetch()
    const id = setInterval(fetch, 5000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [configProp, client])

  const config = configProp ?? internalConfig
  const preset = config?.preset ?? 'off'
  const isActive = preset !== 'off' && preset !== ''
  const isOffline = preset === 'offline'

  const currentLabel =
    THROTTLE_PRESETS.find((p) => p.id === preset)?.label ?? t('throttle.noThrottle')

  async function applyPreset(id: string) {
    setBusy(true)
    try {
      const cfg: ThrottleConfig = { preset: id, upBps: 0, downBps: 0, latencyMs: 0 }
      if (onSetThrottleProp) {
        await onSetThrottleProp(cfg)
      } else {
        await client.post('api/throttle', cfg)
        setInternalConfig(cfg)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ToolbarButton
          tone={isOffline ? 'danger' : isActive ? 'info' : 'default'}
          active={isActive}
          disabled={busy}
          title={t('throttle.title')}
        >
          {isOffline ? <WifiOff className={icon} /> : <Wifi className={icon} />}
          {isActive ? currentLabel : t('throttle.noThrottle')}
        </ToolbarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>{t('throttle.title')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {THROTTLE_PRESETS.filter((p) => p.id !== 'custom').map((p) => (
          <DropdownMenuItem
            key={p.id}
            onSelect={() => applyPreset(p.id)}
            className={preset === p.id ? 'font-semibold text-brand-600' : ''}
          >
            {p.id === 'off' ? t('throttle.noThrottle') : p.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
