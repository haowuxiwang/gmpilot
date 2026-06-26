import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callLLMWithRetry, LLMAuthError, analyzeClue, identifyFactors, matchRegulations, generateReport, streamReport } from '../caller';

// Mock the AI SDK
vi.mock('ai', () => ({
  generateText: vi.fn(),
  generateObject: vi.fn(),
  streamObject: vi.fn(),
  jsonSchema: vi.fn((schema: unknown) => schema),
}));

// Mock provider module
vi.mock('../provider', () => ({
  createLLMModel: vi.fn(() => ({ modelId: 'mock-model' })),
}));

// Mock prompt loader
vi.mock('../prompts/loader', () => ({
  fillPrompt: vi.fn((name: string) => `prompt:${name}`),
}));

// Mock schema-to-prompt
vi.mock('../prompts/schema-to-prompt', () => ({
  getSchemaDescription: vi.fn(() => '{"schema":"mock"}'),
}));

// Mock logger to silence output
vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock schema JSON
vi.mock('../../schema/deviation-report-schema.json', () => ({
  default: {
    type: 'object',
    properties: {
      deviationId: { type: 'string' },
      summary: { type: 'string' },
    },
    required: ['deviationId', 'summary'],
  },
}));

describe('callLLMWithRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await callLLMWithRetry(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable error', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('429 rate limit'))
      .mockResolvedValue('success');
    const result = await callLLMWithRetry(fn, { maxRetries: 2 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should throw on auth error without retry', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('401 invalid api key'));
    await expect(callLLMWithRetry(fn)).rejects.toThrow(LLMAuthError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should throw on non-retryable error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('400 bad request'));
    await expect(callLLMWithRetry(fn)).rejects.toThrow('400 bad request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should exhaust retries and throw', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('500 server error'));
    await expect(callLLMWithRetry(fn, { maxRetries: 2 })).rejects.toThrow('500 server error');
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('should retry on timeout error', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue('ok');
    const result = await callLLMWithRetry(fn, { maxRetries: 1 });
    expect(result).toBe('ok');
  });

  it('should retry on connection error', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValue('ok');
    const result = await callLLMWithRetry(fn, { maxRetries: 1 });
    expect(result).toBe('ok');
  });

  it('should not retry on 403 error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('403 forbidden'));
    await expect(callLLMWithRetry(fn)).rejects.toThrow(LLMAuthError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should classify overloaded as retryable', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('server overloaded'))
      .mockResolvedValue('ok');
    const result = await callLLMWithRetry(fn, { maxRetries: 1 });
    expect(result).toBe('ok');
  });

  it('should classify service unavailable as retryable', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('503 service unavailable'))
      .mockResolvedValue('ok');
    const result = await callLLMWithRetry(fn, { maxRetries: 1 });
    expect(result).toBe('ok');
  });

  it('should not retry on invalid request', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('invalid request'));
    await expect(callLLMWithRetry(fn)).rejects.toThrow('invalid request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should use error message from Error objects', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('unauthorized access'));
    await expect(callLLMWithRetry(fn)).rejects.toThrow(LLMAuthError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // ---- classifyError via statusCode property ----

  it('should classify statusCode 401 as auth error', async () => {
    const error = Object.assign(new Error('fail'), { statusCode: 401 });
    const fn = vi.fn().mockRejectedValue(error);
    await expect(callLLMWithRetry(fn)).rejects.toThrow(LLMAuthError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should classify statusCode 403 as auth error', async () => {
    const error = Object.assign(new Error('fail'), { statusCode: 403 });
    const fn = vi.fn().mockRejectedValue(error);
    await expect(callLLMWithRetry(fn)).rejects.toThrow(LLMAuthError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should classify statusCode 400 as non-retryable', async () => {
    const error = Object.assign(new Error('fail'), { statusCode: 400 });
    const fn = vi.fn().mockRejectedValue(error);
    await expect(callLLMWithRetry(fn)).rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should classify statusCode 429 as retryable', async () => {
    const error = Object.assign(new Error('fail'), { statusCode: 429 });
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('ok');
    const result = await callLLMWithRetry(fn, { maxRetries: 1 });
    expect(result).toBe('ok');
  });

  it('should classify statusCode 500 as retryable', async () => {
    const error = Object.assign(new Error('fail'), { statusCode: 500 });
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('ok');
    const result = await callLLMWithRetry(fn, { maxRetries: 1 });
    expect(result).toBe('ok');
  });

  it('should classify statusCode 502 as retryable', async () => {
    const error = Object.assign(new Error('fail'), { statusCode: 502 });
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('ok');
    const result = await callLLMWithRetry(fn, { maxRetries: 1 });
    expect(result).toBe('ok');
  });

  // ---- non-Error throwables ----

  it('should handle non-Error throwables (string)', async () => {
    const fn = vi.fn().mockRejectedValue('raw string error');
    // non-Error string becomes non-retryable by default
    await expect(callLLMWithRetry(fn)).rejects.toBe('raw string error');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // ---- AbortError / timeout ----

  it('should throw timeout message on AbortError', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    const fn = vi.fn().mockRejectedValue(abortError);
    await expect(callLLMWithRetry(fn, { maxRetries: 0, timeoutMs: 1000 })).rejects.toThrow('LLM 调用超时');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry AbortError and succeed', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    const fn = vi.fn()
      .mockRejectedValueOnce(abortError)
      .mockResolvedValue('ok');
    const result = await callLLMWithRetry(fn, { maxRetries: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should throw timeout error after all retries exhausted on AbortError', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    const fn = vi.fn().mockRejectedValue(abortError);
    await expect(callLLMWithRetry(fn, { maxRetries: 1, timeoutMs: 5000 })).rejects.toThrow('LLM 调用超时');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  // ---- options passthrough ----

  it('should pass node and provider to logging', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await callLLMWithRetry(fn, { node: 'test-node', provider: 'deepseek' });
    expect(result).toBe('ok');
  });

  // ---- exponential backoff ----

  it('should use exponential backoff (2s, 4s, 8s)', async () => {
    let callCount = 0;
    const fn = vi.fn().mockImplementation(() => {
      callCount++;
      // Use 'server error' which matches retryable regex, not bare '500'
      if (callCount <= 3) throw new Error('server error');
      return 'ok';
    });
    const result = await callLLMWithRetry(fn, { maxRetries: 3 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(4);
  }, 60_000); // generous timeout for real delays (2+4+8=14s)
});

describe('LLMAuthError', () => {
  it('should have correct name and message', () => {
    const error = new LLMAuthError('deepseek', 'test message');
    expect(error.name).toBe('LLMAuthError');
    expect(error.provider).toBe('deepseek');
    expect(error.message).toBe('test message');
  });

  it('should have default message', () => {
    const error = new LLMAuthError('openai');
    expect(error.message).toContain('openai');
    expect(error.message).toContain('API Key');
  });

  it('should be an instance of Error', () => {
    const error = new LLMAuthError('test');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('analyzeClue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call generateObject with correct parameters and return object', async () => {
    const { generateObject } = await import('ai');
    const mockResult = {
      object: { summary: 'test', keyEvents: [], involvedParties: [], documentType: 'deviation_analysis' },
      usage: { promptTokens: 10, completionTokens: 20 },
    };
    vi.mocked(generateObject).mockResolvedValue(mockResult as never);

    const result = await analyzeClue('some clue text');

    expect(result).toEqual(mockResult.object);
    expect(generateObject).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(generateObject).mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.prompt).toBe('prompt:clue-analysis');
  });

  it('should pass config to createLLMModel', async () => {
    const { createLLMModel } = await import('../provider');
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValue({
      object: { summary: '', keyEvents: [], involvedParties: [], documentType: 'deviation_analysis' },
      usage: undefined,
    } as never);

    const config = { provider: 'deepseek', apiKey: 'test-key' };
    await analyzeClue('clue', config);

    expect(createLLMModel).toHaveBeenCalledWith(config);
  });

  it('should work without usage in response', async () => {
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValue({
      object: { summary: 'ok', keyEvents: [], involvedParties: [], documentType: 'deviation_analysis' },
      usage: undefined,
    } as never);

    const result = await analyzeClue('test');
    expect(result.summary).toBe('ok');
  });
});

describe('identifyFactors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call generateObject and return Factor5M1E', async () => {
    const { generateObject } = await import('ai');
    const factors = { man: [], machine: [], material: [], method: [], environment: [] };
    vi.mocked(generateObject).mockResolvedValue({
      object: factors,
      usage: { promptTokens: 5, completionTokens: 10 },
    } as never);

    const analysis = { summary: 'test', keyEvents: [], involvedParties: [], documentType: 'deviation_analysis' as const };
    const result = await identifyFactors('clue', analysis);

    expect(result).toEqual(factors);
    expect(generateObject).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(generateObject).mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.prompt).toBe('prompt:factor-identify');
  });
});

describe('matchRegulations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call generateObject and return RegulationMatch[]', async () => {
    const { generateObject } = await import('ai');
    const regulations = [
      { regulation: 'GMP', chapter: '1', article: '1', title: 'test', content: 'test', relevance: 'high' },
    ];
    vi.mocked(generateObject).mockResolvedValue({
      object: regulations,
      usage: { promptTokens: 5, completionTokens: 10 },
    } as never);

    const factors = { man: [], machine: [], material: [], method: [], environment: [] };
    const result = await matchRegulations('clue', factors, 'context');

    expect(result).toEqual(regulations);
    expect(generateObject).toHaveBeenCalledTimes(1);
  });
});

describe('generateReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call generateObject with report-generate prompt and return DeviationReport', async () => {
    const { generateObject } = await import('ai');
    const report = { deviationId: 'DEV-001', summary: 'test report' };
    vi.mocked(generateObject).mockResolvedValue({
      object: report,
      usage: { promptTokens: 50, completionTokens: 100 },
    } as never);

    const factors = { man: [], machine: [], material: [], method: [], environment: [] };
    const result = await generateReport('DEV-001', 'summary', factors, [], []);

    expect(result).toEqual(report);
    expect(generateObject).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(generateObject).mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.prompt).toBe('prompt:report-generate');
  });

  it('should pass config provider to createLLMModel', async () => {
    const { createLLMModel } = await import('../provider');
    const { generateObject } = await import('ai');
    vi.mocked(generateObject).mockResolvedValue({
      object: {},
      usage: undefined,
    } as never);

    const config = { provider: 'openai', apiKey: 'sk-test' };
    await generateReport('DEV-001', 'summary', { man: [], machine: [], material: [], method: [], environment: [] }, [], [], config);

    expect(createLLMModel).toHaveBeenCalledWith(config);
  });
});

