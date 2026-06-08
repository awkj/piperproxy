import { useCallback, useEffect, useRef } from 'react';
import { useFramesStore } from '@/store/frames';
import type { FrameKind, FrameLogEntry } from './types';

const PREVIEW_LIMIT = 200;

function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function bytesToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
}

function trimPreview(text: string): string {
  return text.length > PREVIEW_LIMIT ? `${text.slice(0, PREVIEW_LIMIT)}…` : text;
}

function makeTextEntry(direction: 'in' | 'out', text: string): FrameLogEntry {
  return {
    id: genId(),
    direction,
    kind: 'text',
    timestamp: Date.now(),
    size: new Blob([text]).size,
    preview: trimPreview(text),
    payload: text,
  };
}

function makeBinaryEntry(
  direction: 'in' | 'out',
  bytes: Uint8Array,
): FrameLogEntry {
  // ArrayBuffer → SharedArrayBuffer 兼容处理（按需复制）
  const ab: ArrayBuffer =
    bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? (bytes.buffer as ArrayBuffer)
      : bytes.slice().buffer;
  const hex = bytesToHex(ab);
  return {
    id: genId(),
    direction,
    kind: 'binary',
    timestamp: Date.now(),
    size: bytes.byteLength,
    preview: trimPreview(hex),
    payload: hex,
  };
}

export interface UseFrameSocketResult {
  connect: () => void;
  disconnect: () => void;
  send: (kind: FrameKind, body: string | Uint8Array) => boolean;
  isOpen: () => boolean;
}

export function useFrameSocket(): UseFrameSocketResult {
  const sockRef = useRef<WebSocket | null>(null);
  const pausedRef = useRef(false);

  // 每次 paused 变化时同步到 ref，避免 onmessage 闭包过期
  const paused = useFramesStore((s) => s.paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const connect = useCallback(() => {
    const { url, setStatus, appendFrame } = useFramesStore.getState();
    const trimmed = url.trim();
    if (!trimmed) {
      setStatus('error', 'URL is empty');
      return;
    }
    if (!/^wss?:\/\//i.test(trimmed)) {
      setStatus('error', 'URL must start with ws:// or wss://');
      return;
    }
    // 关旧的
    sockRef.current?.close();

    let ws: WebSocket;
    try {
      ws = new WebSocket(trimmed);
    } catch (e) {
      setStatus('error', e instanceof Error ? e.message : String(e));
      return;
    }
    ws.binaryType = 'arraybuffer';
    sockRef.current = ws;
    setStatus('connecting');

    ws.onopen = () => setStatus('open');
    ws.onerror = () => {
      // WebSocket error 事件不带具体信息，只能给个泛化提示
      setStatus('error', 'WebSocket error');
    };
    ws.onclose = (ev) => {
      setStatus(
        'closed',
        ev.reason ? `${ev.code} ${ev.reason}` : `code ${ev.code}`,
      );
    };
    ws.onmessage = async (ev) => {
      // paused 时仍接收（WebSocket 协议层无法暂停），只是不入日志
      if (pausedRef.current) return;
      const data = ev.data;
      try {
        if (typeof data === 'string') {
          appendFrame(makeTextEntry('in', data));
        } else if (data instanceof ArrayBuffer) {
          appendFrame(makeBinaryEntry('in', new Uint8Array(data)));
        } else if (data instanceof Blob) {
          // 兼容老浏览器把 binaryType 设为 blob 的情况
          const ab = await data.arrayBuffer();
          appendFrame(makeBinaryEntry('in', new Uint8Array(ab)));
        }
      } catch (e) {
        // 不打断连接，仅记录一次错误状态
        // eslint-disable-next-line no-console
        console.error('[frames] failed to handle frame', e);
      }
    };
  }, []);

  const disconnect = useCallback(() => {
    const ws = sockRef.current;
    if (ws) {
      try {
        ws.close();
      } catch {
        /* noop */
      }
    }
    sockRef.current = null;
  }, []);

  const send = useCallback(
    (kind: FrameKind, body: string | Uint8Array): boolean => {
      const ws = sockRef.current;
      const { appendFrame, setStatus } = useFramesStore.getState();
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        setStatus('error', 'Socket is not open');
        return false;
      }
      try {
        if (kind === 'text') {
          const text = typeof body === 'string' ? body : '';
          ws.send(text);
          appendFrame(makeTextEntry('out', text));
        } else if (kind === 'binary') {
          const bytes = body instanceof Uint8Array ? body : new Uint8Array();
          // WebSocket.send 接受 ArrayBufferView，直接传 Uint8Array
          ws.send(bytes);
          appendFrame(makeBinaryEntry('out', bytes));
        } else {
          // ping/pong/close 浏览器 WebSocket API 不暴露发送
          setStatus('error', `${kind} frames are not supported by browsers`);
          return false;
        }
        return true;
      } catch (e) {
        setStatus('error', e instanceof Error ? e.message : String(e));
        return false;
      }
    },
    [],
  );

  const isOpen = useCallback(
    () => sockRef.current?.readyState === WebSocket.OPEN,
    [],
  );

  // 卸载时关闭连接
  useEffect(
    () => () => {
      sockRef.current?.close();
      sockRef.current = null;
    },
    [],
  );

  return { connect, disconnect, send, isOpen };
}
