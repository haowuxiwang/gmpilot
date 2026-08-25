/**
 * Tests for core/rag/embedder.ts
 * Covers: factory function, OpenAI provider, SiliconFlow provider, embedText/embedTexts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock 'ai' module
vi.mock('ai', () => ({
  embedMany: vi.fn(),
}));

// Mock '@ai-sdk/openai'
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => ({
    textEmbeddingModel: vi.fn(() => 'mock-model'),
  })),
}));

// Mock db connection (used by getDbSettings)
vi.mock('../../db/connection', () => ({
  getDatabase: vi.fn(() => { throw new Error('no db'); }),
}));
vi.mock('../../db/schema', () => ({
  getAllSettings: vi.fn(() => ({})),
}));

import { embedMany } from 'ai';
import { createEmbeddingProvider, embedText, embedTexts } from '../embedder';

describe('embedder', () => {
  const originalEnv = process.env;

  // vitest 配置为单线程顺序执行，按字母序前跑的 llm 测试文件可能污染
  // LLM/embedding 环境变量（真实 key/baseURL），这里显式清空保证测试隔离
  const EMBEDDING_ENV_KEYS = [
    'EMBEDDING_PROVIDER',
    'EMBEDDING_MODEL',
    'EMBEDDING_MODEL_PATH',
    'OPENAI_API_KEY',
    'OPENAI_BASE_URL',
    'LLM_API_KEY',
    'LLM_BASE_URL',
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of EMBEDDING_ENV_KEYS) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('createEmbeddingProvider', () => {
    it('should create OpenAI provider when EMBEDDING_PROVIDER=openai', () => {
      process.env.EMBEDDING_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'sk-test123';
      process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1';
      process.env.EMBEDDING_MODEL = 'text-embedding-3-small';

      const provider = createEmbeddingProvider();
      expect(provider.name).toBe('openai');
      expect(provider.dimensions).toBe(1536);
      expect(provider.isAvailable()).toBe(true);
    });

    it('should create SiliconFlow provider when base URL contains siliconflow', () => {
      process.env.EMBEDDING_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'sk-test123';
      process.env.OPENAI_BASE_URL = 'https://api.siliconflow.cn/v1';
      process.env.EMBEDDING_MODEL = 'BAAI/bge-large-zh-v1.5';

      const provider = createEmbeddingProvider();
      expect(provider.name).toBe('siliconflow');
      expect(provider.dimensions).toBe(1024);
    });

    it('should fallback to local provider when EMBEDDING_PROVIDER=local', () => {
      process.env.EMBEDDING_PROVIDER = 'local';
      process.env.EMBEDDING_MODEL_PATH = '/nonexistent/path';
      delete process.env.OPENAI_API_KEY;
      delete process.env.LLM_API_KEY;

      const provider = createEmbeddingProvider();
      expect(provider.name).toBe('local');
      // Local model dir doesn't exist in test env
      expect(provider.isAvailable()).toBe(false);
    });

    it('should fallback to cloud when local not available and API key exists', () => {
      process.env.EMBEDDING_PROVIDER = 'local';
      process.env.EMBEDDING_MODEL_PATH = '/nonexistent/path';
      process.env.LLM_API_KEY = 'sk-fallback-key';
      process.env.LLM_BASE_URL = 'https://api.openai.com/v1';

      const provider = createEmbeddingProvider();
      // Should fallback to openai since local model dir doesn't exist
      expect(provider.name).toBe('openai');
    });

    it('should fallback to SiliconFlow when local not available and SiliconFlow key exists', () => {
      process.env.EMBEDDING_PROVIDER = 'local';
      process.env.EMBEDDING_MODEL_PATH = '/nonexistent/path';
      process.env.LLM_API_KEY = 'sk-fallback-key';
      process.env.LLM_BASE_URL = 'https://api.siliconflow.cn/v1';

      const provider = createEmbeddingProvider();
      expect(provider.name).toBe('siliconflow');
    });

    it('should return unavailable local provider when no fallback key', () => {
      process.env.EMBEDDING_PROVIDER = 'local';
      process.env.EMBEDDING_MODEL_PATH = '/nonexistent/path';
      delete process.env.OPENAI_API_KEY;
      delete process.env.LLM_API_KEY;

      const provider = createEmbeddingProvider();
      expect(provider.name).toBe('local');
      expect(provider.isAvailable()).toBe(false);
    });

    it('should treat placeholder API key as unavailable', () => {
      process.env.EMBEDDING_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'your_api_key_here';

      const provider = createEmbeddingProvider();
      expect(provider.isAvailable()).toBe(false);
    });
  });

  describe('OpenAIEmbeddingProvider.embed', () => {
    it('should return embeddings on success', async () => {
      process.env.EMBEDDING_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'sk-test123';
      process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1';

      const mockEmbeddings = [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]];
      vi.mocked(embedMany).mockResolvedValue({ embeddings: mockEmbeddings } as never);

      const provider = createEmbeddingProvider();
      const result = await provider.embed(['hello', 'world']);

      expect(result).toEqual(mockEmbeddings);
      expect(embedMany).toHaveBeenCalledTimes(1);
    });

    it('should return empty array for empty input', async () => {
      process.env.EMBEDDING_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'sk-test123';

      const provider = createEmbeddingProvider();
      const result = await provider.embed([]);

      expect(result).toEqual([]);
      expect(embedMany).not.toHaveBeenCalled();
    });

    it('should replace empty/whitespace texts with space', async () => {
      process.env.EMBEDDING_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'sk-test123';

      vi.mocked(embedMany).mockResolvedValue({ embeddings: [[0.1]] } as never);

      const provider = createEmbeddingProvider();
      await provider.embed(['  ', '']);

      expect(embedMany).toHaveBeenCalledWith(
        expect.objectContaining({ values: [' ', ' '] }),
      );
    });

    it('should retry on network error', async () => {
      process.env.EMBEDDING_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'sk-test123';

      const networkError = new Error('fetch failed');
      vi.mocked(embedMany)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({ embeddings: [[0.1, 0.2]] } as never);

      const provider = createEmbeddingProvider();
      const result = await provider.embed(['test']);

      expect(result).toEqual([[0.1, 0.2]]);
      expect(embedMany).toHaveBeenCalledTimes(2);
    });

    it('should throw non-retryable errors immediately', async () => {
      process.env.EMBEDDING_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'sk-test123';

      const authError = new Error('Invalid API key');
      vi.mocked(embedMany).mockRejectedValue(authError);

      const provider = createEmbeddingProvider();
      await expect(provider.embed(['test'])).rejects.toThrow('Invalid API key');
      expect(embedMany).toHaveBeenCalledTimes(1);
    });

    it('should throw after max retries exhausted', async () => {
      process.env.EMBEDDING_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'sk-test123';

      const networkError = new Error('fetch failed');
      vi.mocked(embedMany).mockRejectedValue(networkError);

      const provider = createEmbeddingProvider();
      await expect(provider.embed(['test'])).rejects.toThrow('fetch failed');
      expect(embedMany).toHaveBeenCalledTimes(3); // initial + 2 retries
    });
  });

  describe('SiliconFlowEmbeddingProvider.embed', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should return embeddings from SiliconFlow API', async () => {
      process.env.EMBEDDING_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'sk-sf-test';
      process.env.OPENAI_BASE_URL = 'https://api.siliconflow.cn/v1';

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }] }),
      });

      const provider = createEmbeddingProvider();
      const result = await provider.embed(['hello', 'world']);

      expect(result).toEqual([[0.1, 0.2], [0.3, 0.4]]);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.siliconflow.cn/v1/embeddings',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should return empty array for empty input', async () => {
      process.env.EMBEDDING_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'sk-sf-test';
      process.env.OPENAI_BASE_URL = 'https://api.siliconflow.cn/v1';

      const provider = createEmbeddingProvider();
      const result = await provider.embed([]);

      expect(result).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should throw on HTTP error response', async () => {
      process.env.EMBEDDING_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'sk-sf-test';
      process.env.OPENAI_BASE_URL = 'https://api.siliconflow.cn/v1';

      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      const provider = createEmbeddingProvider();
      await expect(provider.embed(['test'])).rejects.toThrow('SiliconFlow embedding failed: 401');
    });

    it('should retry on AbortError', async () => {
      process.env.EMBEDDING_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'sk-sf-test';
      process.env.OPENAI_BASE_URL = 'https://api.siliconflow.cn/v1';

      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';

      fetchMock
        .mockRejectedValueOnce(abortError)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [{ embedding: [0.5] }] }),
        });

      const provider = createEmbeddingProvider();
      const result = await provider.embed(['test']);

      expect(result).toEqual([[0.5]]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('embedText / embedTexts', () => {
    it('embedText should return single embedding', async () => {
      process.env.EMBEDDING_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'sk-test123';

      vi.mocked(embedMany).mockResolvedValue({ embeddings: [[0.1, 0.2, 0.3]] } as never);

      const result = await embedText('hello');
      expect(result).toEqual([0.1, 0.2, 0.3]);
    });

    it('embedTexts should return multiple embeddings', async () => {
      process.env.EMBEDDING_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'sk-test123';

      vi.mocked(embedMany).mockResolvedValue({ embeddings: [[0.1], [0.2]] } as never);

      const result = await embedTexts(['a', 'b']);
      expect(result).toEqual([[0.1], [0.2]]);
    });

    it('embedText should accept custom provider', async () => {
      const mockProvider = {
        name: 'mock',
        dimensions: 3,
        embed: vi.fn().mockResolvedValue([[0.9, 0.8, 0.7]]),
        isAvailable: () => true,
      };

      const result = await embedText('test', mockProvider);
      expect(result).toEqual([0.9, 0.8, 0.7]);
      expect(mockProvider.embed).toHaveBeenCalledWith(['test']);
    });
  });
});

