/**
 * LLM caller with retry logic and error handling.
 * Mirrors AuditBee's call_llm_with_retry() pattern.
 */

import { generateObject, streamObject, jsonSchema } from 'ai';
import { z } from 'zod';
import { createLLMModel, type ProviderConfig } from './provider';
import { fillPrompt } from './prompts/loader';
import { getSchemaDescription } from './prompts/schema-to-prompt';
import { createLogger } from '../utils/logger';
import { recordMetric } from '../utils/metrics';
import type { ClueAnalysis, Factor5M1E, RegulationMatch, Finding, DeviationReport } from '../workflow/types';
import deviationReportSchemaRaw from '../schema/deviation-report-schema.json';

const log = createLogger('LLM');

// ============================================================================
// Error types
// ============================================================================

export class LLMAuthError extends Error {
  constructor(public provider: string, message?: string) {
    super(message || `API Key 无效或已过期（${provider}），请在设置中重新配置`);
    this.name = 'LLMAuthError';
  }
}

/**
 * Log token usage from Vercel AI SDK responses.
 * Enables cost monitoring and usage tracking.
 */
function logTokenUsage(
  node: string,
  usage: { promptTokens: number; completionTokens: number } | undefined,
  provider?: string,
): void {
  if (!usage) return;
  log.info(`${node} token usage`, {
    provider: provider || 'unknown',
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.promptTokens + usage.completionTokens,
  });
}

// ============================================================================
// Retry logic
// ============================================================================

type ErrorClass = 'auth' | 'retryable' | 'non-retryable';

/**
 * Unified error classification.
 * Replaces the separate isRetryableError/isAuthError functions.
 */
function classifyError(error: unknown): ErrorClass {
  // 检查 HTTP status code 属性（如果 error 对象有的话）
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const statusCode = (error as { statusCode: number }).statusCode;
    if (statusCode === 401 || statusCode === 403) return 'auth';
    if (statusCode === 400) return 'non-retryable';
    if (statusCode === 429 || statusCode >= 500) return 'retryable';
  }

  // 回退到字符串匹配
  const msg = error instanceof Error ? error.message : String(error);
  const lowerMsg = msg.toLowerCase();

  if (/(unauthorized|invalid.?api.?key|authentication|\b401\b|\b403\b)/.test(lowerMsg)) return 'auth';
  if (/(bad.?request|invalid.?request|\b400\b)/.test(lowerMsg)) return 'non-retryable';
  if (/(rate.?limit|timeout|overloaded|server.?error|service.?unavailable|connection.?refused|econnreset|etimedout|ehostunreach|socket.?hang.?up|enotfound|eai_again|network.?error)/.test(lowerMsg)) return 'retryable';

  return 'non-retryable';
}

/**
 * Call LLM with retry for transient failures.
 * Exponential backoff: 2s, 4s, 8s.
 * C-4 fix: Added per-call timeout via AbortSignal (default 120s).
 */
export async function callLLMWithRetry<T>(
  fn: (signal?: AbortSignal) => Promise<T>,
  options: { maxRetries?: number; node?: string; provider?: string; timeoutMs?: number } = {},
): Promise<T> {
  const { maxRetries = 2, node = 'unknown', provider = 'unknown', timeoutMs = 120_000 } = options;
  let lastError: unknown;

  const start = Date.now();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Create a fresh AbortController for each attempt
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result = await fn(controller.signal);
      clearTimeout(timeoutId);
      const duration = Date.now() - start;
      log.info(`${node} completed`, { provider, duration: `${duration}ms`, attempts: attempt + 1 });
      recordMetric(`llm.${node}`, duration, true, { provider, attempts: attempt + 1 });
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;

      // Handle abort/timeout
      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutError = new Error(`LLM 调用超时（${timeoutMs / 1000}秒），请检查网络或稍后重试`);
        log.error(`${node} timeout`, { provider, timeoutMs, attempts: attempt + 1 });
        recordMetric(`llm.${node}`, Date.now() - start, false, { provider, error: 'timeout' });
        if (attempt === maxRetries) throw timeoutError;
        // Timeout is retryable — continue to next attempt
      } else {
        const errorClass = classifyError(error);
        if (errorClass === 'auth') {
          log.error(`${node} auth failed`, { provider, error: String(error) });
          recordMetric(`llm.${node}`, Date.now() - start, false, { provider, error: 'auth' });
          throw new LLMAuthError(provider, String(error));
        } else if (errorClass === 'non-retryable' || attempt === maxRetries) {
          const duration = Date.now() - start;
          log.error(`${node} failed`, { provider, duration: `${duration}ms`, attempts: attempt + 1, error: String(error) });
          recordMetric(`llm.${node}`, duration, false, { provider, error: String(error) });
          throw error;
        }
      }

      const delay = 2000 * Math.pow(2, attempt);
      log.warn(`${node} retry ${attempt + 1}/${maxRetries + 1}`, { provider, delay: `${delay}ms`, error: String(error) });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// ============================================================================
