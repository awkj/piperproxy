import { api, swrFetcher } from './client';

export interface CAInfo {
  algorithm: string;
  subject: string;
  notBefore: number;
  notAfter: number;
  fingerprint: string;
  certPath: string;
}

export const CA_INFO_URL = 'api/ca/info';

export const fetchCAInfo = () => swrFetcher<CAInfo>(CA_INFO_URL);

export const installCATrust = (): Promise<{ ok: boolean; output: string }> =>
  api.post('api/ca/install').json();

export const rotateCA = (): Promise<{ ok: boolean; info: CAInfo }> =>
  api.post('api/ca/rotate').json();

export const resetCA = (): Promise<{ ok: boolean; info: CAInfo }> =>
  api.post('api/ca/reset').json();
