import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { useTranslation } from 'react-i18next'
import { Plus, Save } from 'lucide-react'
import { Button } from '../ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog'
import { CodeView } from '../CodeView'
import { usePiperApi } from '../../context'
import {
  disableRule,
  enableRule,
  fetchRulesGlobalState,
  fetchRulesList,
  removeRuleGroup,
  RULES_GLOBAL_URL,
  RULES_LIST_URL,
  saveRule,
  toggleDefaultRulesDisabled,
  type RuleItem,
} from '../../api/rules'
import { runMutation } from '../../lib/mutate'
import { useEditorPrefs } from '../../lib/editor-prefs'
import { NewGroupDialog } from './NewGroupDialog'
import { RenameDialog } from './RenameDialog'
import { RuleListItem } from './RuleListItem'
import { RulesToolbar } from './RulesToolbar'
import { createWhistleAutocompletion } from './cm-whistle-autocomplete'
import { useRulesAutocompleteData } from './use-rules-autocomplete-data'

export function RulesPanel() {
  const { t } = useTranslation()
  const client = usePiperApi()
  const { prefs: editorPrefs } = useEditorPrefs('rules')

  const { data, mutate, isLoading } = useSWR(
    RULES_LIST_URL,
    () => fetchRulesList(client),
    { refreshInterval: 0, revalidateOnFocus: false },
  )
  const { data: global, mutate: mutateGlobal } = useSWR(
    RULES_GLOBAL_URL,
    () => fetchRulesGlobalState(client),
    { refreshInterval: 0, revalidateOnFocus: false },
  )

  const list: RuleItem[] = useMemo(() => data ?? [], [data])
  const existingNames = useMemo(() => list.map((r) => r.name), [list])

  const varProvider = useRulesAutocompleteData()

  const autocompleteExt = useMemo(
    () =>
      createWhistleAutocompletion({
        labels: {
          host: t('rules.completion.host'),
          req: t('rules.completion.req'),
          res: t('rules.completion.res'),
          proxy: t('rules.completion.proxy'),
          plugin: t('rules.completion.plugin'),
          filter: t('rules.completion.filter'),
          control: t('rules.completion.control'),
          misc: t('rules.completion.misc'),
        },
        subLabels: {
          filter: t('rules.hints.filter'),
          header: t('rules.hints.header'),
          delete: t('rules.hints.delete'),
          lineProps: t('rules.hints.lineProps'),
          enable: t('rules.hints.enable'),
          disable: t('rules.hints.disable'),
        },
        varLabels: {
          value: t('rules.hints.value'),
          plugin: t('rules.hints.plugin'),
          pluginVar: t('rules.hints.pluginVar'),
        },
        varProvider,
      }),
    [t, varProvider],
  )

  const [activeName, setActiveName] = useState<string>('Default')
  const [draft, setDraft] = useState<string>('')
  const [dirty, setDirty] = useState(false)

  const [showNewDialog, setShowNewDialog] = useState(false)
  const [renameTarget, setRenameTarget] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const active = list.find((r) => r.name === activeName)

  useEffect(() => {
    if (active && !dirty) {
      setDraft(active.value ?? '')
    }
  }, [active?.value, activeName]) // eslint-disable-line react-hooks/exhaustive-deps

  const refreshAll = async () => {
    await Promise.all([mutate(), mutateGlobal()])
  }

  const onSave = async () => {
    if (!active) return
    const ok = await runMutation(
      () => saveRule(client, active.name, draft),
      t,
      'rules.saveHint',
    )
    if (ok) {
      setDirty(false)
      await mutate()
    }
  }

  // Cmd+S / Ctrl+S 保存规则
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (dirtyRef.current) void onSaveRef.current()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const onToggleEnabled = async (item: RuleItem, next: boolean) => {
    if (item.name === 'Default') {
      const ok = await runMutation(
        () => toggleDefaultRulesDisabled(client),
        t,
        'common.saveSuccess',
      )
      if (ok) await mutateGlobal()
      return
    }
    const ok = await runMutation(
      () => (next ? enableRule(client, item.name, item.value ?? '') : disableRule(client, item.name)),
      t,
      'common.saveSuccess',
    )
    if (ok) await mutateGlobal()
  }

  const onConfirmDelete = async () => {
    if (!deleteTarget) return
    const target = deleteTarget
    setDeleteTarget(null)
    const ok = await runMutation(
      () => removeRuleGroup(client, target),
      t,
      'common.deleteSuccess',
    )
    if (ok) {
      if (activeName === target) {
        setActiveName('Default')
        setDirty(false)
      }
      await refreshAll()
    }
  }

  const isEnabled = (item: RuleItem): boolean => {
    if (!global) return false
    if (item.name === 'Default') return !global.defaultRulesIsDisabled
    return global.selectedNames.includes(item.name)
  }

  return (
    <div className="flex h-full flex-col">
      <RulesToolbar global={global} onChanged={refreshAll} activeRule={active} />

      <div className="flex flex-1 overflow-hidden">
        <aside className="flex w-56 flex-col border-r border-neutral-200 bg-neutral-50">
          <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2">
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              {t('nav.rules')}
            </span>
            <button
              type="button"
              onClick={() => setShowNewDialog(true)}
              className="rounded p-1 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900"
              title={t('rules.addGroup')}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-auto py-1">
            {isLoading ? (
              <div className="px-3 py-2 text-xs text-neutral-400">{t('common.loading')}</div>
            ) : list.length === 0 ? (
              <div className="px-3 py-2 text-xs text-neutral-400">{t('rules.noRules')}</div>
            ) : (
              list.map((item) => (
                <RuleListItem
                  key={item.name}
                  item={item}
                  selected={item.name === activeName}
                  enabled={isEnabled(item)}
                  protectedItem={item.name === 'Default'}
                  onSelect={() => {
                    setActiveName(item.name)
                    setDirty(false)
                  }}
                  onToggleEnabled={(next) => void onToggleEnabled(item, next)}
                  onRename={() => setRenameTarget(item.name)}
                  onDelete={() => setDeleteTarget(item.name)}
                />
              ))
            )}
          </div>
        </aside>

        <main className="flex flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2">
            <span className="text-sm font-medium text-neutral-700">
              {active?.name === 'Default' ? t('rules.default') : (active?.name ?? '—')}
            </span>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void onSave()}
              disabled={!dirty}
              className="ml-auto"
            >
              <Save className="h-3.5 w-3.5" />
              {t('common.save')}
            </Button>
          </div>
          <div className="flex-1 overflow-hidden">
            <CodeView
              value={draft}
              language="whistle"
              readOnly={false}
              height="100%"
              extraExtensions={autocompleteExt}
              theme={editorPrefs.theme}
              fontSize={editorPrefs.fontSize}
              lineNumbers={editorPrefs.lineNumbers}
              lineWrapping={editorPrefs.lineWrapping}
              foldGutter={editorPrefs.foldGutter}
              onChange={(v) => {
                setDraft(v)
                setDirty(true)
              }}
            />
          </div>
        </main>
      </div>

      {showNewDialog && (
        <NewGroupDialog
          existingNames={existingNames}
          onClose={() => setShowNewDialog(false)}
          onCreated={async (name) => {
            setShowNewDialog(false)
            await refreshAll()
            setActiveName(name)
            setDirty(false)
          }}
        />
      )}

      {renameTarget && (
        <RenameDialog
          name={renameTarget}
          existingNames={existingNames}
          onClose={() => setRenameTarget(null)}
          onRenamed={async (newName) => {
            const wasActive = activeName === renameTarget
            setRenameTarget(null)
            await refreshAll()
            if (wasActive) setActiveName(newName)
          }}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('rules.deleteConfirm', { name: deleteTarget ?? '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('rules.deleteConfirmDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void onConfirmDelete()}
              className="bg-red-600 text-white hover:bg-red-500"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
