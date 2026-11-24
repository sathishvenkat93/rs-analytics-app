/**
 * AI settings, read from the environment (.env in development, real env in
 * production). Credentials are never sent to the browser.
 */

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface AiConfig {
  provider: 'bedrock' | 'mock' | 'off';
  region: string | undefined;
  model: string;
  /** Model used when the main model declines a request. Empty = no fallback. */
  fallbackModel: string | null;
  effort: Effort;
  /** Which credential source the Bedrock client will use, for the status line only. */
  credentialSource: 'bearer token' | 'access keys' | 'profile' | 'default chain';
}

const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

export function readConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const raw = (env.AI_PROVIDER ?? 'bedrock').trim().toLowerCase();
  const provider = raw === 'mock' || raw === 'off' ? raw : 'bedrock';
  const effort = (env.BEDROCK_EFFORT ?? 'medium').trim().toLowerCase() as Effort;
  const fallback = env.BEDROCK_FALLBACK_MODEL === undefined ? 'anthropic.claude-opus-4-8' : env.BEDROCK_FALLBACK_MODEL.trim();
  return {
    provider,
    region: env.AWS_REGION || env.AWS_DEFAULT_REGION || undefined,
    model: (env.BEDROCK_MODEL_ID || 'anthropic.claude-opus-5-5').trim(),
    fallbackModel: fallback || null,
    effort: EFFORTS.includes(effort) ? effort : 'medium',
    credentialSource: env.AWS_BEARER_TOKEN_BEDROCK ? 'bearer token' : env.AWS_ACCESS_KEY_ID ? 'access keys' : env.AWS_PROFILE ? 'profile' : 'default chain',
  };
}
