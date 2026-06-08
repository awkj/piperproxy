export type Direction = 'in' | 'out';
export type FrameKind = 'text' | 'binary' | 'ping' | 'pong' | 'close';

export interface FrameLogEntry {
  id: string;
  direction: Direction;
  kind: FrameKind;
  timestamp: number;
  size: number;
  /** 前 200 字节文本或 hex */
  preview: string;
  /** 完整内容（text 直接存；binary 存 hex 字符串） */
  payload: string;
}
