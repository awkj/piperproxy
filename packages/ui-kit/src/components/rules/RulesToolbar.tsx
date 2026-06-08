import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Share2, Upload } from 'lucide-react'
import { Switch } from '../ui/switch'
import { ToolbarButton, ToolbarGroup, toolbarIconCls } from '../ui/toolbar'
import { usePiperApi } from '../../context'
import {
  exportRulesUrl,
  importRulesFile,
  setAllowMultipleChoice,
  setDisableAllRules,
  type RulesGlobalState,
} from '../../api/rules'
import { runMutation } from '../../lib/mutate'
import { toast } from 'sonner'

const TOOLBAR_SIZE = 'sm' as const
const ICON = toolbarIconCls(TOOLBAR_SIZE)

function buildRuleShareUrl(name: string, value: string): string {
  const payload = btoa(unescape(encodeURIComponent(JSON.stringify({ name, value }))))
  const base = window.location.origin + window.location.pathname
  return `${base}?ruleData=${encodeURIComponent(payload)}`
}

export function RulesToolbar({
  global,
  onChanged,
  activeRule,
}: {
  global: RulesGlobalState | undefined
  onChanged: () => void | Promise<void>
  activeRule?: { name: string; value: string } | undefined
}) {
  const { t } = useTranslation()
  const client = usePiperApi()
  const fileRef = useRef<HTMLInputElement>(null)

  const handleShare = async () => {
    if (!activeRule) {
      toast.error(t('rules.shareNoRule'))
      return
    }
    const url = buildRuleShareUrl(activeRule.name, activeRule.value)
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t('rules.shareSuccess'))
    } catch {
      toast.error(url)
    }
  }

  const handleImport = async (file: File) => {
    try {
      const res = await importRulesFile(client, file, false)
      if (res && res.ec === 2) {
        toast.error(res.em ?? t('errors.fetchFailed'))
        return
      }
      toast.success(t('rules.importSuccess'))
      await onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <ToolbarGroup size={TOOLBAR_SIZE} className="border-b border-neutral-200 bg-white px-3 py-1">
      <label className="flex items-center gap-1.5 text-[12px] text-neutral-700">
        <Switch
          checked={!!global?.disabledAllRules}
          onCheckedChange={async (checked) => {
            const ok = await runMutation(
              () => setDisableAllRules(client, checked),
              t,
              'common.saveSuccess',
            )
            if (ok) await onChanged()
          }}
          aria-label={t('rules.disableAllRules')}
        />
        <span>{t('rules.disableAllRules')}</span>
      </label>
      <label className="flex items-center gap-1.5 text-[12px] text-neutral-700">
        <Switch
          checked={!!global?.allowMultipleChoice}
          onCheckedChange={async (checked) => {
            const ok = await runMutation(
              () => setAllowMultipleChoice(client, checked),
              t,
              'common.saveSuccess',
            )
            if (ok) await onChanged()
          }}
          aria-label={t('rules.allowMultipleChoice')}
        />
        <span>{t('rules.allowMultipleChoice')}</span>
      </label>
      <div className="ml-auto flex items-center gap-1.5">
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.json,application/json,text/plain"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleImport(file)
            e.target.value = ''
          }}
        />
        <ToolbarButton onClick={() => fileRef.current?.click()}>
          <Upload className={ICON} />
          {t('rules.import')}
        </ToolbarButton>
        <ToolbarButton onClick={() => window.open(exportRulesUrl(client))}>
          <Download className={ICON} />
          {t('rules.export')}
        </ToolbarButton>
        <ToolbarButton
          onClick={() => void handleShare()}
          disabled={!activeRule}
          title={t('rules.shareTitle')}
        >
          <Share2 className={ICON} />
          {t('rules.share')}
        </ToolbarButton>
      </div>
    </ToolbarGroup>
  )
}
