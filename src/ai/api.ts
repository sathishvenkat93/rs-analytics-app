import { useEffect, useState } from 'react';
import type { AiErrorBody, AiStatus, ChatRequest, ChatResult, ColumnAdvice, DatasetSummary, SqlRequest, SqlResult, SuggestRequest, SuggestResult } from '../../shared/ai';

/** Browser client for /api/ai/*. Credentials live on the server; nothing secret is here. */

export class AiRequestError extends Error {
  kind: AiErrorBody['error']['kind'] | 'unavailable';
  constructor(kind: AiRequestError['kind'], message: string) {
    super(message);
    this.kind = kind;
  }
}

async function call<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/ai/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new AiRequestError('unavailable', 'Couldn’t reach the AI server. Start the app with `npm run dev` or `npm start`.');
  }
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    // A static host without the API returns HTML (or nothing) here.
    throw new AiRequestError('unavailable', 'The AI server isn’t running behind this page. Start the app with `npm run dev` or `npm start`.');
  }
  if (!res.ok) {
    const err = (data as AiErrorBody).error;
    throw new AiRequestError(err?.kind ?? 'server', err?.message ?? `Request failed (${res.status}).`);
  }
  return data as T;
}

export const ai = {
  status: () => call<AiStatus>('status'),
  test: () => call<{ ok: true; message: string }>('test', {}),
  columns: (dataset: DatasetSummary, signal?: AbortSignal) => call<ColumnAdvice>('columns', { dataset }, signal),
  suggest: (req: SuggestRequest, signal?: AbortSignal) => call<SuggestResult>('suggest', req, signal),
  chat: (req: ChatRequest & { conversationId: string }, signal?: AbortSignal) => call<ChatResult>('chat', req, signal),
  sql: (req: SqlRequest, signal?: AbortSignal) => call<SqlResult>('sql', req, signal),
};

/* ---------- status, shared across components ---------- */

let cached: Promise<AiStatus> | null = null;
const OFFLINE: AiStatus = { provider: 'off', model: null, configured: false, message: 'The AI server isn’t reachable from this page.' };

export function loadAiStatus(force = false): Promise<AiStatus> {
  if (!cached || force) cached = ai.status().catch(() => OFFLINE);
  return cached;
}

export function useAiStatus(): AiStatus | null {
  const [status, setStatus] = useState<AiStatus | null>(null);
  useEffect(() => {
    let live = true;
    loadAiStatus().then((s) => live && setStatus(s));
    return () => {
      live = false;
    };
  }, []);
  return status;
}

export const aiReady = (s: AiStatus | null) => !!s && s.configured && s.provider !== 'off';
