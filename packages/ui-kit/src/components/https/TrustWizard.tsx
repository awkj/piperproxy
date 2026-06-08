import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { useTranslation } from 'react-i18next'
import QRCode from 'qrcode'
import {
  Activity,
  CheckCircle,
  ChevronRight,
  Download,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
  HelpCircle,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { Button } from '../ui/button'
import { usePiperApi } from '../../context'
import {
  CA_INFO_URL,
  fetchCAInfo,
  installCATrust,
  rotateCA,
  resetCA,
  type CAInfo,
} from '../../api/wizard'
import { fetchDiagnostics, type DiagnosticItem } from '../../api/setup'
import { downloadCa } from '../../api/https'
import { fetchNetworkInterfaces } from '../../api/network'

type Step = 'overview' | 'install' | 'rotate' | 'reset' | 'diagnose'

const NETWORK_INTERFACES_URL = 'api/network/interfaces'

function CAAlgBadge({ alg }: { alg: string }) {
  const isECDSA = alg.includes('ECDSA')
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold',
        isECDSA ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700',
      )}
    >
      {isECDSA ? 'P-256 ECDSA' : 'RSA-2048'}
    </span>
  )
}

function CAInfoCard({ info }: { info: CAInfo }) {
  const { t } = useTranslation()
  const now = Date.now() / 1000
  const daysLeft = Math.floor((info.notAfter - now) / 86400)
  const expireSoon = daysLeft < 30

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-700">{t('wizard.caInfo.algorithm')}</span>
        <CAAlgBadge alg={info.algorithm} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-700">{t('wizard.caInfo.subject')}</span>
        <span className="text-sm text-neutral-600">{info.subject}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-700">{t('wizard.caInfo.expires')}</span>
        <span className={cn('text-sm', expireSoon ? 'text-amber-600 font-semibold' : 'text-neutral-600')}>
          {new Date(info.notAfter * 1000).toLocaleDateString()} ({daysLeft}d)
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-700">{t('wizard.caInfo.fingerprint')}</span>
        <span className="font-mono text-xs text-neutral-500">{info.fingerprint}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-700">{t('wizard.caInfo.keyStorage')}</span>
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-neutral-100 text-neutral-500">
          {t('wizard.caInfo.keyFile')}
        </span>
      </div>
    </div>
  )
}

function PlatformInstallGuide({ platform }: { platform: 'macos' | 'linux' | 'windows' | 'ios' | 'android' }) {
  const { t } = useTranslation()
  const guides: Record<string, { title: string; steps: string[] }> = {
    macos: {
      title: t('wizard.guide.macos.title'),
      steps: [t('wizard.guide.macos.step1'), t('wizard.guide.macos.step2'), t('wizard.guide.macos.step3'), t('wizard.guide.macos.step4')],
    },
    linux: {
      title: t('wizard.guide.linux.title'),
      steps: [t('wizard.guide.linux.step1'), t('wizard.guide.linux.step2'), t('wizard.guide.linux.step3')],
    },
    windows: {
      title: t('wizard.guide.windows.title'),
      steps: [t('wizard.guide.windows.step1'), t('wizard.guide.windows.step2'), t('wizard.guide.windows.step3'), t('wizard.guide.windows.step4')],
    },
    ios: {
      title: t('wizard.guide.ios.title'),
      steps: [t('wizard.guide.ios.step1'), t('wizard.guide.ios.step2'), t('wizard.guide.ios.step3'), t('wizard.guide.ios.step4'), t('wizard.guide.ios.step5')],
    },
    android: {
      title: t('wizard.guide.android.title'),
      steps: [t('wizard.guide.android.step1'), t('wizard.guide.android.step2'), t('wizard.guide.android.step3'), t('wizard.guide.android.step4')],
    },
  }
  const guide = guides[platform]
  if (!guide) return null
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-neutral-800">{guide.title}</div>
      <ol className="space-y-1.5 pl-4">
        {guide.steps.map((step, i) => (
          <li key={i} className="text-sm text-neutral-600 list-decimal">{step}</li>
        ))}
      </ol>
    </div>
  )
}

type PlatformId = 'macos' | 'linux' | 'windows' | 'ios' | 'android'

const PLATFORMS: { id: PlatformId; labelKey: string }[] = [
  { id: 'macos', labelKey: 'wizard.platform.macos' },
  { id: 'linux', labelKey: 'wizard.platform.linux' },
  { id: 'windows', labelKey: 'wizard.platform.windows' },
  { id: 'ios', labelKey: 'wizard.platform.ios' },
  { id: 'android', labelKey: 'wizard.platform.android' },
]

