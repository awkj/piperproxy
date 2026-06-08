import type { MockConfig } from '../dialogs/MockDialog'

export interface MockValueEntry {
  name: string
  value: string
}

export interface BuiltMock {
  rule: string
  values: MockValueEntry[]
}

export function genMockValuesName(suffix: 'resBody' | 'resHeaders'): string {
  const ts = Date.now()
  const rand = Math.random().toString(36).slice(2, 7)
  return `mock-${ts}-${rand}-${suffix}`
}

export function buildMockRule(url: string, cfg: MockConfig): BuiltMock {
  const segments: string[] = [url]
  const values: MockValueEntry[] = []

  if (cfg.method && cfg.method !== 'GET') {
    segments.push(`method://${cfg.method}`)
  }

  const status = cfg.status > 0 ? cfg.status : 200
  segments.push(`statusCode://${status}`)

  const headers = cfg.headers.trim()
  if (headers) {
    const name = genMockValuesName('resHeaders')
    values.push({ name, value: headers })
    segments.push(`resHeaders://{${name}}`)
  }

  if (cfg.body && cfg.body.length > 0) {
    const name = genMockValuesName('resBody')
    values.push({ name, value: cfg.body })
    segments.push(`resBody://{${name}}`)
  }

  return {
    rule: segments.join(' '),
    values,
  }
}
