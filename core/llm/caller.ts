/**
 * LLM caller with retry logic and error handling.
 * Mirrors AuditBee's call_llm_with_retry() pattern.
 */

import { generateText, streamObject, jsonSchema } from 'ai';
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
// Workflow-level cancellation (module singleton)
// ============================================================================

let workflowAbortController: AbortController | null = null;

/** Reset the workflow abort controller (call when starting a new workflow) */
export function resetWorkflowAbort(): void {
  workflowAbortController = new AbortController();
}

/** Abort all in-flight LLM calls (call on workflow cancel) */
export function abortWorkflowLLM(): void {
  workflowAbortController?.abort();
  workflowAbortController = null;
}

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
  // JSON 解析/格式失败：模型偶发输出不合规，重试一次通常可成功（避免核心章节直接 fallback）
  if (/(not valid json|不是有效 json|json parse|json 解析|不匹配预期格式)/.test(lowerMsg)) return 'retryable';

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
  const { maxRetries = 2, node = 'unknown', provider = 'unknown', timeoutMs = 180_000 } = options;
  let lastError: unknown;

  const start = Date.now();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check if workflow was cancelled before starting attempt
    if (workflowAbortController?.signal.aborted) {
      throw new Error('工作流已取消');
    }

    // Create a fresh AbortController for each attempt
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Link external workflow cancellation to this attempt's controller
    const externalSignal = workflowAbortController?.signal;
    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

    try {
      const result = await fn(controller.signal);
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', onExternalAbort);
      const duration = Date.now() - start;
      log.info(`${node} completed`, { provider, duration: `${duration}ms`, attempts: attempt + 1 });
      recordMetric(`llm.${node}`, duration, true, { provider, attempts: attempt + 1 });
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', onExternalAbort);
      lastError = error;

      // If workflow was cancelled, throw immediately without retry
      if (externalSignal?.aborted) {
        log.info(`${node} aborted by workflow cancellation`, { provider });
        throw new Error('工作流已取消');
      }

      // Handle abort/timeout
      if (error instanceof Error && error.name === 'AbortError') {
        // 超时不重试：外层 XState 状态级超时（120s/180s）已兜底，
        // 内层单次超时已达 timeoutMs，继续重试只会被外层 abort，属于无效等待。
        const timeoutError = new Error(`LLM 调用超时（${timeoutMs / 1000}秒），请检查网络或稍后重试`);
        log.error(`${node} timeout`, { provider, timeoutMs, attempts: attempt + 1 });
        recordMetric(`llm.${node}`, Date.now() - start, false, { provider, error: 'timeout' });
        throw timeoutError;
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
  measurement: z.array(z.string().min(1)),
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
// Robust JSON extraction (handles markdown code block wrapping from DeepSeek etc.)
// ============================================================================

/**
 * Extract JSON from LLM response text.
 * Handles: raw JSON, ```json ... ``` blocks, ``` ... ``` blocks,
 * and JSON embedded in surrounding text.
 */
export function extractJsonFromText(text: string): string {
  const trimmed = text.trim();

  // 1. Try markdown code block: ```json ... ``` or ``` ... ```
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // 2. Try to find JSON object/array boundaries directly
  const firstBrace = trimmed.indexOf('{');
  const firstBracket = trimmed.indexOf('[');
  let start = -1;
  let end = -1;

  if (firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket)) {
    start = firstBrace;
    end = trimmed.lastIndexOf('}');
  } else if (firstBracket >= 0) {
    start = firstBracket;
    end = trimmed.lastIndexOf(']');
  }

  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  // 3. Return as-is (will likely fail JSON.parse)
  return trimmed;
}

/**
 * Generate structured output using generateText + manual JSON extraction + zod validation.
 * More robust than generateObject for providers that wrap JSON in markdown code blocks
 * (e.g., DeepSeek-V3.2 via SiliconFlow).
 */
async function safeGenerateObject<T>(
  model: ReturnType<typeof createLLMModel>,
  prompt: string,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
): Promise<{ object: T; usage?: { promptTokens: number; completionTokens: number } }> {
  const result = await generateText({
    model,
    prompt: `${prompt}\n\nIMPORTANT: Respond ONLY with valid JSON. Do NOT wrap in markdown code blocks. Do NOT add any explanation.`,
    abortSignal: signal,
  });

  const jsonStr = extractJsonFromText(result.text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (parseError) {
    log.warn('JSON parse failed, raw text', { textPreview: result.text.slice(0, 200) });
    throw new Error(`LLM 返回的内容不是有效 JSON: ${String(parseError).slice(0, 100)}`);
  }

  let validated: T;
  try {
    validated = schema.parse(parsed);
  } catch (zodError) {
    log.warn('Schema validation failed', {
      parsedKeys: typeof parsed === 'object' && parsed !== null ? Object.keys(parsed as object) : typeof parsed,
      parsedPreview: JSON.stringify(parsed).slice(0, 500),
      zodError: String(zodError).slice(0, 300),
    });
    throw zodError;
  }
  return { object: validated, usage: result.usage };
}

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
    (signal) => safeGenerateObject(model, prompt, clueAnalysisSchema, signal),
    { node: 'clue-analysis', provider: config?.provider },
  );

  logTokenUsage('clue-analysis', result.usage, config?.provider);
  return result.object;
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
    (signal) => safeGenerateObject(model, prompt, factor5M1ESchema, signal),
    { node: 'factor-identify', provider: config?.provider },
  );

  logTokenUsage('factor-identify', result.usage, config?.provider);
  return result.object;
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
    (signal) => safeGenerateObject(model, prompt, regulationMatchSchema, signal),
    { node: 'regulation-match', provider: config?.provider },
  );

  logTokenUsage('regulation-match', result.usage, config?.provider);
  return result.object;
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
    async (signal) => {
      const genResult = await generateText({
        model,
        prompt: `${prompt}\n\nIMPORTANT: Respond ONLY with valid JSON. Do NOT wrap in markdown code blocks. Do NOT add any explanation.`,
        abortSignal: signal,
      });
      const jsonStr = extractJsonFromText(genResult.text);
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonStr);
      } catch (parseError) {
        log.warn('report-generate JSON parse failed', { textPreview: genResult.text.slice(0, 200) });
        throw new Error(`报告生成返回的内容不是有效 JSON: ${String(parseError).slice(0, 100)}`);
      }
      // Basic structure validation
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('报告生成返回的内容不是有效的 JSON 对象');
      }
      const obj = parsed as Record<string, unknown>;
      if (!obj.cover || !obj.background || !obj.investigation) {
        log.warn('report-generate missing required sections', {
          hasCover: !!obj.cover,
          hasBackground: !!obj.background,
          hasInvestigation: !!obj.investigation,
        });
      }
      return { object: parsed as DeviationReport, usage: genResult.usage };
    },
    { node: 'report-generate', provider: config?.provider },
  );

  logTokenUsage('report-generate', result.usage, config?.provider);
  return result.object;
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

