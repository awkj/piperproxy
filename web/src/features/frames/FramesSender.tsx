import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CodeView } from '@/components/CodeView';
import { useFramesStore } from '@/store/frames';
import { hexToBytes } from './hex';
import type { UseFrameSocketResult } from './useFrameSocket';

type Kind = 'text' | 'binary';

interface Props {
  socket: UseFrameSocketResult;
}

export function FramesSender({ socket }: Props) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<Kind>('text');
  const [body, setBody] = useState('');
  const status = useFramesStore((s) => s.status);

  const canSend = status === 'open';

  const handleSend = () => {
    if (kind === 'text') {
      socket.send('text', body);
      return;
    }
    const bytes = hexToBytes(body);
    if (!bytes) {
      toast.error(t('frames.invalidHex'));
      return;
    }
    socket.send('binary', bytes);
  };

  return (
    <div className="flex flex-col gap-2 border-b border-neutral-200 p-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 rounded-md border border-neutral-300 bg-white p-0.5 text-xs">
          {(['text', 'binary'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={
                kind === k
                  ? 'rounded px-2 py-1 bg-brand-600 text-white'
                  : 'rounded px-2 py-1 text-neutral-700 hover:bg-neutral-100'
              }
            >
              {t(`frames.kind.${k}`)}
            </button>
          ))}
        </div>
        <span className="text-xs text-neutral-500">{t('frames.body')}</span>
        <div className="ml-auto">
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!canSend}
            onClick={handleSend}
            title={t('frames.send')}
          >
            <Send className="h-3.5 w-3.5" />
            {t('frames.send')}
          </Button>
        </div>
      </div>
      <div className="h-32 overflow-hidden rounded-md border border-neutral-200">
        <CodeView
          value={body}
          onChange={setBody}
          readOnly={false}
          language={kind === 'text' ? 'text' : 'text'}
          height="100%"
        />
      </div>
    </div>
  );
}