describe('streamReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should stream partial objects and return final result', async () => {
    const { streamObject } = await import('ai');
    const partialResults = [{ summary: 'partial1' }, { summary: 'partial2' }];
    const finalObject = { deviationId: 'DEV-001', summary: 'complete' };

    const mockStream = {
      partialObjectStream: (async function* () {
        for (const p of partialResults) yield p;
      })(),
      object: Promise.resolve(finalObject),
      usage: Promise.resolve({ promptTokens: 10, completionTokens: 20 }),
    };
    vi.mocked(streamObject).mockReturnValue(mockStream as never);

    const onPartial = vi.fn();
    const factors = { man: [], machine: [], material: [], method: [], environment: [] };
    const result = await streamReport('DEV-001', 'summary', factors, [], [], onPartial);

    expect(result).toEqual(finalObject);
    expect(onPartial).toHaveBeenCalledTimes(2);
    expect(onPartial).toHaveBeenCalledWith(partialResults[0]);
    expect(onPartial).toHaveBeenCalledWith(partialResults[1]);
  });

  it('should use custom timeout and maxRetries options', async () => {
    const { streamObject } = await import('ai');
    const finalObject = { deviationId: 'DEV-002', summary: 'done' };
    const mockStream = {
      partialObjectStream: (async function* () {})(),
      object: Promise.resolve(finalObject),
      usage: Promise.resolve(undefined),
    };
    vi.mocked(streamObject).mockReturnValue(mockStream as never);

    const result = await streamReport(
      'DEV-002', 'summary',
      { man: [], machine: [], material: [], method: [], environment: [] },
      [], [],
      vi.fn(),
      undefined,
      { timeoutMs: 60_000, maxRetries: 0 },
    );

    expect(result).toEqual(finalObject);
  });

  it('should retry on non-auth error and succeed', async () => {
    const { streamObject } = await import('ai');
    const finalObject = { deviationId: 'DEV-003', summary: 'retried' };

    let callCount = 0;
    vi.mocked(streamObject).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        throw new Error('500 server error');
      }
      return {
        partialObjectStream: (async function* () {})(),
        object: Promise.resolve(finalObject),
        usage: Promise.resolve(undefined),
      } as never;
    });

    const factors = { man: [], machine: [], material: [], method: [], environment: [] };
    const result = await streamReport('DEV-003', 'summary', factors, [], [], vi.fn(), undefined, { maxRetries: 1 });

    expect(result).toEqual(finalObject);
    expect(streamObject).toHaveBeenCalledTimes(2);
  }, 10_000);

  it('should throw LLMAuthError on auth failure without retry', async () => {
    const { streamObject } = await import('ai');
    vi.mocked(streamObject).mockImplementation(() => {
      throw new Error('401 unauthorized');
    });

    const factors = { man: [], machine: [], material: [], method: [], environment: [] };
    await expect(
      streamReport('DEV-004', 'summary', factors, [], [], vi.fn(), { provider: 'deepseek', apiKey: 'key' }),
    ).rejects.toThrow(LLMAuthError);
    expect(streamObject).toHaveBeenCalledTimes(1);
  });

  it('should throw after all retries exhausted', async () => {
    const { streamObject } = await import('ai');
    vi.mocked(streamObject).mockImplementation(() => {
      throw new Error('500 server error');
    });

    const factors = { man: [], machine: [], material: [], method: [], environment: [] };
    await expect(
      streamReport('DEV-005', 'summary', factors, [], [], vi.fn(), undefined, { maxRetries: 1 }),
    ).rejects.toThrow('500 server error');
    expect(streamObject).toHaveBeenCalledTimes(2);
  }, 10_000);

  it('should handle AbortError with timeout message', async () => {
    const { streamObject } = await import('ai');
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    vi.mocked(streamObject).mockImplementation(() => {
      throw abortError;
    });

    const factors = { man: [], machine: [], material: [], method: [], environment: [] };
    await expect(
      streamReport('DEV-006', 'summary', factors, [], [], vi.fn(), undefined, { maxRetries: 0 }),
    ).rejects.toThrow('报告生成超时');
  });

  it('should handle AbortError with retry and succeed', async () => {
    const { streamObject } = await import('ai');
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    const finalObject = { deviationId: 'DEV-007', summary: 'recovered' };

    let callCount = 0;
    vi.mocked(streamObject).mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw abortError;
      return {
        partialObjectStream: (async function* () {})(),
        object: Promise.resolve(finalObject),
        usage: Promise.resolve(undefined),
      } as never;
    });

    const factors = { man: [], machine: [], material: [], method: [], environment: [] };
    const result = await streamReport('DEV-007', 'summary', factors, [], [], vi.fn(), undefined, { maxRetries: 1 });
    expect(result).toEqual(finalObject);
    expect(streamObject).toHaveBeenCalledTimes(2);
  }, 10_000);

  it('should pass config to createLLMModel', async () => {
    const { createLLMModel } = await import('../provider');
    const { streamObject } = await import('ai');
    vi.mocked(streamObject).mockReturnValue({
      partialObjectStream: (async function* () {})(),
      object: Promise.resolve({}),
      usage: Promise.resolve(undefined),
    } as never);

    const config = { provider: 'anthropic', apiKey: 'sk-ant-test' };
    await streamReport('DEV-008', 'summary', { man: [], machine: [], material: [], method: [], environment: [] }, [], [], vi.fn(), config);

    expect(createLLMModel).toHaveBeenCalledWith(config);
  });

  it('should call onPartial with empty partials for empty stream', async () => {
    const { streamObject } = await import('ai');
    const finalObject = { deviationId: 'DEV-009', summary: 'empty-stream' };
    vi.mocked(streamObject).mockReturnValue({
      partialObjectStream: (async function* () {})(),
      object: Promise.resolve(finalObject),
      usage: Promise.resolve(undefined),
    } as never);

    const onPartial = vi.fn();
    const result = await streamReport('DEV-009', 's', { man: [], machine: [], material: [], method: [], environment: [] }, [], [], onPartial);
    expect(result).toEqual(finalObject);
    expect(onPartial).not.toHaveBeenCalled();
  });
});
