import { api } from './client';

export interface ComposerRequest {
  url: string;
  method: string;
  headers: string;
  body: string;
}

export interface ComposerResponse {
  ec?: number
  em?: string;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: string;
}

export const sendComposer = (
  payload: ComposerRequest,
  options?: { signal?: AbortSignal }
) =>
  api
    .post('api/composer', { json: payload, signal: options?.signal })
    .json<ComposerResponse>();

export interface ReplayRequest {
  originalId?: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  iteration?: number;
}

/** 让 piper 后端以自身名义重放请求（结果写入 capture 流）。 */
export const replayCapture = (payload: ReplayRequest) =>
  api.post('api/captures/replay', { json: payload }).json<{ queued: boolean }>();
