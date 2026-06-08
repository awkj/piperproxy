// PiperUIProvider / usePiperApi 是 ui-kit 注入边界的入口。
// 任何 ui-kit 组件 / hook 要拿 API client 都走 usePiperApi()，
// 这样 host app（piper 或 piper-cloud）能换不同的实现。
import { createContext, useContext, type ReactNode } from 'react';
import type { PiperApiClient } from './client';

const PiperApiContext = createContext<PiperApiClient | null>(null);

export interface PiperUIProviderProps {
  client: PiperApiClient;
  children: ReactNode;
}

export function PiperUIProvider({ client, children }: PiperUIProviderProps) {
  return <PiperApiContext.Provider value={client}>{children}</PiperApiContext.Provider>;
}

export function usePiperApi(): PiperApiClient {
  const c = useContext(PiperApiContext);
  if (!c) {
    throw new Error(
      'usePiperApi() must be used inside <PiperUIProvider>. See @piper/ui-kit README.'
    );
  }
  return c;
}
