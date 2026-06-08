import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'

export interface TextDialogProps {
  open: boolean
  onClose: () => void
  value?: string
  title?: string
  readOnly?: boolean
  onConfirm?: (next: string) => void
}

export function TextDialog({
  open,
  onClose,
  value = '',
  title,
  readOnly = false,
  onConfirm,
}: TextDialogProps) {
  const { t } = useTranslation()
  const [text, setText] = useState(value)

  useEffect(() => {
    if (open) setText(value)
  }, [open, value])

  const handleConfirm = () => {
    onConfirm?.(text)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title ?? t('dialogs.text.title')}</DialogTitle>
        </DialogHeader>

        <textarea
          value={text}
          readOnly={readOnly}
          onChange={(e) => setText(e.target.value)}
          className="mt-4 h-72 w-full resize-none rounded-md border border-neutral-300 px-3 py-2 font-mono text-xs focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />

        <DialogFooter>
          <Button variant="default" onClick={onClose}>
            {readOnly ? t('common.close') : t('common.cancel')}
          </Button>
          {readOnly ? null : (
            <Button variant="primary" onClick={handleConfirm}>
              {t('common.save')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