// ============================================================================
// Audit Agent — 内置审核
// ============================================================================

export interface AuditFinding {
  finding_type: 'logic_flaw' | 'compliance_risk' | 'inconsistency' | 'missing_info' | 'best_practice';
  severity: 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  suggestion?: string;
  regulation_ref?: string;
}

export interface AuditResult {
  findings: AuditFinding[];
  overallScore: number;
  summary: string;
}

const auditFindingsSchema = z.object({
  findings: z.array(z.object({
    finding_type: z.enum(['logic_flaw', 'compliance_risk', 'inconsistency', 'missing_info', 'best_practice']),
    severity: z.enum(['high', 'medium', 'low', 'info']),
    title: z.string().describe('发现标题'),
    description: z.string().describe('发现详细描述'),
    suggestion: z.string().optional().describe('改进建议'),
    regulation_ref: z.string().optional().describe('相关法规/SOP条款引用'),
  })).max(10).describe('审核发现列表'),
  overallScore: z.number().min(0).max(100).describe('综合评分'),
  summary: z.string().describe('审核总结'),
});

/**
 * Audit a deviation report using built-in LLM.
 * Replaces external AuditBee service.
 */
export async function auditDeviationReport(
  reportMarkdown: string,
  auditContext: string,
  config?: ProviderConfig,
): Promise<AuditResult> {
  log.info('Starting built-in audit', { reportLength: reportMarkdown.length, contextLength: auditContext.length });
  const start = Date.now();

  const prompt = fillPrompt('audit-report', {
    reportMarkdown,
    auditContext,
  });

  const result = await callLLMWithRetry(
    async (signal?: AbortSignal) => {
      const model = createLLMModel(config);
      return safeGenerateObject(model, prompt, auditFindingsSchema, signal);
    },
    { node: 'audit-report', provider: config?.provider, timeoutMs: 120_000 },
  );

  const auditResult = result.object;
  const duration = Date.now() - start;
  log.info('Audit completed', {
    duration: `${duration}ms`,
    findings: auditResult.findings.length,
    score: auditResult.overallScore,
  });
  recordMetric('llm.audit', duration, true, { findings: auditResult.findings.length });

  return auditResult;
}
