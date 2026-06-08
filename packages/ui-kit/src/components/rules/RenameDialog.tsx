import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { usePiperApi } from '../../context'
import { renameRuleGroup } from '../../api/rules'
import { runMutation } from '../../lib/mutate'

export function RenameDialog({
  name,
  existingNames,
  onClose,
  onRenamed,
}: {
  name: string
  existingNames: string[]
  onClose: () => void
  onRenamed: (newName: string) => void | Promise<void>
}) {
  const { t } = useTranslation()
  const client = usePiperApi()
  const [newName, setNewName] = useState(name)
  const [submitting, setSubmitting] = useState(false)

  const trimmed = newName.trim()
  const duplicate = trimmed !== name && existingNames.includes(trimmed)
  const invalid = !trimmed || trimmed === name || duplicate

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('rules.renameDialogTitle')}</DialogTitle>
          <DialogDescription>{name}</DialogDescription>
        </DialogHeader>
        <form
          className="mt-4 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault()
            if (invalid || submitting) return
            setSubmitting(true)
            const ok = await runMutation(
              () => renameRuleGroup(client, name, trimmed),
              t,
              'common.saveSuccess',
            )
            setSubmitting(false)
            if (ok) await onRenamed(trimmed)
          }}
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-800">
              {t('rules.newName')}
            </label>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
            {duplicate && (
              <p className="mt-1 text-xs text-red-600">{t('rules.duplicateName')}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="default" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={invalid || submitting}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