function MobileQRCode({ platform, client }: { platform: PlatformId; client: ReturnType<typeof usePiperApi> }) {
  const { t } = useTranslation()
  const { data: interfaces } = useSWR(NETWORK_INTERFACES_URL, () => fetchNetworkInterfaces(client))
  const [qrDataUrl, setQrDataUrl] = useState('')

  const lanIP = interfaces?.interfaces?.find((i) => i.kind !== 'loopback')?.ip ?? '127.0.0.1'
  const port = interfaces?.proxyPort ?? 8899
  const caUrl = `http://${lanIP}:${port}/api/certs/root.pem`

  useEffect(() => {
    if (platform !== 'ios' && platform !== 'android') {
      setQrDataUrl('')
      return
    }
    QRCode.toDataURL(caUrl, { width: 160, margin: 1, color: { dark: '#000', light: '#fff' } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''))
  }, [caUrl, platform])

  if (platform !== 'ios' && platform !== 'android') return null

  return (
    <div className="mt-3 flex flex-col items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <div className="text-xs text-neutral-500">{t('wizard.install.qrCode')}</div>
      {qrDataUrl ? (
        <img src={qrDataUrl} alt="QR code" className="h-32 w-32 rounded" />
      ) : (
        <div className="h-32 w-32 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
        </div>
      )}
      <code className="text-xs text-neutral-500 break-all text-center">{caUrl}</code>
    </div>
  )
}

