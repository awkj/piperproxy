import { toast } from 'sonner';
import type { TFunction } from 'i18next';

export interface MutationResult {
  ec?: number
  em?: string
}

/**
 * Run a mutation that hits a whistle CGI endpoint and uniformly translate
 * the result into a sonner toast. Whistle returns `{ ec, em }` on logical
 * failure (HTTP 200), so we have to inspect `ec` even on success.
 */
export async function runMutation<T extends MutationResult>(
  fn: () => Promise<T>,
  t: TFunction,
  successKey?: string,
): Promise<boolean> {
  try {
    const res = await fn();
    if (!res.ec) {
      if (successKey) toast.success(t(successKey));
      return true;
    }
    toast.error(res.em ?? t('errors.fetchFailed'));
    return false;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : String(e));
    return false;
  }
}
