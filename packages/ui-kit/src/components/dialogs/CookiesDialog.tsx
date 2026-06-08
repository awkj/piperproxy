import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { cn } from '../../lib/cn'

export interface CookieEntry {
  name: string
  value: string
}

export interface CookiesDialogProps {
  open: boolean
  onClose: () => void
  value?: CookieEntry[] | string
  onConfirm?: (next: CookieEntry[], serialized: string) => void
}

const EMPTY_ROW: CookieEntry = { name: '', value: '' }

export function parseCookieHeader(input: string): CookieEntry[] {
  return input
    .split(/;\s*/g)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const idx = segment.indexOf('=')
      if (idx === -1) return { name: segment, value: '' }
      return {
        name: segment.slice(0, idx).trim(),
        value: segment.slice(idx + 1).trim(),
      }
    })
}

export function serializeCookies(entries: CookieEntry[]): string {
  return entries
    .filter((c) => c.name.trim())
    .map((c) => `${c.name.trim()}=${c.value}`)
    .join('; ')
}

function normalizeIncoming(input: CookieEntry[] | string | undefined): CookieEntry[] {
  if (!input) return []
  if (typeof input === 'string') return parseCookieHeader(input)
  return input.map((c) => ({ name: c.name, value: c.value }))
}

export function CookiesDialog({ open, onClose, value, onConfirm }: CookiesDialogProps) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<CookieEntry[]>(() => normalizeIncoming(value))

  useEffect(() => {
    if (open) setRows(normalizeIncoming(value))
  }, [open, value])

  const update = (i: number, patch: Partial<CookieEntry>) =>
    setRows((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))

  const remove = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i))

  const add = () => setRows((prev) => [...prev, { ...EMPTY_ROW }])

  const serialized = serializeCookies(rows)

  const handleConfirm = () => {
    onConfirm?.(rows.filter((r) => r.name.trim()), serialized)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('dialogs.cookies.title')}</DialogTitle>
          <DialogDescription>{t('dialogs.cookies.desc')}</DialogDescription>
        </DialogHeader>

        <div className="mt-4 max-h-[50vh] overflow-y-auto">
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-500">
              {t('dialogs.cookies.empty')}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-neutral-500">
                <tr>
                  <th className="w-1/3 pb-2 text-left font-medium">
                    {t('dialogs.cookies.name')}
                  </th>
                  <th className="pb-2 text-left font-medium">
                    {t('dialogs.cookies.value')}
                  </th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    <td className="py-1 pr-2">
                      <input
                        type="text"
                        value={row.name}
                        placeholder={t('dialogs.cookies.namePlaceholder')}
                        onChange={(e) => update(i, { name: e.target.value })}
                        className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        type="text"
                        value={row.value}
                        placeholder={t('dialogs.cookies.valuePlaceholder')}
                        onChange={(e) => update(i, { value: e.target.value })}
                        className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                      />
                    </td>
                    <td className="py-1 text-right">
                      <button
                        type="button"
                        onClick={() => remove(i)}
                        aria-label={t('dialogs.cookies.removeRow')}
                        className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <Button variant="ghost" size="sm" onClick={add} className="mt-2 text-brand-600">
            <Plus className="h-4 w-4" />
            {t('dialogs.cookies.addRow')}
          </Button>
        </div>

        <div className="mt-3">
          <div className="text-xs font-medium text-neutral-500">
            {t('dialogs.cookies.preview')}
          </div>
          <pre
            className={cn(
              'mt-1 max-h-24 overflow-auto rounded-md bg-neutral-50 px-2 py-1 text-xs text-neutral-700',
              !serialized && 'text-neutral-400',
            )}
          >
            {serialized || '—'}
          </pre>
        </div>

        <DialogFooter>
          <Button variant="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={handleConfirm}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