function InstallStep({
  onBack,
  info,
  mutateInfo,
  client,
}: {
  onBack: () => void
  info: CAInfo
  mutateInfo: () => void
  client: ReturnType<typeof usePiperApi>
}) {
  const { t } = useTranslation()
  const [activePlatform, setActivePlatform] = useState<PlatformId>('macos')
  const [installing, setInstalling] = useState(false)
  const [installResult, setInstallResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const handleAutoInstall = async () => {
    setInstalling(true)
    setInstallResult(null)
    try {
      const res = await installCATrust(client)
      setInstallResult({ ok: res.ok, msg: res.output || t('wizard.install.success') })
      mutateInfo()
    } catch (e) {
      setInstallResult({ ok: false, msg: String(e) })
    } finally {
      setInstalling(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-neutral-400 hover:text-neutral-600">
          <ChevronRight className="h-4 w-4 rotate-180" />
        </button>
        <h3 className="font-semibold text-neutral-900">{t('wizard.install.title')}</h3>
      </div>
      <CAInfoCard info={info} />
      <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="text-sm font-semibold text-neutral-700">{t('wizard.install.autoInstall')}</div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={() => void handleAutoInstall()} disabled={installing} size="sm">
            {installing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <ShieldCheck className="h-3.5 w-3.5 mr-1" />}
            {t('wizard.install.autoBtn')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadCa(client)}>
            <Download className="h-3.5 w-3.5 mr-1" />
            {t('wizard.install.download')}
          </Button>
        </div>
        {installResult && (
          <div className={cn('flex items-start gap-2 rounded p-2 text-sm', installResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>
            {installResult.ok ? <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" /> : <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />}
            <span className="break-all">{installResult.msg}</span>
          </div>
        )}
      </div>
      <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="text-sm font-semibold text-neutral-700">{t('wizard.install.manualGuide')}</div>
        <div className="flex flex-wrap gap-1">
          {PLATFORMS.map(({ id, labelKey }) => (
            <button
              key={id}
              onClick={() => setActivePlatform(id)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                activePlatform === id
                  ? 'bg-brand-600 text-white'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200',
              )}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
        <PlatformInstallGuide platform={activePlatform} />
        <MobileQRCode platform={activePlatform} client={client} />
      </div>
    </div>
  )
}

function RotateStep({
  onBack,
  mutateInfo,
  client,
}: {
  onBack: () => void
  mutateInfo: () => void
  client: ReturnType<typeof usePiperApi>
}) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const handleRotate = async () => {
    setLoading(true)
    try {
      await rotateCA(client)
      setDone(true)
      mutateInfo()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-neutral-400 hover:text-neutral-600">
          <ChevronRight className="h-4 w-4 rotate-180" />
        </button>
        <h3 className="font-semibold text-neutral-900">{t('wizard.rotate.title')}</h3>
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 space-y-1">
        <p className="font-semibold">{t('wizard.rotate.warning')}</p>
        <p>{t('wizard.rotate.desc')}</p>
      </div>
      {done ? (
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle className="h-5 w-5" />
          <span className="text-sm font-medium">{t('wizard.rotate.done')}</span>
        </div>
      ) : (
        <Button variant="default" onClick={() => void handleRotate()} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {t('wizard.rotate.confirm')}
        </Button>
      )}
    </div>
  )
}

function ResetStep({
  onBack,
  mutateInfo,
  client,
}: {
  onBack: () => void
  mutateInfo: () => void
  client: ReturnType<typeof usePiperApi>
}) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const handleReset = async () => {
    setLoading(true)
    try {
      await resetCA(client)
      setDone(true)
      mutateInfo()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-neutral-400 hover:text-neutral-600">
          <ChevronRight className="h-4 w-4 rotate-180" />
        </button>
        <h3 className="font-semibold text-neutral-900">{t('wizard.reset.title')}</h3>
      </div>
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 space-y-1">
        <p className="font-semibold">{t('wizard.reset.warning')}</p>
        <p>{t('wizard.reset.desc')}</p>
      </div>
      {done ? (
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle className="h-5 w-5" />
          <span className="text-sm font-medium">{t('wizard.reset.done')}</span>
        </div>
      ) : (
        <Button variant="destructive" onClick={() => void handleReset()} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          {t('wizard.reset.confirm')}
        </Button>
      )}
    </div>
  )
}

function DiagnosticRow({ item }: { item: DiagnosticItem }) {
  const statusIcon =
    item.status === 'ok' ? (
      <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
    ) : item.status === 'missing' ? (
      <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
    ) : (
      <HelpCircle className="h-4 w-4 text-neutral-400 shrink-0 mt-0.5" />
    )

  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg p-3 text-sm',
        item.status === 'ok'
          ? 'bg-green-50 border border-green-100'
          : item.status === 'missing'
            ? 'bg-red-50 border border-red-100'
            : 'bg-neutral-50 border border-neutral-200',
      )}
    >
      {statusIcon}
      <div>
        <div className="font-medium text-neutral-800">{item.name}</div>
        <div className="text-xs text-neutral-500 mt-0.5 break-all">{item.message}</div>
      </div>
    </div>
  )
}

function DiagnoseStep({
  onBack,
  client,
}: {
  onBack: () => void
  client: ReturnType<typeof usePiperApi>
}) {
  const { t } = useTranslation()
  const { data, isLoading, mutate } = useSWR(
    'api/setup/diagnose',
    () => fetchDiagnostics(client),
    { revalidateOnFocus: false },
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-neutral-400 hover:text-neutral-600">
          <ChevronRight className="h-4 w-4 rotate-180" />
        </button>
        <h3 className="font-semibold text-neutral-900">{t('wizard.diagnose.title')}</h3>
        <button
          onClick={() => void mutate()}
          className="ml-auto text-neutral-400 hover:text-neutral-600"
          title={t('wizard.diagnose.refresh')}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-8 text-sm text-neutral-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {t('common.loading')}
        </div>
      ) : data ? (
        <div className="space-y-2">
          <div className="text-xs text-neutral-400 uppercase tracking-wide font-semibold">{data.os}</div>
          {data.items.map((item, i) => (
            <DiagnosticRow key={i} item={item} />
          ))}
        </div>
      ) : (
        <div className="text-sm text-neutral-400 text-center py-6">{t('common.empty')}</div>
      )}
    </div>
  )
}

function OverviewStep({ info, onNavigate }: { info: CAInfo; onNavigate: (step: Step) => void }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-brand-600" />
        <h3 className="font-semibold text-neutral-900">{t('wizard.title')}</h3>
      </div>
      <p className="text-sm text-neutral-600">{t('wizard.desc')}</p>
      <CAInfoCard info={info} />
      <div className="space-y-2">
        {[
          { step: 'install' as Step, icon: <ShieldCheck className="h-4 w-4 text-brand-500" />, key: 'wizard.action.install' },
          { step: 'diagnose' as Step, icon: <Activity className="h-4 w-4 text-blue-500" />, key: 'wizard.action.diagnose' },
          { step: 'rotate' as Step, icon: <RefreshCw className="h-4 w-4 text-amber-500" />, key: 'wizard.action.rotate' },
          { step: 'reset' as Step, icon: <RotateCcw className="h-4 w-4 text-red-500" />, key: 'wizard.action.reset' },
        ].map(({ step, icon, key }) => (
          <button
            key={step}
            onClick={() => onNavigate(step)}
            className="flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-white p-3 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {icon}
              <span className="font-medium">{t(key)}</span>
            </div>
            <ChevronRight className="h-4 w-4 text-neutral-400" />
          </button>
        ))}
      </div>
    </div>
  )
}

interface TrustWizardProps {
  onClose: () => void
}

export function TrustWizard({ onClose }: TrustWizardProps) {
  const { t } = useTranslation()
  const client = usePiperApi()
  const { data: info, isLoading, mutate } = useSWR(CA_INFO_URL, () => fetchCAInfo(client), {
    revalidateOnFocus: false,
  })
  const [step, setStep] = useState<Step>('overview')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative w-full max-w-lg mx-4 rounded-xl border border-neutral-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
          <span className="font-semibold text-neutral-900">{t('wizard.dialogTitle')}</span>
          <button
            onClick={onClose}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 max-h-[70vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-sm text-neutral-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('common.loading')}
            </div>
          ) : !info ? (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              {t('wizard.caNotAvailable')}
            </div>
          ) : step === 'overview' ? (
            <OverviewStep info={info} onNavigate={setStep} />
          ) : step === 'install' ? (
            <InstallStep info={info} onBack={() => setStep('overview')} mutateInfo={() => mutate()} client={client} />
          ) : step === 'rotate' ? (
            <RotateStep onBack={() => setStep('overview')} mutateInfo={() => mutate()} client={client} />
          ) : step === 'reset' ? (
            <ResetStep onBack={() => setStep('overview')} mutateInfo={() => mutate()} client={client} />
          ) : step === 'diagnose' ? (
            <DiagnoseStep onBack={() => setStep('overview')} client={client} />
          ) : null}
        </div>
      </div>
    </div>
  )
}
