import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Save, Trash2, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import {
  useSearchFiltersStore,
  type FilterClause,
  type FilterField,
  type FilterOp,
} from '../../stores/searchFilters'

const FIELD_OPTIONS: { value: FilterField; labelKey: string }[] = [
  { value: 'url', labelKey: 'search.field.url' },
  { value: 'method', labelKey: 'search.field.method' },
  { value: 'req_ct', labelKey: 'search.field.reqCt' },
  { value: 'req_header', labelKey: 'search.field.reqHeader' },
  { value: 'req_body', labelKey: 'search.field.reqBody' },
  { value: 'res_ct', labelKey: 'search.field.resCt' },
  { value: 'res_header', labelKey: 'search.field.resHeader' },
  { value: 'res_body', labelKey: 'search.field.resBody' },
  { value: 'status', labelKey: 'search.field.status' },
  { value: 'client_ip', labelKey: 'search.field.clientIp' },
  { value: 'server_ip', labelKey: 'search.field.serverIp' },
  { value: 'highlight', labelKey: 'search.field.highlight' },
  { value: 'comment', labelKey: 'search.field.comment' },
  { value: 'process', labelKey: 'search.field.process' },
]

const OP_OPTIONS: { value: FilterOp; labelKey: string }[] = [
  { value: 'contains', labelKey: 'search.op.contains' },
  { value: 'not_contains', labelKey: 'search.op.notContains' },
  { value: 'equals', labelKey: 'search.op.equals' },
  { value: 'not_equals', labelKey: 'search.op.notEquals' },
  { value: 'starts_with', labelKey: 'search.op.startsWith' },
  { value: 'ends_with', labelKey: 'search.op.endsWith' },
  { value: 'wildcard', labelKey: 'search.op.wildcard' },
  { value: 'regex', labelKey: 'search.op.regex' },
]

const selCls =
  'h-6 rounded border border-neutral-200 bg-white px-1.5 text-[11px] text-neutral-700 focus:border-brand-500 focus:outline-none'
const inputCls =
  'h-6 rounded border border-neutral-200 bg-white px-1.5 text-[11px] text-neutral-700 focus:border-brand-500 focus:outline-none'
const btnCls =
  'inline-flex h-6 w-6 items-center justify-center rounded border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800'

function newClause(): FilterClause {
  return { id: `c-${Date.now()}-${Math.random()}`, field: 'url', op: 'contains', value: '' }
}

interface ClauseRowProps {
  clause: FilterClause
  onChange: (patch: Partial<FilterClause>) => void
  onRemove: () => void
}

function ClauseRow({ clause, onChange, onRemove }: ClauseRowProps) {
  const { t } = useTranslation()
  const needsArg = clause.field === 'req_header' || clause.field === 'res_header'

  return (
    <div className="flex items-center gap-1">
      <select
        value={clause.field}
        onChange={(e) => onChange({ field: e.target.value as FilterField, fieldArg: undefined })}
        className={cn(selCls, 'w-28')}
      >
        {FIELD_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {t(o.labelKey)}
          </option>
        ))}
      </select>

      {needsArg && (
        <input
          type="text"
          placeholder={t('search.headerName')}
          value={clause.fieldArg ?? ''}
          onChange={(e) => onChange({ fieldArg: e.target.value })}
          className={cn(inputCls, 'w-24')}
        />
      )}

      <select
        value={clause.op}
        onChange={(e) => onChange({ op: e.target.value as FilterOp })}
        className={cn(selCls, 'w-24')}
      >
        {OP_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {t(o.labelKey)}
          </option>
        ))}
      </select>

      <input
        type="text"
        placeholder={t('search.valuePlaceholder')}
        value={clause.value}
        onChange={(e) => onChange({ value: e.target.value })}
        className={cn(inputCls, 'flex-1 min-w-0')}
      />

      <button type="button" onClick={onRemove} className={btnCls} title={t('common.delete')}>
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

