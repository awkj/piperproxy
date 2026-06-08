import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Check } from 'lucide-react'
import QRCode from 'qrcode'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'

export interface QrcodeDialogProps {
  open: boolean
  onClose: () => void
  value?: string
  title?: string
}

export function QrcodeDialog({ open, onClose, value = '', title }: QrcodeDialogProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!open || !value) return

    let cancelled = false

    QRCode.toCanvas(
      canvasRef.current!,
      value,
      { width: 256, errorCorrectionLevel: 'M' },
      (err) => {
        if (cancelled) return
        if (err) console.error('[QrcodeDialog] QR render error:', err)
      },
    )

    return () => {
      cancelled = true
    }
  }, [open, value])

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard may be unavailable in non-secure contexts
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title ?? t('dialogs.qrcode.title')}</DialogTitle>
          <DialogDescription>{t('dialogs.qrcode.desc')}</DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex flex-col items-center gap-3">
          <canvas
            ref={canvasRef}
            width={256}
            height={256}
            className="rounded-md border border-neutral-200"
            aria-label={value}
          />

          <div className="flex w-full items-center gap-2">
            <input
              readOnly
              value={value}
              className="flex-1 rounded-md border border-neutral-300 bg-white px-2 py-1 font-mono text-xs focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
            <Button variant="default" size="sm" onClick={onCopy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? t('common.copied') : t('dialogs.qrcode.copy')}
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="default" onClick={onClose}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
