import { useTranslation } from 'react-i18next'
import { Pencil, Trash2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { RuleItem } from '../../api/rules'

export function RuleListItem({
  item,
  selected,
  enabled,
  protectedItem,
  onSelect,
  onToggleEnabled,
  onRename,
  onDelete,
}: {
  item: RuleItem
  selected: boolean
  enabled: boolean
  protectedItem: boolean
  onSelect: () => void
  onToggleEnabled: (next: boolean) => void
  onRename: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const displayName = item.name === 'Default' ? t('rules.default') : item.name

  return (
    <div
      className={cn(
        'group flex items-center gap-2 px-3 py-1.5 text-sm',
        selected
          ? 'bg-brand-50 text-brand-700'
          : 'text-neutral-700 hover:bg-neutral-100',
      )}
    >
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => onToggleEnabled(e.target.checked)}
        aria-label={t('rules.toggleEnabled', { name: displayName })}
        className="h-3.5 w-3.5 cursor-pointer accent-brand-600"
        onClick={(e) => e.stopPropagation()}
      />
      <button type="button" onClick={onSelect} className="flex-1 truncate text-left">
        {displayName}
      </button>
      <div className="ml-auto flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          onClick={onRename}
          disabled={protectedItem}
          aria-label={t('common.rename')}
          className="rounded p-1 text-neutral-500 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={protectedItem}
          aria-label={t('common.delete')}
          className="rounded p-1 text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
