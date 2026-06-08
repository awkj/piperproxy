import { useState } from 'react'
import useSWR from 'swr'
import { useTranslation } from 'react-i18next'
import { Download, ShieldCheck, Wand2 } from 'lucide-react'
import { Button } from '../ui/button'
import { Switch } from '../ui/switch'
import { usePiperApi } from '../../context'
import {
  downloadCa,
  fetchHttpsStatus,
  HTTPS_STATUS_URL,
  setEnableHttp2,
  setIntercept,
} from '../../api/https'
import { runMutation } from '../../lib/mutate'
import { CertsManager } from './CertsManager'
import { TrustWizard } from './TrustWizard'

export function HttpsPanel() {
  const { t } = useTranslation()
  const client = usePiperApi()
  const [wizardOpen, setWizardOpen] = useState(false)
  const { data: status, mutate: mutateStatus } = useSWR(
    HTTPS_STATUS_URL,
    () => fetchHttpsStatus(client),
    { refreshInterval: 0 },
  )

  const enableCapture = !!status?.enableCapture
  const enableHttp2 = !!status?.enableHttp2

  const handleToggleIntercept = async (next: boolean) => {
    const ok = await runMutation(() => setIntercept(client, next), t, 'common.saveSuccess')
    if (ok) await mutateStatus()
  }

  const handleToggleHttp2 = async (next: boolean) => {
    const ok = await runMutation(() => setEnableHttp2(client, next), t, 'common.saveSuccess')
    if (ok) await mutateStatus()
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-neutral-900">
        <ShieldCheck className="h-5 w-5 text-brand-600" />
        {t('https.title')}
      </h2>
      <p className="text-sm text-neutral-600">{t('https.trustHint')}</p>

      <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-neutral-800">{t('https.interceptHttps')}</div>
            <div className="text-xs text-neutral-500">{t('https.interceptHttpsHint')}</div>
          </div>
          <Switch
            checked={enableCapture}
            onCheckedChange={(v) => void handleToggleIntercept(v)}
            aria-label={t('https.interceptHttps')}
          />
        </div>
        <div className="flex items-center justify-between border-t border-neutral-100 pt-3">
          <div>
            <div className="text-sm font-medium text-neutral-800">{t('https.enableHttp2')}</div>
            <div className="text-xs text-neutral-500">{t('https.enableHttp2Hint')}</div>
          </div>
          <Switch
            checked={enableHttp2}
            onCheckedChange={(v) => void handleToggleHttp2(v)}
            aria-label={t('https.enableHttp2')}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-white p-4">
        <Button variant="default" onClick={() => setWizardOpen(true)}>
          <Wand2 className="h-4 w-4" />
          {t('wizard.openBtn')}
        </Button>
        <Button variant="outline" onClick={() => downloadCa(client)}>
          <Download className="h-4 w-4" />
          {t('https.downloadCa')}
        </Button>
      </div>

      <CertsManager />

      {wizardOpen && <TrustWizard onClose={() => setWizardOpen(false)} />}
    </div>
  )
}
