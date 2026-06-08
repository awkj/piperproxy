import { useEffect, useMemo, useState } from 'react'
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

export interface ListItem {
  id: string
  label?: string
  description?: string
  disabled?: boolean
}

export interface ListDialogProps {
  open: boolean
  onClose: () => void
  items: ListItem[]
  value?: string[]
  multiple?: boolean
  filterable?: boolean
  title?: string
  description?: string
  onConfirm?: (selectedIds: string[]) => void
}

export function ListDialog({
  open,
  onClose,
  items,
  value = [],
  multiple = true,
  filterable = true,
  title,
  description,
  onConfirm,
}: ListDialogProps) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<Set<string>>(new Set(value))
  const [filter, setFilter] = useState('')

  useEffect(() => {
    if (open) {
      setSelected(new Set(value))
      setFilter('')
    }
  }, [open, value])

  const filtered = useMemo(() => {
    const kw = filter.trim().toLowerCase()
    if (!kw) return items
    return items.filter((item) => {
      const text = `${item.id} ${item.label ?? ''} ${item.description ?? ''}`
      return text.toLowerCase().includes(kw)
    })
  }, [items, filter])

  const toggle = (id: string, disabled?: boolean) => {
    if (disabled) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (multiple) {
        if (next.has(id)) next.delete(id)
        else next.add(id)
      } else {
        next.clear()
        next.add(id)
      }
      return next
    })
  }

  const allSelectable = filtered.filter((it) => !it.disabled)
  const allSelected =
    allSelectable.length > 0 && allSelectable.every((it) => selected.has(it.id))

  const onSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        for (const it of allSelectable) next.delete(it.id)
      } else {
        for (const it of allSelectable) next.add(it.id)
      }
      return next
    })
  }

  const handleConfirm = () => {
    onConfirm?.(Array.from(selected))
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title ?? t('dialogs.list.title')}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        {filterable ? (
          <input
            type="text"
            value={filter}
            placeholder={t('dialogs.list.filterPlaceholder')}
            onChange={(e) => setFilter(e.target.value)}
            className="mt-3 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        ) : null}

        <div className="mt-3 max-h-[50vh] overflow-y-auto rounded-md border border-neutral-200">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-500">
              {t('dialogs.list.empty')}
            </p>
          ) : (
            <ul className="divide-y divide-neutral-200">
              {filtered.map((item) => {
                const checked = selected.has(item.id)
                return (
                  <li key={item.id}>
                    <label
                      className={
                        'flex cursor-pointer items-start gap-2 px-3 py-2 text-sm hover:bg-neutral-50 ' +
                        (item.disabled ? 'cursor-not-allowed opacity-50' : '')
                      }
                    >
                      <input
                        type={multiple ? 'checkbox' : 'radio'}
                        checked={checked}
                        disabled={item.disabled}
                        onChange={() => toggle(item.id, item.disabled)}
                        className="mt-0.5"
                      />
                      <span className="flex-1">
                        <span className="block">{item.label ?? item.id}</span>
                        {item.description ? (
                          <span className="block text-xs text-neutral-500">
                            {item.description}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between text-xs text-neutral-500">
          {multiple ? (
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={allSelected}
                disabled={allSelectable.length === 0}
                onChange={onSelectAll}
              />
              {t('dialogs.list.selectAll')}
            </label>
          ) : (
            <span />
          )}
          <span>{t('dialogs.list.selectedCount', { count: selected.size })}</span>
        </div>

        <DialogFooter>
          <Button variant="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={handleConfirm}>
            {t('common.ok')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
