import { swrFetcher } from '@/api/client';

export interface ServerInfo {
  bip?: string;
  dns?: string;
  doh?: boolean;
  df?: boolean;
  r6?: boolean;
  version?: string;
  hostname?: string;
}

export interface InitInfo {
  version?: string;
  clientIp?: string;
  /** 代理监听 host:port（来自后端 --addr）。 */
  proxyAddr?: string;
  server?: ServerInfo;
}

export const INIT_URL = 'api/init';

export const fetchInit = () => swrFetcher<InitInfo>(INIT_URL);
