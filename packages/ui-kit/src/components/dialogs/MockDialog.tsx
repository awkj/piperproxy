import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'

export interface MockConfig {
  method: string
  status: number
  headers: string
  body: string
}

export interface MockDialogProps {
  open: boolean
  onClose: () => void
  value?: Partial<MockConfig>
  onConfirm?: (next: MockConfig) => void
  confirming?: boolean
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const

const COMMON_STATUSES = [200, 201, 204, 301, 302, 304, 400, 401, 403, 404, 422, 429, 500, 502, 503]

const DEFAULT: MockConfig = {
  method: 'GET',
  status: 200,
  headers: '',
  body: '',
}

export function MockDialog({
  open,
  onClose,
  value,
  onConfirm,
  confirming = false,
}: MockDialogProps) {
  const { t } = useTranslation()
  const [config, setConfig] = useState<MockConfig>({ ...DEFAULT, ...value })

  useEffect(() => {
    if (open) setConfig({ ...DEFAULT, ...value })
  }, [open, value])

  const update = (patch: Partial<MockConfig>) =>
    setConfig((prev) => ({ ...prev, ...patch }))

  const handleConfirm = () => {
    if (confirming) return
    if (onConfirm) {
      onConfirm(config)
    } else {
      onClose()
    }
  }

  const inputCls =
    'w-full rounded-md border border-neutral-300 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30'

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) return
        if (confirming) return
        onClose()
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('dialogs.mock.title')}</DialogTitle>
          <DialogDescription>{t('dialogs.mock.desc')}</DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-600">
                {t('dialogs.mock.method')}
              </span>
              <select
                value={config.method}
                onChange={(e) => update({ method: e.target.value })}
                className={inputCls}
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-600">
                {t('dialogs.mock.status')}
              </span>
              <input
                type="number"
                min={100}
                max={599}
                value={config.status}
                list="mock-status-suggestions"
                onChange={(e) => update({ status: Number(e.target.value) || 0 })}
                className={inputCls}
              />
              <datalist id="mock-status-suggestions">
                {COMMON_STATUSES.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">
              {t('dialogs.mock.headers')}
            </span>
            <textarea
              value={config.headers}
              onChange={(e) => update({ headers: e.target.value })}
              placeholder={t('dialogs.mock.headersPlaceholder')}
              className="h-24 w-full resize-none rounded-md border border-neutral-300 px-2 py-1 font-mono text-xs focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">
              {t('dialogs.mock.body')}
            </span>
            <textarea
              value={config.body}
              onChange={(e) => update({ body: e.target.value })}
              placeholder={t('dialogs.mock.bodyPlaceholder')}
              className="h-40 w-full resize-none rounded-md border border-neutral-300 px-2 py-1 font-mono text-xs focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </label>
        </div>

        <DialogFooter>
          <Button variant="default" onClick={onClose} disabled={confirming}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={handleConfirm} disabled={confirming}>
            {confirming ? t('network.context.mockWriting') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