export function SearchFilterBar() {
  const { t } = useTranslation()
  const open = useSearchFiltersStore((s) => s.open)
  const setOpen = useSearchFiltersStore((s) => s.setOpen)
  const filterSet = useSearchFiltersStore((s) => s.filterSet)
  const setFilterSet = useSearchFiltersStore((s) => s.setFilterSet)
  const clearFilterSet = useSearchFiltersStore((s) => s.clearFilterSet)
  const savedFilters = useSearchFiltersStore((s) => s.savedFilters)
  const saveFilter = useSearchFiltersStore((s) => s.saveFilter)
  const deleteSavedFilter = useSearchFiltersStore((s) => s.deleteSavedFilter)
  const applySavedFilter = useSearchFiltersStore((s) => s.applySavedFilter)
  const [saveName, setSaveName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)

  if (!open) return null

  const updateClause = (id: string, patch: Partial<FilterClause>) =>
    setFilterSet({
      ...filterSet,
      clauses: filterSet.clauses.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })

  const removeClause = (id: string) =>
    setFilterSet({ ...filterSet, clauses: filterSet.clauses.filter((c) => c.id !== id) })

  const addClause = () =>
    setFilterSet({ ...filterSet, clauses: [...filterSet.clauses, newClause()] })

  const handleSave = () => {
    if (!saveName.trim()) return
    saveFilter(saveName.trim(), filterSet)
    setSaveName('')
    setShowSaveInput(false)
  }

  const hasFilter = filterSet.clauses.length > 0

  return (
    <div className="border-b border-neutral-200 bg-neutral-50 px-2 py-1.5">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-[11px] font-medium text-neutral-600">{t('search.title')}</span>

        <button
          type="button"
          onClick={() =>
            setFilterSet({
              ...filterSet,
              combinator: filterSet.combinator === 'AND' ? 'OR' : 'AND',
            })
          }
          className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-neutral-600 hover:bg-neutral-100"
          title={t('search.toggleCombinator')}
        >
          {filterSet.combinator}
        </button>

        <div className="flex-1" />

        {savedFilters.map((sf) => (
          <span
            key={sf.id}
            className="group inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] text-blue-700"
          >
            <button
              type="button"
              onClick={() => applySavedFilter(sf.id)}
              className="hover:underline"
            >
              {sf.name}
            </button>
            <button
              type="button"
              onClick={() => deleteSavedFilter(sf.id)}
              className="opacity-0 group-hover:opacity-100"
              title={t('common.delete')}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}

        {hasFilter && !showSaveInput && (
          <button
            type="button"
            onClick={() => setShowSaveInput(true)}
            className={cn(btnCls, 'w-auto px-1.5 gap-1 text-[10px]')}
            title={t('search.saveFilter')}
          >
            <Save className="h-3 w-3" />
            <span>{t('search.saveFilter')}</span>
          </button>
        )}

        {showSaveInput && (
          <div className="flex items-center gap-1">
            <input
              type="text"
              autoFocus
              placeholder={t('search.filterName')}
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave()
                if (e.key === 'Escape') setShowSaveInput(false)
              }}
              className={cn(inputCls, 'w-32')}
            />
            <button type="button" onClick={handleSave} className={cn(btnCls)}>
              <Save className="h-3 w-3" />
            </button>
            <button type="button" onClick={() => setShowSaveInput(false)} className={cn(btnCls)}>
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {hasFilter && (
          <button
            type="button"
            onClick={clearFilterSet}
            className={cn(btnCls, 'w-auto px-1.5 gap-1 text-[10px]')}
          >
            <Trash2 className="h-3 w-3" />
            <span>{t('search.clear')}</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setOpen(false)}
          className={btnCls}
          title={t('common.close')}
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <div className="flex flex-col gap-1">
        {filterSet.clauses.map((clause) => (
          <ClauseRow
            key={clause.id}
            clause={clause}
            onChange={(patch) => updateClause(clause.id, patch)}
            onRemove={() => removeClause(clause.id)}
          />
        ))}
        {filterSet.clauses.length < 10 && (
          <button
            type="button"
            onClick={addClause}
            className="flex items-center gap-1 self-start text-[11px] text-neutral-400 hover:text-neutral-700"
          >
            <Plus className="h-3 w-3" />
            {t('search.addCondition')}
          </button>
        )}
      </div>
    </div>
  )
}
