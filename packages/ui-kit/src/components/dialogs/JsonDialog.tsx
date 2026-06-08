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
import { CodeView } from '../CodeView'

export interface JsonDialogProps {
  open: boolean
  onClose: () => void
  value?: string | unknown
  readOnly?: boolean
  title?: string
  onConfirm?: (parsed: unknown, raw: string) => void
}

function toInitialString(value: string | unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return value
    }
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function JsonDialog({
  open,
  onClose,
  value,
  readOnly = false,
  title,
  onConfirm,
}: JsonDialogProps) {
  const { t } = useTranslation()
  const [text, setText] = useState(() => toInitialString(value))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setText(toInitialString(value))
      setError(null)
    }
  }, [open, value])

  const onChange = (next: string) => {
    setText(next)
    if (error) setError(null)
  }

  const format = () => {
    try {
      const parsed = JSON.parse(text)
      setText(JSON.stringify(parsed, null, 2))
      setError(null)
    } catch (e) {
      setError(
        t('dialogs.json.invalid', {
          message: e instanceof Error ? e.message : String(e),
        }),
      )
    }
  }

  const handleConfirm = () => {
    try {
      const parsed = JSON.parse(text)
      setError(null)
      onConfirm?.(parsed, text)
      onClose()
    } catch (e) {
      setError(
        t('dialogs.json.invalid', {
          message: e instanceof Error ? e.message : String(e),
        }),
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title ?? t('dialogs.json.title')}</DialogTitle>
          <DialogDescription>{t('dialogs.json.desc')}</DialogDescription>
        </DialogHeader>

        <div className="mt-3 h-80 overflow-hidden rounded-md border border-neutral-300">
          <CodeView
            value={text}
            language="json"
            readOnly={readOnly}
            onChange={onChange}
            height="100%"
          />
        </div>

        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

        <DialogFooter>
          <Button variant="default" onClick={onClose}>
            {readOnly ? t('common.close') : t('common.cancel')}
          </Button>
          {readOnly ? null : (
            <>
              <Button variant="ghost" onClick={format}>
                {t('dialogs.json.format')}
              </Button>
              <Button variant="primary" onClick={handleConfirm}>
                {t('common.save')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
