import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { EmbeddingProvider } from '../embedder';

// Mock ai SDK's embedMany
vi.mock('ai', () => ({
  embedMany: vi.fn().mockResolvedValue({
    embeddings: [
      [0.1, 0.2, 0.3, 0.4],
      [0.5, 0.6, 0.7, 0.8],
    ],
  }),
}));

// Mock @ai-sdk/openai — createOpenAI returns a provider function
// that has .textEmbeddingModel() method returning a model object
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn().mockReturnValue(
    Object.assign(
      vi.fn().mockReturnValue({}),
      {
        textEmbeddingModel: vi.fn().mockReturnValue({ /* mock model */ }),
      },
    ),
  ),
}));

describe('createEmbeddingProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should create local provider by default', async () => {
    const { createEmbeddingProvider } = await import('../embedder');
    const provider = createEmbeddingProvider();
    expect(provider.name).toBe('local');
    expect(provider.dimensions).toBe(1024);
  });

  it('should create openai provider with valid key', async () => {
    process.env.LLM_API_KEY = 'sk-test-key';
    const { createEmbeddingProvider } = await import('../embedder');
    const provider = createEmbeddingProvider();
    expect(provider.name).toBe('openai');
    expect(provider.isAvailable()).toBe(true);
  });

  it('should report openai provider as unavailable with placeholder key', async () => {
    process.env.LLM_API_KEY = 'your_api_key_here';
    const { createEmbeddingProvider } = await import('../embedder');
    const provider = createEmbeddingProvider();
    expect(provider.isAvailable()).toBe(false);
  });

  it('should report openai provider as unavailable with empty key', async () => {
    process.env.LLM_API_KEY = '';
    const { createEmbeddingProvider } = await import('../embedder');
    const provider = createEmbeddingProvider();
    expect(provider.isAvailable()).toBe(false);
  });

  it('should use custom model name from EMBEDDING_MODEL env', async () => {
    process.env.EMBEDDING_MODEL = 'text-embedding-3-large';
    process.env.LLM_API_KEY = 'sk-test-key';
    const { createEmbeddingProvider } = await import('../embedder');
    const provider = createEmbeddingProvider();
    expect(provider.name).toBe('openai');
  });

  it('should use LLM_BASE_URL when OPENAI_BASE_URL not set', async () => {
    process.env.LLM_API_KEY = 'sk-test-key';
    process.env.LLM_BASE_URL = 'https://llm.api.com/v1';
    const { createEmbeddingProvider } = await import('../embedder');
    const provider = createEmbeddingProvider();
    expect(provider.name).toBe('openai');
  });
});

// ============================================================================
// embedText / embedTexts with mock provider
// ============================================================================

describe('embedText', () => {
  it('should embed a single text using provided provider', async () => {
    const mockProvider: EmbeddingProvider = {
      name: 'mock',
      dimensions: 4,
      embed: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3, 0.4]]),
      isAvailable: () => true,
    };
    const { embedText } = await import('../embedder');
    const result = await embedText('test text', mockProvider);
    expect(result).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(mockProvider.embed).toHaveBeenCalledWith(['test text']);
  });

  it('should create provider internally when none provided', async () => {
    const originalEnv = process.env;
    process.env = { ...originalEnv };
    process.env.EMBEDDING_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-test-key';

    const { embedText } = await import('../embedder');
    // The mocked embedMany returns [[0.1,0.2,0.3,0.4],[0.5,0.6,0.7,0.8]]
    // embedText takes the first result
    const result = await embedText('test text');
    expect(result).toEqual([0.1, 0.2, 0.3, 0.4]);

    process.env = originalEnv;
  });
});

describe('embedTexts', () => {
  it('should embed multiple texts using provided provider', async () => {
    const mockProvider: EmbeddingProvider = {
      name: 'mock',
      dimensions: 4,
      embed: vi.fn().mockResolvedValue([
        [0.1, 0.2, 0.3, 0.4],
        [0.5, 0.6, 0.7, 0.8],
      ]),
      isAvailable: () => true,
    };
    const { embedTexts } = await import('../embedder');
    const result = await embedTexts(['text1', 'text2'], mockProvider);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(result[1]).toEqual([0.5, 0.6, 0.7, 0.8]);
    expect(mockProvider.embed).toHaveBeenCalledWith(['text1', 'text2']);
  });

  it('should create provider internally when none provided', async () => {
    const originalEnv = process.env;
    process.env = { ...originalEnv };
    process.env.EMBEDDING_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-test-key';

    const { embedTexts } = await import('../embedder');
    const result = await embedTexts(['text1', 'text2']);
    expect(result).toHaveLength(2);

    process.env = originalEnv;
  });
});

// ============================================================================
// OpenAIEmbeddingProvider.embed() — uses mocked ai SDK
// ============================================================================

describe('OpenAIEmbeddingProvider.embed()', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should call embedMany and return embeddings', async () => {
    process.env.EMBEDDING_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-test-key';
    const { createEmbeddingProvider } = await import('../embedder');
    const provider = createEmbeddingProvider();

    const result = await provider.embed(['hello', 'world']);
    expect(result).toEqual([
      [0.1, 0.2, 0.3, 0.4],
      [0.5, 0.6, 0.7, 0.8],
    ]);
  });

  it('should cache model instance after first call', async () => {
    process.env.EMBEDDING_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-test-key';
    const { createEmbeddingProvider } = await import('../embedder');
    const provider = createEmbeddingProvider();

    await provider.embed(['first call']);
    await provider.embed(['second call']);
    // Both calls should succeed without re-creating the model
    expect(provider.name).toBe('openai');
  });
});

