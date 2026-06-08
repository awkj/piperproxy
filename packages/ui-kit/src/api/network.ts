import type { PiperApiClient } from '../client'
import type { CaptureItem, NetworkInterfacesResponse } from '../types'

export function normalizeCapture(item: CaptureItem): CaptureItem {
  if (!item.hostname || !item.path) {
    try {
      const u = new URL(item.url)
      return {
        ...item,
        hostname: item.hostname || u.host,
        path: item.path || `${u.pathname}${u.search}`,
      }
    } catch {
      // URL parse failure — use as-is
    }
  }
  return item
}

export async function setHighlight(
  client: PiperApiClient,
  id: string,
  value?: boolean,
): Promise<{ highlighted: boolean }> {
  return client.post<{ highlighted: boolean }>(
    `api/captures/${id}/highlight`,
    value !== undefined ? { value } : {},
  )
}

export async function setComment(
  client: PiperApiClient,
  id: string,
  value: string,
): Promise<{ comment: string }> {
  return client.post<{ comment: string }>(`api/captures/${id}/comment`, { value })
}

export async function fetchCaptureCurl(
  client: PiperApiClient,
  id: string,
): Promise<string> {
  const { command } = await client.get<{ command: string }>(`api/captures/${id}/curl`)
  return command
}

export async function fetchNetworkInterfaces(
  client: PiperApiClient,
): Promise<NetworkInterfacesResponse> {
  return client.get<NetworkInterfacesResponse>('api/network/interfaces')
}

export interface ValueAddResult {
  ec: number
  em?: string
}

export async function addValue(
  client: PiperApiClient,
  name: string,
  value: string,
): Promise<ValueAddResult> {
  return client.post<ValueAddResult>('api/values', { name, value })
}
