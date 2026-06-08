import { useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface IframeDialogProps {
  /** 是否打开 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** iframe src */
  src: string;
  /** 对话框标题 */
  title?: string;
}

/**
 * 通用 iframe 对话框，占视窗 90% × 80%。
 * iframe 使用 sandbox 限制（allow-scripts allow-same-origin allow-forms）。
 */
export function IframeDialog({ open, onClose, src, title }: IframeDialogProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // 每次 src 变化时重置状态
  useEffect(() => {
    if (open) {
      setLoading(true);
      setError(false);
    }
  }, [src, open]);

  const handleLoad = () => {
    setLoading(false);
    setError(false);
  };

  const handleError = () => {
    setLoading(false);
    setError(true);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        {/* overlay */}
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/40',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          )}
        />

        {/* content */}
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex flex-col -translate-x-1/2 -translate-y-1/2',
            'w-[90vw] h-[80vh]',
            'rounded-lg border border-neutral-200 bg-white shadow-lg focus:outline-none',
          )}
        >
          {/* header */}
          <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-3">
            <DialogPrimitive.Title className="truncate text-sm font-semibold text-neutral-900">
              {title ?? 'Plugin UI'}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              onClick={onClose}
              className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          {/* body */}
          <div className="relative flex-1 overflow-hidden">
            {/* loading spinner */}
            {loading && !error && (
              <div className="absolute inset-0 flex items-center justify-center bg-white">
                <span className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-brand-600" />
              </div>
            )}

            {/* error fallback */}
            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white text-neutral-500">
                <AlertTriangle className="h-8 w-8 text-amber-400" />
                <p className="text-sm">Failed to load plugin UI</p>
                <p className="max-w-xs truncate text-xs text-neutral-400">{src}</p>
              </div>
            )}

            {/* iframe — always mounted so it can load; hidden until ready */}
            <iframe
              ref={iframeRef}
              src={src}
              title={title ?? 'Plugin UI'}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              onLoad={handleLoad}
              onError={handleError}
              className={cn(
                'h-full w-full border-0',
                (loading || error) && 'invisible',
              )}
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
