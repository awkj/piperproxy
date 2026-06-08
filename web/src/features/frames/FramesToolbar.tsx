import { useTranslation } from 'react-i18next';
import { Pause, Play, Plug, PlugZap, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { useFramesStore, type FrameStatus } from '@/store/frames';
import type { UseFrameSocketResult } from './useFrameSocket';

const STATUS_BADGE: Record<FrameStatus, string> = {
  idle: 'bg-neutral-200 text-neutral-700',
  connecting: 'bg-amber-100 text-amber-700',
  open: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-neutral-200 text-neutral-700',
  error: 'bg-red-100 text-red-700',
};

interface Props {
  socket: UseFrameSocketResult;
}

export function FramesToolbar({ socket }: Props) {
  const { t } = useTranslation();
  const url = useFramesStore((s) => s.url);
  const setUrl = useFramesStore((s) => s.setUrl);
  const status = useFramesStore((s) => s.status);
  const error = useFramesStore((s) => s.error);
  const paused = useFramesStore((s) => s.paused);
  const togglePaused = useFramesStore((s) => s.togglePaused);
  const clearLog = useFramesStore((s) => s.clearLog);

  const isLive = status === 'open' || status === 'connecting';

  return (
    <div className="flex flex-col gap-1.5 border-b border-neutral-200 bg-neutral-50 px-3 py-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t('frames.url')}
          spellCheck={false}
          className="h-8 flex-1 rounded-md border border-neutral-300 bg-white px-3 font-mono text-xs focus:border-brand-500 focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !isLive) socket.connect();
          }}
        />
        {isLive ? (
          <Button
            variant="default"
            size="sm"
            onClick={() => socket.disconnect()}
            title={t('frames.disconnect')}
          >
            <Plug className="h-3.5 w-3.5" />
            {t('frames.disconnect')}
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={() => socket.connect()}
            title={t('frames.connect')}
          >
            <PlugZap className="h-3.5 w-3.5" />
            {t('frames.connect')}
          </Button>
        )}
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
            STATUS_BADGE[status],
          )}
        >
          {t(`frames.status.${status}`)}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={togglePaused}
          title={paused ? t('frames.resume') : t('frames.pause')}
        >
          {paused ? (
            <Play className="h-3.5 w-3.5" />
          ) : (
            <Pause className="h-3.5 w-3.5" />
          )}
          {paused ? t('frames.resume') : t('frames.pause')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={clearLog}
          title={t('frames.clear')}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t('frames.clear')}
        </Button>
      </div>
      {error && status === 'error' && (
        <span className="text-xs text-red-600">{error}</span>
      )}
    </div>
  );
}