// Zod Schemas for structured output (AI SDK v4 requires Zod schemas)
// ============================================================================

const clueAnalysisSchema = z.object({
  summary: z.string().min(1, 'Summary cannot be empty'),
  keyEvents: z.array(z.string().min(1)).min(1, 'At least one key event required'),
  involvedParties: z.array(z.string().min(1)),
  documentType: z.enum(['deviation_analysis', 'sop_compliance', 'consistency_check', 'risk_assessment']),
});

const factor5M1ESchema = z.object({
  man: z.array(z.string().min(1)),
  machine: z.array(z.string().min(1)),
  material: z.array(z.string().min(1)),
  method: z.array(z.string().min(1)),
  environment: z.array(z.string().min(1)),
});

const regulationMatchSchema = z.array(z.object({
  regulation: z.string().min(1),
  chapter: z.string().min(1),
  article: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
  relevance: z.string().min(1),
}));

/**
 * Resolve $ref references in a JSON Schema object (inline resolution).
 * Strips non-standard metadata fields (title, description, fixed, ui, $id, $schema).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveJsonSchema(schema: any, root: any): any {
  if (!schema || typeof schema !== 'object') return schema;

  // Handle $ref
  if (schema.$ref) {
    const refPath = schema.$ref.replace('#/definitions/', '');
    const resolved = root.definitions?.[refPath];
    if (resolved) return resolveJsonSchema(resolved, root);
  }

  // Build clean schema object (strip non-standard fields)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clean: any = {};
  for (const [key, value] of Object.entries(schema)) {
    if (['$id', '$schema', 'title', 'description', 'fixed', 'ui', 'section', 'definitions'].includes(key)) continue;
    if (key === 'properties' && typeof value === 'object' && value !== null) {
      clean.properties = {};
      for (const [propKey, propValue] of Object.entries(value as Record<string, unknown>)) {
        clean.properties[propKey] = resolveJsonSchema(propValue, root);
      }
    } else if (key === 'items') {
      clean.items = resolveJsonSchema(value, root);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

const deviationReportSchema = resolveJsonSchema(deviationReportSchemaRaw, deviationReportSchemaRaw);

// ============================================================================
// High-level LLM operations
// ============================================================================

/**
 * Analyze clue text and extract structured information.
 */
export async function analyzeClue(
  clueText: string,
  config?: ProviderConfig,
): Promise<ClueAnalysis> {
  const model = createLLMModel(config);
  const prompt = fillPrompt('clue-analysis', { clue_text: clueText });

  const result = await callLLMWithRetry(
    (signal) => generateObject({ model, prompt, schema: clueAnalysisSchema, abortSignal: signal }),
    { node: 'clue-analysis', provider: config?.provider },
  );

  // Type assertion required: generateObject with JSON Schema returns unknown
  logTokenUsage('clue-analysis', result.usage, config?.provider);
  return result.object as ClueAnalysis;
}

/**
 * Identify 5M1E factors from clue text.
 */
export async function identifyFactors(
  clueText: string,
  analysis: ClueAnalysis,
  config?: ProviderConfig,
): Promise<Factor5M1E> {
  const model = createLLMModel(config);
  const prompt = fillPrompt('factor-identify', {
    clue_text: clueText,
    analysis_json: JSON.stringify(analysis, null, 2),
  });

  const result = await callLLMWithRetry(
    (signal) => generateObject({ model, prompt, schema: factor5M1ESchema, abortSignal: signal }),
    { node: 'factor-identify', provider: config?.provider },
  );

  // Type assertion required: generateObject with JSON Schema returns unknown
  logTokenUsage('factor-identify', result.usage, config?.provider);
  return result.object as Factor5M1E;
}

/**
 * Match regulations against clue and factors.
 * Uses generateObject for structured output.
 */
export async function matchRegulations(
  clueText: string,
  factors: Factor5M1E,
  regulationContext: string,
  config?: ProviderConfig,
): Promise<RegulationMatch[]> {
  const model = createLLMModel(config);
  const prompt = fillPrompt('regulation-match', {
    clue_text: clueText,
    factors_json: JSON.stringify(factors, null, 2),
    regulation_context: regulationContext,
  });

  const result = await callLLMWithRetry(
    (signal) => generateObject({ model, prompt, schema: regulationMatchSchema, abortSignal: signal }),
    { node: 'regulation-match', provider: config?.provider },
  );

  logTokenUsage('regulation-match', result.usage, config?.provider);
  return result.object as RegulationMatch[];
}

