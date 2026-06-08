import type { PiperApiClient } from '../client'

export interface HttpsStatus {
  enableCapture: boolean
  enableHttp2: boolean
}

export interface CustomCertFile {
  filename: string
  type?: string
  dnsName?: string
  mtime?: number
  notBefore?: string | number
  notAfter?: string | number
  dir?: string
  disabled?: boolean
  issuer?: string
  fingerprint?: string
}

export interface CertsAllResponse {
  certs: Record<string, CustomCertFile>
  dir?: string
}

export const HTTPS_STATUS_URL = 'api/https/status'
export const CERTS_ALL_URL = 'api/certs'

export const fetchHttpsStatus = (client: PiperApiClient): Promise<HttpsStatus> =>
  client.get<HttpsStatus>(HTTPS_STATUS_URL)

export const fetchAllCerts = (client: PiperApiClient): Promise<CertsAllResponse> =>
  client.get<CertsAllResponse>(CERTS_ALL_URL)

export const setIntercept = (client: PiperApiClient, enable: boolean) =>
  client.raw
    .put('api/https/intercept', { json: { interceptHttpsConnects: enable ? 1 : 0 } })
    .json<{ em?: string }>()

export const setEnableHttp2 = (client: PiperApiClient, enable: boolean) =>
  client.raw
    .put('api/https/http2', { json: { enableHttp2: enable ? 1 : 0 } })
    .json<{ em?: string }>()

export interface CertUploadEntry {
  key: string
  cert: string
  type?: string
}

export const uploadCerts = async (
  client: PiperApiClient,
  certs: Record<string, CertUploadEntry>,
): Promise<{ em?: string; data?: Record<string, CustomCertFile> }> => {
  const data = await client.raw
    .post('api/certs', { json: certs })
    .json<Record<string, CustomCertFile>>()
  return { data }
}

export const removeCert = async (
  client: PiperApiClient,
  filename: string,
  type?: string,
): Promise<{ em?: string; data?: Record<string, CustomCertFile> }> => {
  const data = await client.raw
    .delete(`api/certs/${encodeURIComponent(filename)}`, {
      json: type ? { type } : undefined,
    })
    .json<Record<string, CustomCertFile>>()
  return { data }
}

export const setCertActive = async (
  client: PiperApiClient,
  filename: string,
  disabled: boolean,
): Promise<{ em?: string; data?: Record<string, CustomCertFile> }> => {
  const data = await client.raw
    .put(`api/certs/${encodeURIComponent(filename)}`, { json: { disabled } })
    .json<Record<string, CustomCertFile>>()
  return { data }
}

export const downloadCa = (client: PiperApiClient) => {
  const base = client.baseUrl === '/' || client.baseUrl === '' ? '' : client.baseUrl.replace(/\/$/, '')
  window.open(`${base}/api/certs/root.pem`, '_blank')
}
