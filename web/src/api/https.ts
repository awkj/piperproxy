import { api, swrFetcher } from './client';

export interface HttpsStatus {
  enableCapture: boolean;
  enableHttp2: boolean;
}

/**
 * Shape of a single entry from `api/certs` (lib/https/ca#getCustomCertsFiles).
 * Backend returns a map keyed by filename.
 */
export interface CustomCertFile {
  filename: string;
  /** 'crt' | 'cer' | 'pem' — extension of the cert file */
  type?: string;
  /** Comma-joined SAN dns names */
  dnsName?: string;
  /** Last modified timestamp (ms) */
  mtime?: number;
  /** notBefore ISO/string from x509 validity */
  notBefore?: string | number;
  /** notAfter ISO/string from x509 validity */
  notAfter?: string | number;
  /** Disk directory the cert lives in */
  dir?: string;
  /** Whether disabled by user (active toggle off) */
  disabled?: boolean;
  /** Issuer DN, e.g. "CN=example.com, O=Acme, C=US" */
  issuer?: string;
  /** SHA-256 fingerprint, colon-separated uppercase hex, e.g. "AB:CD:EF:..." */
  fingerprint?: string;
}

export interface CertsAllResponse {
  certs: Record<string, CustomCertFile>;
  /** Default custom certs directory on disk */
  dir?: string;
}

export const HTTPS_STATUS_URL = 'api/https/status';
export const CERTS_ALL_URL = 'api/certs';

export const fetchHttpsStatus = () => swrFetcher<HttpsStatus>(HTTPS_STATUS_URL);

export const fetchAllCerts = () => swrFetcher<CertsAllResponse>(CERTS_ALL_URL);

export const setIntercept = (enable: boolean) =>
  api
    .put('api/https/intercept', {
      json: { interceptHttpsConnects: enable ? 1 : 0 },
    })
    .json<{ em?: string }>();

export const setEnableHttp2 = (enable: boolean) =>
  api
    .put('api/https/http2', {
      json: { enableHttp2: enable ? 1 : 0 },
    })
    .json<{ em?: string }>();

export interface CertUploadEntry {
  key: string;
  cert: string;
  /** 'crt' | 'cer' | 'pem' — backend defaults to 'crt' */
  type?: string;
}

export const uploadCerts = async (
  certs: Record<string, CertUploadEntry>,
): Promise<{ em?: string; data?: Record<string, CustomCertFile> }> => {
  const data = await api
    .post('api/certs', { json: certs })
    .json<Record<string, CustomCertFile>>();
  return { data };
};

export const removeCert = async (
  filename: string,
  type?: string,
): Promise<{ em?: string; data?: Record<string, CustomCertFile> }> => {
  const data = await api
    .delete(`api/certs/${encodeURIComponent(filename)}`, {
      json: type ? { type } : undefined,
    })
    .json<Record<string, CustomCertFile>>();
  return { data };
};

/**
 * Toggle the disabled flag for a single cert.
 */
export const setCertActive = async (
  filename: string,
  disabled: boolean,
): Promise<{ em?: string; data?: Record<string, CustomCertFile> }> => {
  const data = await api
    .put(`api/certs/${encodeURIComponent(filename)}`, { json: { disabled } })
    .json<Record<string, CustomCertFile>>();
  return { data };
};

export const downloadCa = () => {
  window.open('api/certs/root.pem', '_blank');
};
