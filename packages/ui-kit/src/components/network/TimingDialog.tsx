import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import type { NetworkItem } from '../../types'
import { NetworkTimeline } from './NetworkTimeline'

interface Props {
  item?: NetworkItem
  onClose: () => void
}

export function TimingDialog({ item, onClose }: Props) {
  const { t } = useTranslation()

  useEffect(() => {
    if (!item) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [item, onClose])

  if (!item) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-[640px] max-w-[90vw] overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2">
          <p className="text-sm font-medium text-neutral-800">
            {t('network.detail.timingDialogTitle')}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
            aria-label={t('common.cancel')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <NetworkTimeline item={item} />
      </div>
    </div>
  )
}
