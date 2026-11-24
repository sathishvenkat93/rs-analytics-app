import Anthropic, { BetaFallbackState, betaRefusalFallbackMiddleware } from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk';
import type { z } from 'zod';
import type { AiErrorBody } from '../shared/ai.ts';
import type { AiConfig } from './config.ts';

/** A failure with a category the browser can explain. */
export class AiError extends Error {
  kind: AiErrorBody['error']['kind'];
  status: number;
  constructor(kind: AiErrorBody['error']['kind'], message: string, status = 502) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

export interface StructuredRequest<T> {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  schema: z.ZodType<T>;
  maxTokens?: number;
  /** Conversation-scoped fallback pinning (chat). */
  fallbackState?: BetaFallbackState;
}

export interface LlmProvider {
  generate<T>(req: StructuredRequest<T>): Promise<T>;
  /** Cheapest possible round trip, to verify credentials and model access. */
  ping(): Promise<void>;
}

/* ---------- Claude in Amazon Bedrock ---------- */

export function createBedrockProvider(cfg: AiConfig): LlmProvider {
  if (!cfg.region) throw new AiError('config', 'AWS_REGION is not set. Add it to .env (for example AWS_REGION=us-east-1).', 503);

  // Credentials come from the environment: AWS_BEARER_TOKEN_BEDROCK, or
  // AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN, or
  // AWS_PROFILE, or the default AWS credential chain.
  const client = new AnthropicBedrockMantle({
    awsRegion: cfg.region,
    // Bedrock has no server-side fallback: retry declined requests on the fallback model client-side.
    middleware: cfg.fallbackModel ? [betaRefusalFallbackMiddleware([{ model: cfg.fallbackModel }])] : [],
  });

  return {
    async generate<T>(req: StructuredRequest<T>): Promise<T> {
      let response;
      try {
        response = await client.beta.messages.parse(
          {
            model: cfg.model,
            max_tokens: req.maxTokens ?? 16000,
            system: req.system,
            messages: req.messages,
            output_config: { effort: cfg.effort, format: betaZodOutputFormat(req.schema) },
          },
          req.fallbackState ? { fallbackState: req.fallbackState } : undefined,
        );
      } catch (e) {
        throw mapError(e, cfg);
      }
      if (response.stop_reason === 'refusal') {
        const why = response.stop_details?.explanation;
        throw new AiError('refusal', `The model declined this request${why ? `: ${why}` : '.'} Try rephrasing it.`, 422);
      }
      if (response.stop_reason === 'max_tokens') throw new AiError('output', 'The answer was cut off before it finished. Try a narrower request.');
      if (!response.parsed_output) throw new AiError('output', 'The model returned an answer that didn’t match the expected format. Please try again.');
      return response.parsed_output as T;
    },

    async ping() {
      try {
        await client.messages.create({ model: cfg.model, max_tokens: 256, output_config: { effort: 'low' }, messages: [{ role: 'user', content: 'Reply with the single word: ok' }] });
      } catch (e) {
        throw mapError(e, cfg);
      }
    },
  };
}

/** Typed SDK errors → messages a user can act on. Most specific first. */
function mapError(e: unknown, cfg: AiConfig): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
    return new AiError('auth', `Bedrock rejected the credentials (${cfg.credentialSource}). Check the AWS keys or Bedrock API key in .env and that the identity has bedrock-mantle:CreateInference on ${cfg.model}.`, 502);
  if (e instanceof Anthropic.NotFoundError) return new AiError('model', `Model “${cfg.model}” isn’t available in ${cfg.region}. Check BEDROCK_MODEL_ID and that model access is enabled in the Bedrock console.`, 502);
  if (e instanceof Anthropic.RateLimitError) return new AiError('rate_limit', 'Bedrock is rate-limiting requests right now. Wait a moment and try again.', 429);
  if (e instanceof Anthropic.BadRequestError) return new AiError('bad_request', `Bedrock rejected the request: ${e.message}`, 400);
  // Credential resolution happens inside the request pipeline, so it surfaces as a connection error.
  if (e instanceof Anthropic.APIConnectionError && /credential/i.test(`${e.message} ${(e.cause as Error | undefined)?.name ?? ''}`))
    return new AiError('auth', 'No AWS credentials were found. In .env set AWS_BEARER_TOKEN_BEDROCK (a Bedrock API key), or AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or AWS_PROFILE.', 503);
  if (e instanceof Anthropic.APIConnectionError) return new AiError('network', `Couldn’t reach Bedrock in ${cfg.region}. Check the network connection and AWS_REGION.`, 504);
  if (e instanceof Anthropic.APIError) return new AiError('server', `Bedrock returned an error${e.status ? ` (${e.status})` : ''}: ${e.message}`, 502);
  const msg = e instanceof Error ? e.message : String(e);
  // Credential resolution fails before any request is sent.
  if (/credential|could not load|profile|token/i.test(msg)) return new AiError('auth', `No usable AWS credentials were found: ${msg}`, 503);
  return new AiError('server', msg, 500);
}
