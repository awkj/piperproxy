import { useTranslation } from 'react-i18next'
import { useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import type { CustomCertFile } from '../../api/https'

interface CertDetailDialogProps {
  cert: CustomCertFile | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface CertStatus {
  label: string
  className: string
}

function getStatus(
  cert: CustomCertFile,
  t: ReturnType<typeof useTranslation>['t'],
): CertStatus {
  const now = Date.now()
  const before = cert.notBefore ? new Date(cert.notBefore).getTime() : NaN
  const after = cert.notAfter ? new Date(cert.notAfter).getTime() : NaN
  if (Number.isFinite(before) && before > now) {
    return { label: t('https.detail.statusInvalid'), className: 'bg-amber-100 text-amber-700' }
  }
  if (Number.isFinite(after) && after < now) {
    return { label: t('https.detail.statusExpired'), className: 'bg-red-100 text-red-700' }
  }
  if (cert.disabled) {
    return { label: t('https.detail.statusDisabled'), className: 'bg-neutral-200 text-neutral-700' }
  }
  return { label: t('https.detail.statusActive'), className: 'bg-emerald-100 text-emerald-700' }
}

function formatDate(value: string | number | undefined): string {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString()
}

export function CertDetailDialog({ cert, open, onOpenChange }: CertDetailDialogProps) {
  const { t } = useTranslation()
  const status = useMemo(() => (cert ? getStatus(cert, t) : null), [cert, t])
  const sanList = useMemo(() => {
    if (!cert?.dnsName) return [] as string[]
    return cert.dnsName.split(',').map((s) => s.trim()).filter(Boolean)
  }, [cert?.dnsName])

  if (!cert) return null

  const certName = `${cert.filename}.${cert.type ?? 'crt'}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('https.detail.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <Row label={t('https.detail.filename')}>
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs">
              {certName}
            </code>
          </Row>
          <Row label={t('https.detail.subject')}>
            <span className="font-medium">{cert.filename}</span>
          </Row>
          {cert.issuer && (
            <Row label={t('https.detail.issuer')}>
              <span className="text-neutral-700">{cert.issuer}</span>
            </Row>
          )}
          <Row label={t('https.detail.san')}>
            {sanList.length === 0 ? (
              <span className="text-neutral-400">-</span>
            ) : (
              <div className="flex flex-wrap gap-1">
                {sanList.map((s) => (
                  <span
                    key={s}
                    className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-800"
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
          </Row>
          <Row label={t('https.detail.notBefore')}>{formatDate(cert.notBefore)}</Row>
          <Row label={t('https.detail.notAfter')}>{formatDate(cert.notAfter)}</Row>
          <Row label={t('https.detail.mtime')}>
            {cert.mtime ? new Date(cert.mtime).toLocaleString() : '-'}
          </Row>
          <Row label={t('https.detail.dir')}>
            <code className="block break-all rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs">
              {cert.dir ?? '-'}
            </code>
          </Row>
          <Row label={t('https.detail.status')}>
            {status && (
              <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${status.className}`}>
                {status.label}
              </span>
            )}
          </Row>
          {cert.fingerprint && (
            <Row label={t('https.detail.fingerprint')}>
              <code className="font-mono text-xs break-all text-neutral-700">
                {cert.fingerprint}
              </code>
            </Row>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <Button variant="default" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-start gap-3">
      <span className="text-xs font-medium text-neutral-500">{label}</span>
      <div className="min-w-0 text-neutral-900">{children}</div>
    </div>
  )
}
