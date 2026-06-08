import { toast } from 'sonner'

export interface MutationResult {
  ec?: number
  em?: string
}

type TranslateFunc = (key: string, options?: Record<string, unknown>) => string

export async function runMutation<T extends MutationResult>(
  fn: () => Promise<T>,
  t: TranslateFunc,
  successKey?: string,
): Promise<boolean> {
  try {
    const res = await fn()
    if (!res.ec) {
      if (successKey) toast.success(t(successKey))
      return true
    }
    toast.error(res.em ?? t('errors.fetchFailed'))
    return false
  } catch (e) {
    toast.error(e instanceof Error ? e.message : String(e))
    return false
  }
}
