import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CHECK_UPDATE_URL, fetchCheckUpdate } from '@/api/version';
import { useUIStore } from '@/store/ui';

interface AboutDialogProps {
  clientVersion?: string;
}

function compareVersion(a?: string, b?: string): number {
  if (!a || !b) return 0;
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const ai = pa[i] ?? 0;
    const bi = pb[i] ?? 0;
    if (ai > bi) return 1;
    if (ai < bi) return -1;
  }
  return 0;
}

export function AboutDialog({ clientVersion }: AboutDialogProps) {
  const { t } = useTranslation();
  const open = useUIStore((s) => s.aboutOpen);
  const setOpen = useUIStore((s) => s.setAboutOpen);

  const { data } = useSWR(open ? CHECK_UPDATE_URL : null, fetchCheckUpdate, {
    revalidateOnFocus: false,
  });

  const version = data?.version;
  const latest = data?.latestVersion;
  const latestClient = data?.latestClientVersion;
  const hasNewWhistle = compareVersion(latest, version) > 0;
  const hasNewClient =
    !!clientVersion &&
    !!latestClient &&
    compareVersion(latestClient, clientVersion) > 0;

  const docHref = `https://wproxy.org/?type=${
    clientVersion ? 'electron' : 'nodejs'
  }&version=${version ?? ''}`;
  const updateHref = 'https://wproxy.org/docs/faq.html#update';
  const changelogHref =
    'https://github.com/avwo/whistle/blob/master/CHANGELOG.md';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <div className="flex items-start gap-4">
          <img
            alt="piper"
            src="/img/piper-logo.svg"
            className="h-16 w-16 shrink-0"
          />
          <div className="flex flex-col gap-1 text-sm text-neutral-700">
            <DialogTitle>{t('about.title')}</DialogTitle>

            {clientVersion && (
              <div>
                <span>{t('about.clientVersionLabel')}</span>
                <a
                  className="text-brand-600 hover:underline"
                  href="https://github.com/avwo/whistle-client/blob/main/CHANGELOG.md"
                  target="_blank"
                  rel="noreferrer"
                >
                  {clientVersion}
                </a>
                {hasNewClient && (
                  <a
                    className="ml-2 text-red-600 hover:underline"
                    title={t('about.updateClient')}
                    href={updateHref}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t('about.newVersionTag', { version: latestClient })}
                  </a>
                )}
              </div>
            )}

            <div>
              <span>
                {clientVersion
                  ? t('about.whistleVersionLabel')
                  : t('about.versionLabel')}
              </span>
              <a
                className="text-brand-600 hover:underline"
                title={t('about.viewChangelog')}
                href={changelogHref}
                target="_blank"
                rel="noreferrer"
              >
                {version ?? '—'}
              </a>
              {hasNewWhistle && (
                <a
                  className="ml-2 text-red-600 hover:underline"
                  title={
                    clientVersion
                      ? t('about.updateClient')
                      : t('about.updateWhistle')
                  }
                  href={updateHref}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('about.newVersionTag', { version: latest })}
                </a>
              )}
            </div>

            <div>
              {t('about.visit')}{' '}
              <a
                className="text-brand-600 hover:underline"
                href={docHref}
                target="_blank"
                rel="noreferrer"
              >
                https://wproxy.org
              </a>
            </div>
          </div>
        </div>

        <DialogFooter>
          {(hasNewWhistle || hasNewClient) && (
            <Button
              variant="primary"
              onClick={() => window.open(updateHref, '_blank', 'noreferrer')}
            >
              {t('about.updateNow')}
            </Button>
          )}
          <Button variant="default" onClick={() => setOpen(false)}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
