import type { ConsoleLogItem } from '@/api/console';
import type { ConsoleEntry, ConsoleLevel } from './types';
import { KNOWN_LEVELS } from './types';

function normalizeLevel(level: string | undefined): ConsoleLevel {
  if (!level) return 'log';
  const lower = level.toLowerCase();
  if ((KNOWN_LEVELS as readonly string[]).includes(lower)) {
    return lower as ConsoleLevel;
  }
  return 'log';
}

function stringifyArg(arg: unknown): string {
  if (arg === null) return 'null';
  if (arg === undefined) return 'undefined';
  if (typeof arg === 'string') return arg;
  if (typeof arg === 'number' || typeof arg === 'boolean' || typeof arg === 'bigint') {
    return String(arg);
  }
  try {
    return JSON.stringify(arg, null, 2);
  } catch {
    return String(arg);
  }
}

/**
 * whistle 服务端 plugin 多参数 console.log 时，text 是 JSON 数组：
 *   '["msg",{"foo":1}]'
 * 单字符串时 text 可能是普通字符串或就是该字符串本身。
 */
export function parseLogItem(item: ConsoleLogItem): ConsoleEntry {
  const level = normalizeLevel(item.level);
  let displayText = item.text ?? '';
  let multiline = displayText.includes('\n');

  if (typeof item.text === 'string') {
    const trimmed = item.text.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          const parts = parsed.map(stringifyArg);
          displayText = parts.join(' ');
          multiline = displayText.includes('\n') || parts.some((p) => p.includes('\n'));
        }
      } catch {
        /* 不是 JSON 数组，原文使用 */
      }
    }
  }

  return {
    id: item.id,
    date: item.date,
    level,
    logId: item.logId ?? '',
    rawText: item.text ?? '',
    displayText,
    multiline,
  };
}
