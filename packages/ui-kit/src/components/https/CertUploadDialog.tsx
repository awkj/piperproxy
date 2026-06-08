import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileUp } from 'lucide-react'
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
import { uploadCerts, type CertUploadEntry } from '../../api/https'
import { runMutation } from '../../lib/mutate'

const PEM_CERT_RE = /-----BEGIN [A-Z ]*CERTIFICATE-----/
const PEM_KEY_RE = /-----BEGIN (?:[A-Z0-9 ]*PRIVATE KEY|RSA PRIVATE KEY|EC PRIVATE KEY)-----/
const FILENAME_RE = /^[A-Za-z0-9._-]+$/

interface CertUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUploaded?: () => void | Promise<void>
}

type CertExt = 'crt' | 'cer' | 'pem'

function parseExt(name: string): CertExt {
  const m = /\.(crt|cer|pem)$/i.exec(name)
  return m ? (m[1].toLowerCase() as CertExt) : 'crt'
}

export function CertUploadDialog({ open, onOpenChange, onUploaded }: CertUploadDialogProps) {
  const { t } = useTranslation()
  const client = usePiperApi()
  const [filename, setFilename] = useState('')
  const [certText, setCertText] = useState('')
  const [keyText, setKeyText] = useState('')
  const [type, setType] = useState<CertExt>('crt')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const certFileRef = useRef<HTMLInputElement>(null)
  const keyFileRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setFilename('')
    setCertText('')
    setKeyText('')
    setType('crt')
    setError(null)
    setSubmitting(false)
  }

  const handleClose = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const pickFile = async (file: File, target: 'cert' | 'key'): Promise<void> => {
    const text = await file.text()
    if (target === 'cert') {
      setCertText(text)
      const ext = parseExt(file.name)
      setType(ext)
      if (!filename) {
        const dot = file.name.lastIndexOf('.')
        setFilename(dot > 0 ? file.name.slice(0, dot) : file.name)
      }
    } else {
      setKeyText(text)
    }
  }

  const validate = (): string | null => {
    const name = filename.trim()
    if (!name) return t('https.upload.errFilenameRequired')
    if (name.length > 128) return t('https.upload.errFilenameTooLong')
    if (!FILENAME_RE.test(name)) return t('https.upload.errFilenameInvalid')
    if (name === 'root') return t('https.upload.errFilenameReserved')
    if (!certText.trim()) return t('https.upload.errCertRequired')
    if (!PEM_CERT_RE.test(certText)) return t('https.upload.errCertFormat')
    if (!keyText.trim()) return t('https.upload.errKeyRequired')
    if (!PEM_KEY_RE.test(keyText)) return t('https.upload.errKeyFormat')
    return null
  }

  const handleSubmit = async () => {
    const msg = validate()
    if (msg) {
      setError(msg)
      return
    }
    setError(null)
    setSubmitting(true)
    const payload: Record<string, CertUploadEntry> = {
      [filename.trim()]: { cert: certText, key: keyText, type },
    }
    const ok = await runMutation(
      () => uploadCerts(client, payload),
      t,
      'common.uploadSuccess',
    )
    setSubmitting(false)
    if (ok) {
      await onUploaded?.()
      reset()
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('https.upload.title')}</DialogTitle>
          <DialogDescription>{t('https.upload.desc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_140px] gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-700">
                {t('https.upload.filename')}
              </span>
              <input
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder={t('https.upload.filenamePlaceholder')}
                className="w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-neutral-700">
                {t('https.upload.type')}
              </span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as CertExt)}
                className="h-[34px] w-full rounded border border-neutral-300 bg-white px-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="crt">.crt</option>
                <option value="cer">.cer</option>
                <option value="pem">.pem</option>
              </select>
            </label>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-700">{t('https.upload.certPem')}</span>
              <button
                type="button"
                onClick={() => certFileRef.current?.click()}
                className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-500"
              >
                <FileUp className="h-3 w-3" />
                {t('https.upload.pickFile')}
              </button>
              <input
                ref={certFileRef}
                type="file"
                accept=".crt,.cer,.pem"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void pickFile(f, 'cert')
                  e.target.value = ''
                }}
              />
            </div>
            <textarea
              value={certText}
              onChange={(e) => setCertText(e.target.value)}
              placeholder={'-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----'}
              rows={6}
              className="w-full resize-y rounded border border-neutral-300 bg-white p-2 font-mono text-xs leading-relaxed focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              spellCheck={false}
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-700">{t('https.upload.keyPem')}</span>
              <button
                type="button"
                onClick={() => keyFileRef.current?.click()}
                className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-500"
              >
                <FileUp className="h-3 w-3" />
                {t('https.upload.pickFile')}
              </button>
              <input
                ref={keyFileRef}
                type="file"
                accept=".key"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void pickFile(f, 'key')
                  e.target.value = ''
                }}
              />
            </div>
            <textarea
              value={keyText}
              onChange={(e) => setKeyText(e.target.value)}
              placeholder={'-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'}
              rows={6}
              className="w-full resize-y rounded border border-neutral-300 bg-white p-2 font-mono text-xs leading-relaxed focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              spellCheck={false}
            />
          </div>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="default" onClick={() => handleClose(false)} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? t('common.loading') : t('https.upload.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
