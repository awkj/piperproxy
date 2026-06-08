import { useTranslation } from 'react-i18next';
import { CodeView } from '@/components/CodeView';
import { useFramesStore } from '@/store/frames';

export function FrameDetail() {
  const { t } = useTranslation();
  const log = useFramesStore((s) => s.log);
  const selectedId = useFramesStore((s) => s.selectedId);

  const entry = selectedId ? log.find((e) => e.id === selectedId) : null;

  if (!entry) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-neutral-400">
        {t('frames.selectFrame')}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-600">
        <span>
          {t(`frames.direction.${entry.direction}`)} · {entry.kind} · {entry.size}{' '}
          {t('frames.bytes')}
        </span>
      </div>
      <div className="flex-1 overflow-hidden">
        <CodeView
          value={entry.payload}
          readOnly
          height="100%"
          language={entry.kind === 'text' ? 'text' : 'text'}
        />
      </div>
    </div>
  );
}
