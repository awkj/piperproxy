import type { PiperApiClient } from '../client'

export interface CAInfo {
  algorithm: string
  subject: string
  notBefore: number
  notAfter: number
  fingerprint: string
  certPath: string
}

export const CA_INFO_URL = 'api/ca/info'

export const fetchCAInfo = (client: PiperApiClient): Promise<CAInfo> =>
  client.get<CAInfo>(CA_INFO_URL)

export const installCATrust = (client: PiperApiClient): Promise<{ ok: boolean; output: string }> =>
  client.raw.post('api/ca/install').json()

export const rotateCA = (client: PiperApiClient): Promise<{ ok: boolean; info: CAInfo }> =>
  client.raw.post('api/ca/rotate').json()

export const resetCA = (client: PiperApiClient): Promise<{ ok: boolean; info: CAInfo }> =>
  client.raw.post('api/ca/reset').json()
