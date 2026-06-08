import { useTranslation } from 'react-i18next'
import { TYPE_FILTERS, useNetworkStore, type TypeFilter } from '../../stores/network'
import { ToolbarButton } from '../ui/toolbar'

export function TypeFilterTabs() {
  const { t } = useTranslation()
  const typeFilter = useNetworkStore((s) => s.typeFilter)
  const setTypeFilter = useNetworkStore((s) => s.setTypeFilter)

  return (
    <div className="flex items-center gap-1 overflow-x-auto">
      {TYPE_FILTERS.map((key: TypeFilter) => {
        const active = typeFilter === key
        return (
          <ToolbarButton
            key={key}
            tone={active ? 'info' : 'ghost'}
            active={active}
            onClick={() => setTypeFilter(key)}
          >
            {t(`network.typeFilter.${key}`)}
          </ToolbarButton>
        )
      })}
    </div>
  )
}
