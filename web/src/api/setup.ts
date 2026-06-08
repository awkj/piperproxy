import { swrFetcher } from './client';

export type TargetCategory =
  | 'runtime'
  | 'client'
  | 'device'
  | 'framework'
  | 'environment';

export type ShellVariant =
  | 'bash'
  | 'zsh'
  | 'fish'
  | 'powershell'
  | 'cmd';

export interface Snippet {
  shell: ShellVariant;
  content: string;
}

export interface SetupTarget {
  id: string;
  name: string;
  category: TargetCategory;
  snippets: Snippet[];
  testScript: string;
  docs: string;
}

export interface SetupTargetsResponse {
  targets: SetupTarget[];
}

export interface DiagnosticItem {
  name: string;
  status: 'ok' | 'missing' | 'unknown';
  message: string;
}

export interface DiagnosticsResult {
  os: string;
  items: DiagnosticItem[];
}

export interface TestResult {
  target: string;
  ok: boolean;
  output: string;
  error: string;
}

export const SETUP_TARGETS_URL = 'api/setup/targets';

export const fetchSetupTargets = () =>
  swrFetcher<SetupTargetsResponse>(SETUP_TARGETS_URL);

export const fetchDiagnostics = () =>
  swrFetcher<DiagnosticsResult>('api/setup/diagnose');

export async function runSetupTest(targetId: string): Promise<TestResult> {
  const res = await fetch('/api/setup/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target: targetId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  return res.json() as Promise<TestResult>;
}
