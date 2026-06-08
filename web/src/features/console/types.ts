/**
 * Console 面板使用的标准化日志条目。
 * 由后端 ConsoleLogItem 解析得到，附加了缓存的 displayText / parsedArgs 等。
 */
export type ConsoleLevel = 'debug' | 'info' | 'log' | 'warn' | 'error' | 'fatal';

export const KNOWN_LEVELS: readonly ConsoleLevel[] = [
  'debug',
  'info',
  'log',
  'warn',
  'error',
  'fatal',
] as const;

export interface ConsoleEntry {
  /** 原始 id，作为 React key + 下次 startLogTime */
  id: number;
  date: number;
  level: ConsoleLevel;
  /** 业务 logId（一般是 plugin 名） */
  logId: string;
  /** 原始 text（多 arg 情况下是 JSON 数组字符串） */
  rawText: string;
  /**
   * 渲染用的字符串。多 arg 时由数组拼成单行 / 多行字符串。
   * 用于过滤、复制、列表预览。
   */
  displayText: string;
  /** 是否含 JSON object 等多行内容（用于决定能否展开） */
  multiline: boolean;
}
