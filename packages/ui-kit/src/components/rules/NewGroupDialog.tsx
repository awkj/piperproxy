import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { usePiperApi } from '../../context'
import { addRuleGroup } from '../../api/rules'
import { runMutation } from '../../lib/mutate'

export function NewGroupDialog({
  existingNames,
  onClose,
  onCreated,
}: {
  existingNames: string[]
  onClose: () => void
  onCreated: (name: string) => void | Promise<void>
}) {
  const { t } = useTranslation()
  const client = usePiperApi()
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const trimmed = name.trim()
  const duplicate = existingNames.includes(trimmed)
  const invalid = !trimmed || duplicate

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('rules.newGroupDialogTitle')}</DialogTitle>
        </DialogHeader>
        <form
          className="mt-4 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault()
            if (invalid || submitting) return
            setSubmitting(true)
            const ok = await runMutation(
              () => addRuleGroup(client, trimmed, ''),
              t,
              'common.saveSuccess',
            )
            setSubmitting(false)
            if (ok) await onCreated(trimmed)
          }}
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-800">
              {t('rules.name')}
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('rules.namePlaceholder')}
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
              {t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
