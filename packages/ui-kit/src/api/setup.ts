import type { PiperApiClient } from '../client'

export interface DiagnosticItem {
  name: string
  status: 'ok' | 'missing' | 'unknown'
  message: string
}

export interface DiagnosticsResult {
  os: string
  items: DiagnosticItem[]
}

export const fetchDiagnostics = (client: PiperApiClient): Promise<DiagnosticsResult> =>
  client.get<DiagnosticsResult>('api/setup/diagnose')
