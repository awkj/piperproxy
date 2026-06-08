// 现存 endpoint 函数（network.ts / rules.ts / ...）仍直接 import { api, swrFetcher }，
// 所以这里保留这两个名字，仅把底层换成 @piper/ui-kit 的 createDefaultClient。
//
// piper-cloud 控制面会自己 createDefaultClient + <PiperUIProvider>，不走这个文件。
import type { KyInstance } from 'ky';
import { createDefaultClient, type PiperApiClient } from '@piper/ui-kit';

function getAuth(): string | undefined {
  const params = new URLSearchParams(window.location.search);
  return params.get('authorization') ?? undefined;
}

/** 共享给 <PiperUIProvider> 的 client 实例（App.tsx 注入）。 */
export const piperClient: PiperApiClient = createDefaultClient({
  baseUrl: '/',
  authToken: getAuth(),
});

/** 老代码兼容：直接用 ky 实例的入口。新代码请改走 usePiperApi()。 */
export const api: KyInstance = piperClient.raw;

export const swrFetcher = async <T>(url: string): Promise<T> => api.get(url).json<T>();
