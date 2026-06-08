import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { useTranslation } from 'react-i18next'
import { Info, Trash2, Upload } from 'lucide-react'
import { Button } from '../ui/button'
import { Switch } from '../ui/switch'
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
import { usePiperApi } from '../../context'
import {
  CERTS_ALL_URL,
  type CustomCertFile,
  fetchAllCerts,
  removeCert,
  setCertActive,
} from '../../api/https'
import { runMutation } from '../../lib/mutate'
import { CertUploadDialog } from './CertUploadDialog'
import { CertDetailDialog } from './CertDetailDialog'

interface CertRow extends CustomCertFile {
  isRoot: boolean
  readOnly: boolean
  displayFilename: string
}

function buildRows(certs: Record<string, CustomCertFile> | undefined): CertRow[] {
  if (!certs) return []
  const rows: CertRow[] = []
  Object.entries(certs).forEach(([key, raw]) => {
    const filename = raw.filename ?? key
    const isRoot = key === 'root' || filename === 'root'
    const readOnly = key.startsWith('z/')
    const displayFilename = readOnly ? key.slice(2) : filename
    rows.push({ ...raw, filename, isRoot, readOnly, displayFilename })
  })
  rows.sort((a, b) => {
    if (a.isRoot) return -1
    if (b.isRoot) return 1
    if (a.readOnly && !b.readOnly) return -1
    if (!a.readOnly && b.readOnly) return 1
    return (b.mtime ?? 0) - (a.mtime ?? 0)
  })
  return rows
}

function formatValidity(cert: CustomCertFile): string {
  if (!cert.notBefore && !cert.notAfter) return '-'
  const fmt = (v: string | number | undefined) => {
    if (!v) return '?'
    const d = new Date(v)
    if (Number.isNaN(d.getTime())) return String(v)
    return d.toLocaleDateString()
  }
  return `${fmt(cert.notBefore)} ~ ${fmt(cert.notAfter)}`
}

function isInvalid(cert: CustomCertFile): boolean {
  const now = Date.now()
  if (cert.notBefore) {
    const t = new Date(cert.notBefore).getTime()
    if (Number.isFinite(t) && t > now) return true
  }
  if (cert.notAfter) {
    const t = new Date(cert.notAfter).getTime()
    if (Number.isFinite(t) && t < now) return true
  }
  return false
}

export function CertsManager() {
  const { t } = useTranslation()
  const client = usePiperApi()
  const { data, mutate } = useSWR(CERTS_ALL_URL, () => fetchAllCerts(client), {
    refreshInterval: 0,
  })
  const [uploadOpen, setUploadOpen] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<CertRow | null>(null)
  const [detail, setDetail] = useState<CustomCertFile | null>(null)

  const rows = useMemo(() => buildRows(data?.certs), [data?.certs])
  const certsDir = data?.dir

  const handleToggle = async (row: CertRow, next: boolean) => {
    const ok = await runMutation(
      () => setCertActive(client, row.filename, !next),
      t,
      'common.saveSuccess',
    )
    if (ok) await mutate()
  }

  const handleRemove = async () => {
    if (!pendingRemove) return
    const target = pendingRemove
    setPendingRemove(null)
    const ok = await runMutation(
      () => removeCert(client, target.filename, target.type),
      t,
      'common.deleteSuccess',
    )
    if (ok) await mutate()
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900">{t('https.customCerts')}</h3>
          {certsDir && (
            <p className="mt-0.5 break-all font-mono text-[11px] text-neutral-400">{certsDir}</p>
          )}
        </div>
        <Button variant="primary" size="sm" onClick={() => setUploadOpen(true)}>
          <Upload className="h-4 w-4" />
          {t('https.uploadCert')}
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="py-6 text-center text-sm text-neutral-400">{t('https.noCustomCerts')}</div>
      ) : (
        <div className="overflow-hidden rounded border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr>
                <th className="w-12 px-2 py-2 text-center font-medium">{t('https.table.active')}</th>
                <th className="px-2 py-2 text-left font-medium">{t('https.table.filename')}</th>
                <th className="px-2 py-2 text-left font-medium">{t('https.table.dnsName')}</th>
                <th className="px-2 py-2 text-left font-medium">{t('https.table.validity')}</th>
                <th className="w-24 px-2 py-2 text-right font-medium">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const invalid = isInvalid(row)
                return (
                  <tr
                    key={row.filename + (row.readOnly ? ':ro' : '')}
                    className={`border-t border-neutral-200 ${invalid ? 'bg-red-50/40' : ''} ${row.disabled ? 'opacity-60' : ''}`}
                  >
                    <td className="px-2 py-2 text-center">
                      {row.isRoot || row.readOnly ? (
                        <span className="text-xs text-neutral-300">-</span>
                      ) : (
                        <Switch
                          checked={!row.disabled}
                          onCheckedChange={(next) => void handleToggle(row, next)}
                          aria-label={t('https.table.toggleActive', { name: row.displayFilename })}
                        />
                      )}
                    </td>
                    <td className="min-w-0 px-2 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-mono text-xs" title={row.displayFilename}>
                          {row.displayFilename}
                          {row.type ? `.${row.type}` : ''}
                        </span>
                        {row.isRoot && (
                          <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-medium text-brand-700">
                            {t('https.table.rootBadge')}
                          </span>
                        )}
                        {row.readOnly && !row.isRoot && (
                          <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-medium text-neutral-700">
                            {t('https.table.readOnlyBadge')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="min-w-0 px-2 py-2">
                      <span className="block truncate text-xs text-neutral-700" title={row.dnsName ?? ''}>
                        {row.dnsName ?? '-'}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-xs text-neutral-700">{formatValidity(row)}</td>
                    <td className="px-2 py-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setDetail(row)}
                          aria-label={t('https.table.viewDetail')}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
                        >
                          <Info className="h-3.5 w-3.5" />
                          {t('https.table.detail')}
                        </button>
                        {!row.isRoot && !row.readOnly && (
                          <button
                            type="button"
                            onClick={() => setPendingRemove(row)}
                            aria-label={t('common.delete')}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {t('common.delete')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <CertUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={async () => { await mutate() }}
      />

      <CertDetailDialog
        cert={detail}
        open={detail !== null}
        onOpenChange={(open) => { if (!open) setDetail(null) }}
      />

      <AlertDialog
        open={pendingRemove !== null}
        onOpenChange={(open) => { if (!open) setPendingRemove(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('https.removeCertConfirm', {
                name: pendingRemove?.displayFilename ?? pendingRemove?.filename ?? '',
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('https.removeCertConfirmDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRemove()}>
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
