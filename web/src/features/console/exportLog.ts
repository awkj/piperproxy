import type { ConsoleEntry } from './types';

/**
 * 把 entries 按可读文本格式导出，每行：
 *   [timestamp ISO] [level] [logId] text
 * 多行 displayText 会缩进续行，便于命令行 grep / less 阅读。
 */
export function entriesToLogText(entries: ConsoleEntry[]): string {
  const lines: string[] = [];
  for (const e of entries) {
    const ts = new Date(e.date).toISOString();
    const level = (e.level ?? 'log').toUpperCase();
    const logId = e.logId ? `[${e.logId}] ` : '';
    const text = e.displayText ?? '';
    if (text.includes('\n')) {
      const [first, ...rest] = text.split('\n');
      lines.push(`[${ts}] [${level}] ${logId}${first}`);
      for (const cont of rest) {
        lines.push(`    ${cont}`);
      }
    } else {
      lines.push(`[${ts}] [${level}] ${logId}${text}`);
    }
  }
  return lines.join('\n') + (lines.length > 0 ? '\n' : '');
}

/**
 * JSON 导出：保留全字段 + 一个 schema 标识，方便日后导入识别。
 */
export interface ConsoleLogDump {
  schema: 'whistle-console-log';
  version: 1;
  exportedAt: string;
  count: number;
  entries: ConsoleEntry[];
}

export function entriesToJson(entries: ConsoleEntry[]): string {
  const payload: ConsoleLogDump = {
    schema: 'whistle-console-log',
    version: 1,
    exportedAt: new Date().toISOString(),
    count: entries.length,
    entries,
  };
  return JSON.stringify(payload, null, 2);
}

/** 触发浏览器下载。 */
export function downloadBlob(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 异步释放，避免 download 还没拉起
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function timestampFilenamePart(): string {
  const d = new Date();
  const pad = (n: number, len = 2) => n.toString().padStart(len, '0');
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

export function exportEntriesAsLog(entries: ConsoleEntry[]): void {
  const text = entriesToLogText(entries);
  downloadBlob(text, `whistle-console-${timestampFilenamePart()}.log`, 'text/plain;charset=utf-8');
}

export function exportEntriesAsJson(entries: ConsoleEntry[]): void {
  const json = entriesToJson(entries);
  downloadBlob(json, `whistle-console-${timestampFilenamePart()}.json`, 'application/json');
}

/**
 * 解析之前导出的 JSON dump，校验最低限度的必填字段。
 * 返回经过 sanitize 的 ConsoleEntry 数组。
 */
export function parseLogDump(text: string): ConsoleEntry[] {
  const data: unknown = JSON.parse(text);
  if (!data || typeof data !== 'object') {
    throw new Error('not a JSON object');
  }
  const obj = data as Partial<ConsoleLogDump> & { entries?: unknown };
  if (obj.schema !== 'whistle-console-log') {
    throw new Error('schema mismatch');
  }
  if (!Array.isArray(obj.entries)) {
    throw new Error('entries missing');
  }
  const out: ConsoleEntry[] = [];
  for (const raw of obj.entries) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as unknown as Record<string, unknown>;
    const id = typeof r.id === 'number' ? r.id : Number(r.id);
    const date = typeof r.date === 'number' ? r.date : Number(r.date);
    if (!Number.isFinite(id) || !Number.isFinite(date)) continue;
    out.push({
      id,
      date,
      level: (r.level as ConsoleEntry['level']) ?? 'log',
      logId: typeof r.logId === 'string' ? r.logId : '',
      rawText: typeof r.rawText === 'string' ? r.rawText : '',
      displayText: typeof r.displayText === 'string' ? r.displayText : '',
      multiline: Boolean(r.multiline),
    });
  }
  return out;
}