/**
 * Generate deviation report as structured JSON.
 */
export async function generateReport(
  deviationId: string,
  summary: string,
  factors: Factor5M1E,
  regulations: RegulationMatch[],
  findings: Finding[],
  config?: ProviderConfig,
): Promise<DeviationReport> {
  const model = createLLMModel(config);
  const prompt = fillPrompt('report-generate', {
    deviation_id: deviationId,
    summary,
    factors_json: JSON.stringify(factors, null, 2),
    regulations_json: JSON.stringify(regulations, null, 2),
    findings_json: JSON.stringify(findings, null, 2),
    schema_description: getSchemaDescription(),
  });

  const result = await callLLMWithRetry(
    (signal) => generateObject({ model, prompt, schema: jsonSchema(deviationReportSchema), abortSignal: signal }),
    { node: 'report-generate', provider: config?.provider },
  );

  // Type assertion required: generateObject with JSON Schema returns unknown
  logTokenUsage('report-generate', result.usage, config?.provider);
  return result.object as DeviationReport;
}

/**
 * 优化2: 流式生成偏差报告。
 * 使用 streamObject 实时输出报告内容，通过 onPartial 回调推送部分结果。
 * C-4 fix: Added timeout via AbortSignal (default 180s for streaming).
 */
export async function streamReport(
  deviationId: string,
  summary: string,
  factors: Factor5M1E,
  regulations: RegulationMatch[],
  findings: Finding[],
  onPartial: (partial: Partial<DeviationReport>) => void,
  config?: ProviderConfig,
  options?: { timeoutMs?: number; maxRetries?: number },
): Promise<DeviationReport> {
  const timeoutMs = options?.timeoutMs ?? 180_000;
  const maxRetries = options?.maxRetries ?? 1;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const start = Date.now();

    try {
      log.info('streamReport started', { deviationId, timeoutMs, attempt: attempt + 1 });

      const model = createLLMModel(config);
      const prompt = fillPrompt('report-generate', {
        deviation_id: deviationId,
        summary,
        factors_json: JSON.stringify(factors, null, 2),
        regulations_json: JSON.stringify(regulations, null, 2),
        findings_json: JSON.stringify(findings, null, 2),
        schema_description: getSchemaDescription(),
      });

      const result = streamObject({
        model,
        prompt,
        schema: jsonSchema(deviationReportSchema),
        abortSignal: controller.signal,
      });

      // Stream partial objects as they're generated
      for await (const partial of result.partialObjectStream) {
        onPartial(partial as Partial<DeviationReport>);
      }

      // Return the final complete object
      const finalObject = await result.object;
      try {
        const usage = await result.usage;
        logTokenUsage('streamReport', usage, config?.provider);
      } catch {
        log.warn('streamReport usage unavailable', { deviationId });
      }
      const duration = Date.now() - start;
      log.info('streamReport completed', { deviationId, duration: `${duration}ms` });
      clearTimeout(timeoutId);
      return finalObject as DeviationReport;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;
      const duration = Date.now() - start;

      // Handle AbortError (timeout) — always retryable
      if (error instanceof Error && error.name === 'AbortError') {
        log.error('streamReport timeout', { deviationId, timeoutMs, duration: `${duration}ms`, attempt: attempt + 1 });
        lastError = new Error(`报告生成超时（${timeoutMs / 1000}秒），请重试`);
        if (attempt === maxRetries) throw lastError;
      } else {
        const errorClass = classifyError(error);
        if (errorClass === 'auth') {
          log.error('streamReport auth failed', { deviationId, attempt: attempt + 1 });
          throw new LLMAuthError(config?.provider || 'unknown', String(error));
        } else if (errorClass === 'non-retryable' || attempt === maxRetries) {
          log.error('streamReport failed', { deviationId, duration: `${duration}ms`, attempt: attempt + 1 }, error instanceof Error ? error : undefined);
          throw lastError;
        } else {
          log.error('streamReport failed (retryable)', { deviationId, duration: `${duration}ms`, attempt: attempt + 1 }, error instanceof Error ? error : undefined);
        }
      }

      const delay = 2000 * Math.pow(2, attempt);
      log.warn('streamReport retry', { deviationId, delay: `${delay}ms`, attempt: attempt + 1 });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
