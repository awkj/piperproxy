import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { ComposerRequest } from "@/api/composer"
import { useBatchSend } from "./use-batch-send"

interface BatchSendDialogProps {
  open: boolean
  onClose: () => void
  /** 当前表单值；对话框打开时按一次性 snapshot 使用。 */
  request: ComposerRequest
}

export function BatchSendDialog({ open, onClose, request }: BatchSendDialogProps) {
  const { t } = useTranslation()
  const [count, setCount] = useState(10)
  const [concurrency, setConcurrency] = useState(2)
  const [intervalMs, setIntervalMs] = useState(0)
  const { progress, start, cancel, reset } = useBatchSend()

  // 关闭对话框时清理状态：取消进行中任务并重置 progress
  useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  const handleClose = () => {
    if (progress.running) cancel()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("composer.batchSend")}</DialogTitle>
          <DialogDescription>{t("composer.batchSendDesc")}</DialogDescription>
        </DialogHeader>

        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (progress.running) return
            void start(request, { count, concurrency, intervalMs })
          }}
        >
          <div className="grid grid-cols-3 gap-3">
            <label className="flex flex-col gap-1 text-xs text-neutral-600">
              {t("composer.batchCount")}
              <input
                type="number"
                min={1}
                max={10000}
                value={count}
                disabled={progress.running}
                onChange={(e) => setCount(Number(e.target.value) || 1)}
                className="h-8 rounded-md border border-neutral-300 px-2 text-sm focus:border-brand-500 focus:outline-none disabled:bg-neutral-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-neutral-600">
              {t("composer.batchConcurrency")}
              <input
                type="number"
                min={1}
                max={100}
                value={concurrency}
                disabled={progress.running}
                onChange={(e) => setConcurrency(Number(e.target.value) || 1)}
                className="h-8 rounded-md border border-neutral-300 px-2 text-sm focus:border-brand-500 focus:outline-none disabled:bg-neutral-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-neutral-600">
              {t("composer.batchInterval")}
              <input
                type="number"
                min={0}
                max={60000}
                value={intervalMs}
                disabled={progress.running}
                onChange={(e) => setIntervalMs(Number(e.target.value) || 0)}
                className="h-8 rounded-md border border-neutral-300 px-2 text-sm focus:border-brand-500 focus:outline-none disabled:bg-neutral-100"
              />
            </label>
          </div>

          {(progress.running || progress.finished) && (
            <div className="space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-neutral-700">
                  {t("composer.batchProgress")}: {progress.done} / {progress.total}
                </span>
                <span className="text-red-600">
                  {t("composer.batchFailed")}: {progress.failed}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
                <div
                  className="h-full bg-brand-500 transition-all"
                  style={{
                    width: `${progress.total === 0 ? 0 : (progress.done / progress.total) * 100}%`,
                  }}
                />
              </div>
              {progress.summary && (
                <div className="grid grid-cols-2 gap-1 pt-1 text-xs text-neutral-600">
                  <div>
                    {t("composer.batchSuccessRate")}:{" "}
                    <span className="font-mono">{(progress.summary.successRate * 100).toFixed(1)}%</span>
                  </div>
                  <div>
                    {t("composer.batchAvgDuration")}:{" "}
                    <span className="font-mono">{progress.summary.avgDurationMs.toFixed(0)} ms</span>
                  </div>
                  {progress.cancelled && (
                    <div className="col-span-2 text-amber-600">{t("composer.batchCancelled")}</div>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {progress.running ? (
              <Button type="button" variant="default" onClick={cancel}>
                {t("composer.batchCancel")}
              </Button>
            ) : (
              <>
                <Button type="button" variant="default" onClick={handleClose}>
                  {t("common.close")}
                </Button>
                <Button type="submit" variant="primary">
                  {progress.finished ? t("composer.batchRunAgain") : t("composer.batchStart")}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
