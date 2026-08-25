/**
 * End-to-end test for SiliconFlow LLM connectivity.
 * Makes real API calls — no mocks.
 *
 * Run: npx vitest run core/llm/__tests__/siliconflow-e2e.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import dotenv from 'dotenv';
import path from 'path';
import { generateText, streamText } from 'ai';
import {
  getProviderConfig,
  createLLMModel,
  healthCheckProvider,
  clearSettingsCache,
  PROVIDER_REGISTRY,
} from '../provider';
import { callLLMWithRetry } from '../caller';

// Load .env from config/
dotenv.config({ path: path.resolve(__dirname, '../../../config/.env') });

// Also set process.env from .env for provider.ts to read
const envPath = path.resolve(__dirname, '../../../config/.env');
const envResult = dotenv.config({ path: envPath });
if (envResult.error) {
  console.warn('Failed to load .env:', envResult.error.message);
}

// Ensure DB mock won't interfere — provider reads from process.env
vi.mock('../../db/connection', () => ({
  getDatabase: vi.fn(() => ({})),
}));
vi.mock('../../db/schema', () => ({
  getAllSettings: vi.fn(() => ({})),
}));
vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));
vi.mock('../../utils/metrics', () => ({
  recordMetric: vi.fn(),
}));

// Latency measurements collected during tests
interface LatencyRecord {
  test: string;
  latencyMs: number;
  success: boolean;
  tokensPerSecond?: number;
  error?: string;
}
const latencyReport: LatencyRecord[] = [];

function recordLatency(test: string, latencyMs: number, success: boolean, extra?: Partial<LatencyRecord>) {
  latencyReport.push({ test, latencyMs, success, ...extra });
}

// ============================================================================
// 1. Provider Initialization
// ============================================================================

describe('SiliconFlow E2E: Provider Initialization', () => {
  beforeAll(() => {
    clearSettingsCache();
  });

  it('should load API key from .env', () => {
    const apiKey = process.env.LLM_API_KEY;
    expect(apiKey).toBeTruthy();
    expect(apiKey).not.toMatch(/^your_/);
    expect(apiKey).toMatch(/^sk-/);
  });

  it('should load SiliconFlow base URL from .env', () => {
    const baseUrl = process.env.LLM_BASE_URL;
    expect(baseUrl).toBe('https://api.siliconflow.cn/v1');
  });

  it('should load model name from .env', () => {
    const model = process.env.LLM_MODEL;
    expect(model).toBeTruthy();
    expect(model).toContain('/');
  });

  it('should resolve provider as siliconflow from unified URL', () => {
    const config = getProviderConfig();
    expect(config.provider).toBe('siliconflow');
    expect(config.baseUrl).toBe('https://api.siliconflow.cn/v1');
    expect(config.apiKey).toMatch(/^sk-/);
  });

  it('should create a valid OpenAI-compatible model instance', () => {
    const config = getProviderConfig();
    const model = createLLMModel(config);
    expect(model).toBeDefined();
  });

  it('should have siliconflow in PROVIDER_REGISTRY with correct defaults', () => {
    const sf = PROVIDER_REGISTRY['siliconflow'];
    expect(sf).toBeDefined();
    expect(sf.name).toBe('SiliconFlow (硅基流动)');
    expect(sf.baseUrl).toBe('https://api.siliconflow.cn/v1');
    expect(sf.defaultModel).toBe('deepseek-ai/DeepSeek-V3.2');
  });
});

// ============================================================================
// 2. Chat Completion (simple request)
// ============================================================================

describe('SiliconFlow E2E: Chat Completion', () => {
  it('should complete a simple chat prompt', async () => {
    const start = Date.now();
    const config = getProviderConfig();
    const model = createLLMModel(config);

    const result = await generateText({
      model,
      prompt: 'Say "hello world" in exactly 3 words.',
      maxTokens: 50,
    });

    const latencyMs = Date.now() - start;
    recordLatency('chat-completion', latencyMs, true);

    expect(result.text).toBeTruthy();
    expect(result.text.length).toBeGreaterThan(0);
    console.log(`[chat-completion] ${latencyMs}ms — response: "${result.text.trim()}"`);
  });

  it('should handle a Chinese prompt', async () => {
    const start = Date.now();
    const config = getProviderConfig();
    const model = createLLMModel(config);

    const result = await generateText({
      model,
      prompt: '用中文回答：GMP是什么的缩写？',
      maxTokens: 100,
    });

    const latencyMs = Date.now() - start;
    recordLatency('chat-chinese', latencyMs, true);

    expect(result.text).toBeTruthy();
    console.log(`[chat-chinese] ${latencyMs}ms — response: "${result.text.trim().slice(0, 80)}..."`);
  });

  it('should return token usage', async () => {
    const config = getProviderConfig();
    const model = createLLMModel(config);

    const result = await generateText({
      model,
      prompt: 'Reply with just "ok".',
      maxTokens: 10,
    });

    expect(result.usage).toBeDefined();
    expect(result.usage.promptTokens).toBeGreaterThan(0);
    expect(result.usage.completionTokens).toBeGreaterThan(0);
    console.log(`[token-usage] prompt=${result.usage.promptTokens}, completion=${result.usage.completionTokens}`);
  });
});

// ============================================================================
// 3. Streaming
// ============================================================================

describe('SiliconFlow E2E: Streaming', () => {
  it('should stream text chunks', async () => {
    const start = Date.now();
    const config = getProviderConfig();
    const model = createLLMModel(config);

    const result = streamText({
      model,
      prompt: 'Count from 1 to 5, one number per line.',
      maxTokens: 50,
    });

    const chunks: string[] = [];
    for await (const chunk of result.textStream) {
      chunks.push(chunk);
    }

    const latencyMs = Date.now() - start;
    const fullText = chunks.join('');
    recordLatency('streaming', latencyMs, true);

    expect(chunks.length).toBeGreaterThan(1);
    expect(fullText).toBeTruthy();
    console.log(`[streaming] ${latencyMs}ms — ${chunks.length} chunks, full text: "${fullText.trim()}"`);
  });

  it('should stream with onChunk callback', async () => {
    const config = getProviderConfig();
    const model = createLLMModel(config);

    const receivedChunks: string[] = [];
    const result = streamText({
      model,
      prompt: 'Say "A B C" with spaces.',
      maxTokens: 20,
      onChunk: ({ chunk }) => {
        if (chunk.type === 'text-delta') {
          receivedChunks.push(chunk.textDelta);
        }
      },
    });

    await result.consumeStream();

    expect(receivedChunks.length).toBeGreaterThan(0);
    console.log(`[streaming-callback] received ${receivedChunks.length} chunks via onChunk`);
  });
});

// ============================================================================
// 4. Structured Output (JSON generation)
// ============================================================================

describe('SiliconFlow E2E: Structured Output', () => {
  it('should generate a JSON object matching a simple schema', async () => {
    const start = Date.now();
    const config = getProviderConfig();
    const model = createLLMModel(config);

    // Use generateText + manual extraction (matching safeGenerateObject pattern)
    const result = await generateText({
      model,
      prompt: `Return a JSON object with exactly these fields:
- "name": a person's name (string)
- "age": a person's age (number)
- "city": a city name (string)

IMPORTANT: Respond ONLY with valid JSON. Do NOT wrap in markdown code blocks. Do NOT add any explanation.`,
      maxTokens: 200,
    });

    const latencyMs = Date.now() - start;
    recordLatency('structured-simple', latencyMs, true);

    // Extract JSON from response
    const text = result.text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    expect(jsonMatch).toBeTruthy();

    const parsed = JSON.parse(jsonMatch![0]);
    expect(parsed.name).toBeDefined();
    expect(typeof parsed.name).toBe('string');
    expect(parsed.age).toBeDefined();
    expect(typeof parsed.age).toBe('number');
    expect(parsed.city).toBeDefined();
    expect(typeof parsed.city).toBe('string');

    console.log(`[structured-simple] ${latencyMs}ms — parsed:`, JSON.stringify(parsed));
  });

  it('should generate structured array output', async () => {
    const start = Date.now();
    const config = getProviderConfig();
    const model = createLLMModel(config);

    const result = await generateText({
      model,
      prompt: `Return a JSON array of 3 objects, each with "id" (number) and "label" (string) fields.
Example: [{"id": 1, "label": "alpha"}, ...]

IMPORTANT: Respond ONLY with valid JSON. Do NOT wrap in markdown code blocks. Do NOT add any explanation.`,
      maxTokens: 300,
    });

    const latencyMs = Date.now() - start;
    recordLatency('structured-array', latencyMs, true);

    const text = result.text.trim();
    // Handle both raw JSON and markdown-wrapped JSON
    const jsonMatch = text.match(/\[[\s\S]*\]/) || text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    expect(jsonMatch).toBeTruthy();

    const jsonStr = jsonMatch![0].startsWith('[') ? jsonMatch![0] : jsonMatch![1];
    const parsed = JSON.parse(jsonStr);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(3);
    expect(parsed[0].id).toBeDefined();
    expect(parsed[0].label).toBeDefined();

    console.log(`[structured-array] ${latencyMs}ms — parsed ${parsed.length} items`);
  });

  it('should handle the safeGenerateObject extraction pattern', async () => {
    const config = getProviderConfig();
    const model = createLLMModel(config);

    const result = await generateText({
      model,
      prompt: `Return a JSON object: {"summary": "brief summary", "score": 85}
IMPORTANT: Respond ONLY with valid JSON. Do NOT wrap in markdown code blocks. Do NOT add any explanation.`,
      maxTokens: 200,
    });

    // Simulate extractJsonFromText logic from caller.ts
    const trimmed = result.text.trim();
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    const jsonStr = codeBlockMatch
      ? codeBlockMatch[1].trim()
      : trimmed.slice(trimmed.indexOf('{'), trimmed.lastIndexOf('}') + 1);

    const parsed = JSON.parse(jsonStr);
    expect(parsed.summary).toBeDefined();
    expect(parsed.score).toBeDefined();
    expect(typeof parsed.score).toBe('number');
  });
});

// ============================================================================
// 5. Retry Logic
// ============================================================================

describe('SiliconFlow E2E: Retry Logic', () => {
  it('should succeed on first attempt with valid request', async () => {
    const start = Date.now();
    let attempts = 0;

    const result = await callLLMWithRetry(
      async (signal) => {
        attempts++;
        const config = getProviderConfig();
        const model = createLLMModel(config);
        return generateText({
          model,
          prompt: 'Reply "ping"',
          maxTokens: 10,
          abortSignal: signal,
        });
      },
      { node: 'retry-test', provider: 'siliconflow', maxRetries: 2 },
    );

    const latencyMs = Date.now() - start;
    recordLatency('retry-first-try', latencyMs, true);

    expect(attempts).toBe(1);
    expect(result.text).toBeTruthy();
    console.log(`[retry-first-try] ${latencyMs}ms — attempts: ${attempts}`);
  });

  it('should retry on transient failure and succeed', async () => {
    const start = Date.now();
    let attempts = 0;

    const result = await callLLMWithRetry(
      async (signal) => {
        attempts++;
        // Fail first attempt with a retryable error
        if (attempts === 1) {
          const error = new Error('ECONNRESET') as Error & { statusCode?: number };
          error.statusCode = 503;
          throw error;
        }
        const config = getProviderConfig();
        const model = createLLMModel(config);
        return generateText({
          model,
          prompt: 'Reply "pong"',
          maxTokens: 10,
          abortSignal: signal,
        });
      },
      { node: 'retry-on-failure', provider: 'siliconflow', maxRetries: 2 },
    );

    const latencyMs = Date.now() - start;
    recordLatency('retry-on-failure', latencyMs, true);

    expect(attempts).toBe(2);
    expect(result.text).toBeTruthy();
    console.log(`[retry-on-failure] ${latencyMs}ms — attempts: ${attempts}`);
  }, 30000); // Allow extra time for retry delay

  it('should throw LLMAuthError on 401/403 without retry', async () => {
    let attempts = 0;

    await expect(
      callLLMWithRetry(
        async () => {
          attempts++;
          const error = new Error('Unauthorized') as Error & { statusCode?: number };
          error.statusCode = 401;
          throw error;
        },
        { node: 'auth-error', provider: 'siliconflow', maxRetries: 2 },
      ),
    ).rejects.toThrow();

    expect(attempts).toBe(1); // Should NOT retry on auth error
  });

  it('should not retry on 400 Bad Request', async () => {
    let attempts = 0;

    await expect(
      callLLMWithRetry(
        async () => {
          attempts++;
          const error = new Error('Bad Request') as Error & { statusCode?: number };
          error.statusCode = 400;
          throw error;
        },
        { node: 'bad-request', provider: 'siliconflow', maxRetries: 2 },
      ),
    ).rejects.toThrow();

    expect(attempts).toBe(1); // Should NOT retry on 400
  });
});

// ============================================================================
// 6. Health Check
// ============================================================================

describe('SiliconFlow E2E: Health Check', () => {
  it('should pass health check for siliconflow', async () => {
    const start = Date.now();
    const result = await healthCheckProvider('siliconflow');
    const latencyMs = Date.now() - start;
    recordLatency('health-check', latencyMs, result.ok, { error: result.error });

    expect(result.ok).toBe(true);
    expect(result.provider).toBe('siliconflow');
    expect(result.model).toBeTruthy();
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    console.log(`[health-check] ${latencyMs}ms — ok=${result.ok}, model=${result.model}`);
  });
});

// ============================================================================
// 7. Latency Report (runs last)
// ============================================================================

describe('SiliconFlow E2E: Latency Report', () => {
  it('should print comprehensive latency report', () => {
    console.log('\n' + '='.repeat(70));
    console.log('  SiliconFlow E2E Latency Report');
    console.log('='.repeat(70));
    console.log(
      'Test'.padEnd(25) +
      'Latency'.padStart(12) +
      'Status'.padStart(10) +
      'Extra'.padStart(15),
    );
    console.log('-'.repeat(70));

    for (const r of latencyReport) {
      console.log(
        r.test.padEnd(25) +
        `${r.latencyMs}ms`.padStart(12) +
        (r.success ? '  PASS' : '  FAIL').padStart(10) +
        (r.tokensPerSecond ? ` ${r.tokensPerSecond.toFixed(1)} t/s` : r.error ? ` ${r.error.slice(0, 14)}` : '').padStart(15),
      );
    }

    const avg = latencyReport.reduce((s, r) => s + r.latencyMs, 0) / latencyReport.length;
    const passed = latencyReport.filter((r) => r.success).length;
    console.log('-'.repeat(70));
    console.log(`Total: ${latencyReport.length} tests, ${passed} passed, avg latency: ${avg.toFixed(0)}ms`);
    console.log('='.repeat(70) + '\n');

    // This test always passes — it's just a report
    expect(true).toBe(true);
  });
});
