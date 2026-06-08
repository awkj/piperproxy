/**
 * bridge.ts — whistle 插件 iframe 通信桥
 *
 * 协议格式（与老栈 bridge.js 兼容）：
 *   主->插件: { type: 'whistle.response', id: string, payload: unknown }
 *   插件->主: { type: 'whistle.<action>', id?: string, payload?: unknown }
 *
 * 老栈通过直接调用 win.initWhistleBridge(bridge) 注入 API；
 * 新栈（sandbox iframe 下无法直接访问 contentWindow）改用 postMessage 通道。
 * 插件 webui 在其自身代码里 postMessage 到 parent，父页面监听并响应。
 *
 * 支持的 action：
 *   getRules       → 当前规则文本（TODO: 接 SWR 数据）
 *   getValues      → values 列表（TODO）
 *   getActiveItem  → 网络面板选中条目（TODO）
 *   ping           → 心跳，返回 pong
 */

import { useEffect, useRef, RefObject } from 'react';

// ---------- 协议类型 ----------

export type BridgeMessageType =
  | 'whistle.getRules'
  | 'whistle.getValues'
  | 'whistle.getActiveItem'
  | 'whistle.ping'
  | string; // 允许插件自定义消息类型

export interface BridgeMessage {
  /** 消息类型，以 "whistle." 为前缀 */
  type: BridgeMessageType;
  /** 请求 id，响应时原路返回 */
  id?: string;
  /** 消息载荷 */
  payload?: unknown;
}

export interface BridgeResponse {
  type: 'whistle.response';
  id: string;
  payload: unknown;
}

/** 主页面→插件 iframe 推送事件 */
export interface BridgePushEvent {
  type: 'whistle.push';
  event: string;
  payload?: unknown;
}

// ---------- 工具函数 ----------

/** 向目标 iframe 发送消息 */
export function sendToIframe(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  type: string,
  payload?: unknown,
): void {
  const win = iframeRef.current?.contentWindow;
  if (!win) return;
  const msg: BridgeMessage = { type, payload };
  win.postMessage(msg, '*');
}

/** 向目标 iframe 推送事件 */
export function pushToIframe(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  event: string,
  payload?: unknown,
): void {
  const win = iframeRef.current?.contentWindow;
  if (!win) return;
  const msg: BridgePushEvent = { type: 'whistle.push', event, payload };
  win.postMessage(msg, '*');
}

// ---------- 消息处理器映射 ----------

export type BridgeHandler = (
  payload: unknown,
  source: MessageEventSource,
) => unknown | Promise<unknown>;

export interface BridgeHandlers {
  getRules?: BridgeHandler;
  getValues?: BridgeHandler;
  getActiveItem?: BridgeHandler;
  [key: string]: BridgeHandler | undefined;
}

// ---------- useBridge hook ----------

/**
 * 订阅 iframe 发来的 postMessage，按 action 路由到 handlers，
 * 并自动将 handler 返回值作为 whistle.response 发回 iframe。
 *
 * @param iframeRef  目标 iframe 的 ref
 * @param handlers   按 action 名称（去掉 "whistle." 前缀）注册处理函数
 */
export function useBridge(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  handlers: BridgeHandlers = {},
): void {
  // 用 ref 保存 handlers，避免频繁 removeEventListener
  const handlersRef = useRef<BridgeHandlers>(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    async function onMessage(event: MessageEvent) {
      const data = event.data as BridgeMessage;
      if (
        !data ||
        typeof data !== 'object' ||
        typeof data.type !== 'string' ||
        !data.type.startsWith('whistle.')
      ) {
        return;
      }

      const source = event.source;
      if (!source) return;

      // 确认消息来自我们持有的 iframe（同域跳过，跨域做 source 比对）
      const iframeWin = iframeRef.current?.contentWindow;
      if (iframeWin && source !== iframeWin) return;

      const action = data.type.slice('whistle.'.length);

      // 内置 ping 处理
      if (action === 'ping') {
        const resp: BridgeResponse = {
          type: 'whistle.response',
          id: data.id ?? '',
          payload: 'pong',
        };
        (source as Window).postMessage(resp, '*');
        return;
      }

      const handler = handlersRef.current[action];
      if (!handler) return;

      try {
        const result = await handler(data.payload, source);
        if (data.id) {
          const resp: BridgeResponse = {
            type: 'whistle.response',
            id: data.id,
            payload: result,
          };
          (source as Window).postMessage(resp, '*');
        }
      } catch (err) {
        if (data.id) {
          const resp: BridgeResponse = {
            type: 'whistle.response',
            id: data.id,
            payload: { error: String(err) },
          };
          (source as Window).postMessage(resp, '*');
        }
      }
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [iframeRef]); // iframeRef 本身是稳定引用，effect 只挂一次
}
