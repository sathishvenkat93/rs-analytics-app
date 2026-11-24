import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AiErrorBody, AiStatus, ChatRequest, DatasetSummary, SqlRequest, SuggestRequest } from '../shared/ai.ts';
import { readConfig, type AiConfig } from './config.ts';
import { AiError, createBedrockProvider, type LlmProvider } from './llm.ts';
import { adviseColumns, chartChat, suggestCharts, writeSql } from './ai.ts';
import { mockChat, mockColumns, mockSql, mockSuggest } from './mock.ts';

/**
 * /api/ai/* routes. Used as Vite dev-server middleware and by the production
 * server (server/index.ts).
 */

const MAX_BODY = 4 * 1024 * 1024;

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

function fail(res: ServerResponse, e: unknown) {
  const err = e instanceof AiError ? e : new AiError('server', e instanceof Error ? e.message : String(e), 500);
  if (err.kind === 'server') console.error('[ai]', e);
  const body: AiErrorBody = { error: { kind: err.kind, message: err.message } };
  send(res, err.status, body);
}

function readJson<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new AiError('bad_request', 'Request too large.', 413));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as T);
      } catch {
        reject(new AiError('bad_request', 'Request body is not valid JSON.', 400));
      }
    });
    req.on('error', reject);
  });
}

function need(cond: unknown, what: string) {
  if (!cond) throw new AiError('bad_request', `Missing or invalid ${what}.`, 400);
}

function status(cfg: AiConfig): AiStatus {
  if (cfg.provider === 'off') return { provider: 'off', model: null, configured: false, message: 'AI features are turned off (AI_PROVIDER=off).' };
  if (cfg.provider === 'mock') return { provider: 'mock', model: 'mock', configured: true, message: 'Using the offline mock provider (AI_PROVIDER=mock). Results are heuristic, not from a model.' };
  if (!cfg.region) return { provider: 'bedrock', model: cfg.model, configured: false, message: 'AWS_REGION is not set. Copy .env.example to .env and fill in your Bedrock settings.' };
  return { provider: 'bedrock', model: cfg.model, configured: true, message: `Amazon Bedrock · ${cfg.model} · ${cfg.region} · ${cfg.credentialSource}` };
}

export function createApiHandler(env: NodeJS.ProcessEnv = process.env) {
  const cfg = readConfig(env);
  let provider: LlmProvider | null = null;
  const llm = (): LlmProvider => {
    if (cfg.provider === 'off') throw new AiError('config', 'AI features are turned off (AI_PROVIDER=off).', 503);
    return (provider ??= createBedrockProvider(cfg));
  };
  const mock = cfg.provider === 'mock';

  /** Returns true if the request was handled. */
  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? '/', 'http://local');
    if (!url.pathname.startsWith('/api/ai/')) return false;
    const route = url.pathname.slice('/api/ai/'.length);
    try {
      if (req.method === 'GET' && route === 'status') {
        send(res, 200, status(cfg));
        return true;
      }
      if (req.method !== 'POST') throw new AiError('bad_request', 'Use POST.', 405);
      switch (route) {
        case 'test': {
          if (!mock) await llm().ping();
          send(res, 200, { ok: true, message: status(cfg).message });
          return true;
        }
        case 'columns': {
          const body = await readJson<{ dataset: DatasetSummary }>(req);
          need(body.dataset?.columns?.length, 'dataset');
          send(res, 200, mock ? mockColumns(body.dataset) : await adviseColumns(llm(), body.dataset));
          return true;
        }
        case 'suggest': {
          const body = await readJson<SuggestRequest>(req);
          need(body.dataset?.columns?.length && Array.isArray(body.catalog), 'dataset or catalog');
          send(res, 200, mock ? mockSuggest(body) : await suggestCharts(llm(), body));
          return true;
        }
        case 'chat': {
          const body = await readJson<ChatRequest & { conversationId?: string }>(req);
          need(typeof body.message === 'string' && body.message.trim() && Array.isArray(body.datasets) && body.datasets.length, 'message or datasets');
          send(res, 200, mock ? mockChat(body) : await chartChat(llm(), { ...body, history: body.history ?? [] }, body.conversationId));
          return true;
        }
        case 'sql': {
          const body = await readJson<SqlRequest>(req);
          need(typeof body.question === 'string' && body.question.trim() && Array.isArray(body.tables), 'question or tables');
          send(res, 200, mock ? mockSql(body) : await writeSql(llm(), body));
          return true;
        }
        default:
          throw new AiError('bad_request', `Unknown endpoint /api/ai/${route}.`, 404);
      }
    } catch (e) {
      fail(res, e);
      return true;
    }
  };
}
