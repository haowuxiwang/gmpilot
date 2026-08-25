import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getProviderConfig,
  isProviderConfigured,
  getConfiguredProviders,
  createLLMModel,
  healthCheckProvider,
  healthCheckAllProviders,
  PROVIDER_REGISTRY,
  PROVIDER_LIST,
  clearSettingsCache,
  updateResolvedApiKey,
} from '../provider';

// Mock DB modules
vi.mock('../../db/connection', () => ({
  getDatabase: vi.fn(() => ({})),
}));

vi.mock('../../db/schema', () => ({
  getAllSettings: vi.fn(() => ({})),
}));

// Mock AI SDK — top-level mock for both static and dynamic imports
vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({ text: '1' }),
  generateObject: vi.fn(),
  streamText: vi.fn(),
}));

// Mock AI SDK provider factories — use vi.fn() so they are proper spies
const mockOpenAIFactory = vi.fn((model: string) => ({ modelId: model, provider: 'openai' }));
const mockAnthropicFactory = vi.fn((model: string) => ({ modelId: model, provider: 'anthropic' }));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => mockOpenAIFactory),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => mockAnthropicFactory),
}));

const mockOllamaFactory = vi.fn((model: string) => ({ modelId: model, provider: 'ollama' }));
vi.mock('ollama-ai-provider', () => ({
  createOllama: vi.fn(() => mockOllamaFactory),
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('PROVIDER_REGISTRY', () => {
  it('should have 9 providers', () => {
    expect(Object.keys(PROVIDER_REGISTRY)).toHaveLength(9);
  });

  it('each provider should have name, baseUrl, defaultModel', () => {
    for (const [, provider] of Object.entries(PROVIDER_REGISTRY)) {
      expect(provider.name).toBeTruthy();
      expect(provider.baseUrl).toBeTruthy();
      expect(provider.defaultModel).toBeTruthy();
    }
  });

  it('should include expected providers', () => {
    expect(PROVIDER_REGISTRY).toHaveProperty('deepseek');
    expect(PROVIDER_REGISTRY).toHaveProperty('openai');
    expect(PROVIDER_REGISTRY).toHaveProperty('anthropic');
    expect(PROVIDER_REGISTRY).toHaveProperty('ollama');
    expect(PROVIDER_REGISTRY).toHaveProperty('qwen');
    expect(PROVIDER_REGISTRY).toHaveProperty('glm');
    expect(PROVIDER_REGISTRY).toHaveProperty('mimo');
    expect(PROVIDER_REGISTRY).toHaveProperty('siliconflow');
    expect(PROVIDER_REGISTRY).toHaveProperty('openrouter');
  });

  it('all baseUrls should be valid URLs', () => {
    for (const [, provider] of Object.entries(PROVIDER_REGISTRY)) {
      expect(() => new URL(provider.baseUrl)).not.toThrow();
    }
  });
});

describe('PROVIDER_LIST', () => {
  it('should have same length as PROVIDER_REGISTRY', () => {
    expect(PROVIDER_LIST).toHaveLength(Object.keys(PROVIDER_REGISTRY).length);
  });

  it('each item should have id, name, defaultModel, defaultBaseUrl', () => {
    for (const item of PROVIDER_LIST) {
      expect(item.id).toBeTruthy();
      expect(item.name).toBeTruthy();
      expect(item.defaultModel).toBeTruthy();
      expect(item.defaultBaseUrl).toBeTruthy();
    }
  });

  it('ids should match PROVIDER_REGISTRY keys', () => {
    const ids = PROVIDER_LIST.map((p) => p.id);
    expect(ids).toEqual(Object.keys(PROVIDER_REGISTRY));
  });
});

describe('getProviderConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
    clearSettingsCache();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ---- Legacy per-provider config ----

  it('should use default provider from env', () => {
    process.env.AGENT_LLM_PROVIDER = 'deepseek';
    process.env.DEEPSEEK_API_KEY = 'test-key-123';
    const config = getProviderConfig();
    expect(config.provider).toBe('deepseek');
    expect(config.apiKey).toBe('test-key-123');
  });

  it('should use specified provider', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const config = getProviderConfig('openai');
    expect(config.provider).toBe('openai');
    expect(config.apiKey).toBe('sk-test');
  });

  it('should throw for missing API key', () => {
    delete process.env.MIMO_API_KEY;
    expect(() => getProviderConfig('mimo')).toThrow('Missing or placeholder API key');
  });

  it('should throw for placeholder API key', () => {
    process.env.MIMO_API_KEY = 'your_mimo_api_key';
    expect(() => getProviderConfig('mimo')).toThrow('Missing or placeholder API key');
  });

  it('should use custom base URL from env', () => {
    process.env.DEEPSEEK_API_KEY = 'test-key';
    process.env.DEEPSEEK_BASE_URL = 'https://custom.api.com/v1';
    const config = getProviderConfig('deepseek');
    expect(config.baseUrl).toBe('https://custom.api.com/v1');
  });

  it('should use custom model from env', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.OPENAI_MODEL = 'gpt-4-turbo';
    const config = getProviderConfig('openai');
    expect(config.model).toBe('gpt-4-turbo');
  });

  it('should fallback to default model', () => {
    process.env.DEEPSEEK_API_KEY = 'test-key';
    delete process.env.DEEPSEEK_MODEL;
    const config = getProviderConfig('deepseek');
    expect(config.model).toBe(PROVIDER_REGISTRY.deepseek.defaultModel);
  });

  it('should fallback to default base URL', () => {
    process.env.DEEPSEEK_API_KEY = 'test-key';
    delete process.env.DEEPSEEK_BASE_URL;
    const config = getProviderConfig('deepseek');
    expect(config.baseUrl).toBe(PROVIDER_REGISTRY.deepseek.baseUrl);
  });

  it('should default to deepseek provider when no AGENT_LLM_PROVIDER set', () => {
    delete process.env.AGENT_LLM_PROVIDER;
    process.env.DEEPSEEK_API_KEY = 'deepseek-key';
    const config = getProviderConfig();
    expect(config.provider).toBe('deepseek');
  });

  // ---- Unified config (LLM_API_KEY) ----

  it('should use unified LLM_API_KEY when set', () => {
    process.env.LLM_API_KEY = 'unified-key';
    const config = getProviderConfig();
    expect(config.apiKey).toBe('unified-key');
    expect(config.provider).toBe('openai'); // default for unified
  });

  it('should detect deepseek provider from unified URL', () => {
    process.env.LLM_API_KEY = 'key';
    process.env.LLM_BASE_URL = 'https://api.deepseek.com/v1';
    const config = getProviderConfig();
    expect(config.provider).toBe('deepseek');
  });

  it('should detect anthropic provider from claude- model prefix', () => {
    process.env.LLM_API_KEY = 'key';
    process.env.LLM_MODEL = 'claude-sonnet-4-20250514';
    const config = getProviderConfig();
    expect(config.provider).toBe('anthropic');
  });

  it('should detect qwen provider from unified URL', () => {
    process.env.LLM_API_KEY = 'key';
    process.env.LLM_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    const config = getProviderConfig();
    expect(config.provider).toBe('qwen');
  });

  it('should detect openrouter provider from unified URL', () => {
    process.env.LLM_API_KEY = 'key';
    process.env.LLM_BASE_URL = 'https://openrouter.ai/api/v1';
    const config = getProviderConfig();
    expect(config.provider).toBe('openrouter');
  });

  it('should detect siliconflow provider from unified URL', () => {
    process.env.LLM_API_KEY = 'key';
    process.env.LLM_BASE_URL = 'https://api.siliconflow.cn/v1';
    const config = getProviderConfig();
    expect(config.provider).toBe('siliconflow');
  });

  it('should fallback to openai for unknown provider URL', () => {
    process.env.LLM_API_KEY = 'key';
    process.env.LLM_BASE_URL = 'https://api.unknown-provider.com/v1';
    const config = getProviderConfig();
    expect(config.provider).toBe('openai');
  });

  it('should detect glm provider from unified URL', () => {
    process.env.LLM_API_KEY = 'key';
    process.env.LLM_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';
    const config = getProviderConfig();
    expect(config.provider).toBe('glm');
  });

  it('should throw for placeholder unified API key', () => {
    process.env.LLM_API_KEY = 'your_openai_key';
    expect(() => getProviderConfig()).toThrow('占位符');
  });

  // W-11 fix: URL match should take priority over model prefix
  it('should detect openrouter provider from URL even with claude- model prefix', () => {
    process.env.LLM_API_KEY = 'key';
    process.env.LLM_BASE_URL = 'https://openrouter.ai/api/v1';
    process.env.LLM_MODEL = 'anthropic/claude-sonnet-4';
    const config = getProviderConfig();
    expect(config.provider).toBe('openrouter');
  });

  it('should detect anthropic from claude- model prefix only when URL is generic', () => {
    process.env.LLM_API_KEY = 'key';
    process.env.LLM_BASE_URL = 'https://custom-proxy.example.com/v1';
    process.env.LLM_MODEL = 'claude-sonnet-4-20250514';
    const config = getProviderConfig();
    expect(config.provider).toBe('anthropic');
  });

  it('should use unified LLM_BASE_URL and LLM_MODEL', () => {
    process.env.LLM_API_KEY = 'key';
    process.env.LLM_BASE_URL = 'https://custom.api.com/v1';
    process.env.LLM_MODEL = 'custom-model';
    const config = getProviderConfig();
    expect(config.baseUrl).toBe('https://custom.api.com/v1');
    expect(config.model).toBe('custom-model');
  });

  it('should prefer unified config over legacy when LLM_API_KEY is set', () => {
    process.env.LLM_API_KEY = 'unified-key';
    process.env.DEEPSEEK_API_KEY = 'legacy-key';
    process.env.AGENT_LLM_PROVIDER = 'deepseek';
    const config = getProviderConfig();
    expect(config.apiKey).toBe('unified-key');
  });

  // ---- DB settings override ----

  it('should prefer DB settings over env for unified config', async () => {
    const { getAllSettings } = await import('../../db/schema');
    vi.mocked(getAllSettings).mockReturnValue({
      LLM_API_KEY: 'db-unified-key',
      LLM_BASE_URL: 'https://api.deepseek.com/v1',
      LLM_MODEL: 'deepseek-chat',
    });

    process.env.LLM_API_KEY = 'env-key';
    const config = getProviderConfig();
    expect(config.apiKey).toBe('db-unified-key');
  });

  it('should prefer DB settings over env for legacy config', async () => {
    const { getAllSettings } = await import('../../db/schema');
    vi.mocked(getAllSettings).mockReturnValue({
      AGENT_LLM_PROVIDER: 'openai',
      OPENAI_API_KEY: 'db-openai-key',
    });

    delete process.env.LLM_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.AGENT_LLM_PROVIDER = 'deepseek';
    const config = getProviderConfig();
    expect(config.provider).toBe('openai');
    expect(config.apiKey).toBe('db-openai-key');
  });

  it('should fallback gracefully when DB throws', async () => {
    const { getAllSettings } = await import('../../db/schema');
    vi.mocked(getAllSettings).mockImplementation(() => {
      throw new Error('DB not initialized');
    });

    process.env.DEEPSEEK_API_KEY = 'env-key';
    const config = getProviderConfig('deepseek');
    expect(config.apiKey).toBe('env-key');
  });
});

describe('isProviderConfigured', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return true for configured provider', () => {
    process.env.DEEPSEEK_API_KEY = 'test-key';
    expect(isProviderConfigured('deepseek')).toBe(true);
  });

  it('should return false for unconfigured provider', () => {
    delete process.env.MIMO_API_KEY;
    expect(isProviderConfigured('mimo')).toBe(false);
  });

  it('should return false for placeholder key', () => {
    process.env.MIMO_API_KEY = 'your_mimo_api_key';
    expect(isProviderConfigured('mimo')).toBe(false);
  });

  it('should return true when unified LLM_API_KEY is set', () => {
    process.env.LLM_API_KEY = 'unified-key';
    // Clear per-provider keys so only unified works
    delete process.env.DEEPSEEK_API_KEY;
    expect(isProviderConfigured('deepseek')).toBe(true);
  });

  it('should return false on exception', () => {
    delete process.env.MIMO_API_KEY;
    delete process.env.LLM_API_KEY;
    expect(isProviderConfigured('mimo')).toBe(false);
  });
});

describe('getConfiguredProviders', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return empty array when no providers configured', () => {
    for (const key of Object.keys(PROVIDER_REGISTRY)) {
      delete process.env[`${key.toUpperCase()}_API_KEY`];
    }
    delete process.env.LLM_API_KEY;
    expect(getConfiguredProviders()).toEqual([]);
  });

  it('should return configured providers', () => {
    process.env.DEEPSEEK_API_KEY = 'test-key';
    process.env.OPENAI_API_KEY = 'sk-test';
    const providers = getConfiguredProviders();
    expect(providers).toContain('deepseek');
    expect(providers).toContain('openai');
  });

  it('should include all providers when unified key is set', () => {
    process.env.LLM_API_KEY = 'unified-key';
    // Clear all per-provider keys so only unified works
    for (const key of Object.keys(PROVIDER_REGISTRY)) {
      delete process.env[`${key.toUpperCase()}_API_KEY`];
    }
    const providers = getConfiguredProviders();
    // All providers should be configured since unified config applies to all
    expect(providers).toHaveLength(Object.keys(PROVIDER_REGISTRY).length);
  });
});

describe('createLLMModel', () => {
  let createOpenAISpy: ReturnType<typeof vi.fn>;
  let createAnthropicSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockOpenAIFactory.mockClear();
    mockAnthropicFactory.mockClear();
    // Get the mocked factory functions (the spies from vi.mock)
    const openaiModule = await import('@ai-sdk/openai');
    const anthropicModule = await import('@ai-sdk/anthropic');
    createOpenAISpy = vi.mocked(openaiModule.createOpenAI);
    createAnthropicSpy = vi.mocked(anthropicModule.createAnthropic);
  });

  it('should create OpenAI-compatible model for non-anthropic provider', () => {
    const model = createLLMModel({ provider: 'deepseek', apiKey: 'key', model: 'deepseek-chat' });
    expect(createOpenAISpy).toHaveBeenCalledWith({ apiKey: 'key', baseURL: undefined });
    expect(model).toEqual({ modelId: 'deepseek-chat', provider: 'openai' });
  });

  it('should create Anthropic model for anthropic provider', () => {
    const model = createLLMModel({ provider: 'anthropic', apiKey: 'sk-ant-key', model: 'claude-sonnet-4-20250514' });
    expect(createAnthropicSpy).toHaveBeenCalledWith({ apiKey: 'sk-ant-key' });
    expect(model).toEqual({ modelId: 'claude-sonnet-4-20250514', provider: 'anthropic' });
  });

  it('should use default model when not specified (OpenAI)', () => {
    createLLMModel({ provider: 'openai', apiKey: 'key' });
    // The factory returned by createOpenAI is called with the model name
    expect(mockOpenAIFactory).toHaveBeenCalledWith('gpt-4o');
  });

  it('should use default model when not specified (Anthropic)', () => {
    createLLMModel({ provider: 'anthropic', apiKey: 'key' });
    expect(mockAnthropicFactory).toHaveBeenCalledWith('claude-sonnet-4-20250514');
  });

  it('should pass baseUrl for OpenAI-compatible providers', () => {
    createLLMModel({ provider: 'deepseek', apiKey: 'key', baseUrl: 'https://custom.api.com/v1' });
    expect(createOpenAISpy).toHaveBeenCalledWith({ apiKey: 'key', baseURL: 'https://custom.api.com/v1' });
  });

  it('should call getProviderConfig when no config provided', () => {
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_MODEL = 'test-model';
    const model = createLLMModel();
    expect(model).toBeDefined();
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_MODEL;
  });

  it('should create Ollama model for ollama provider', () => {
    const model = createLLMModel({ provider: 'ollama', apiKey: '', model: 'qwen2.5:14b' });
    expect(mockOllamaFactory).toHaveBeenCalledWith('qwen2.5:14b');
    expect(model).toEqual({ modelId: 'qwen2.5:14b', provider: 'ollama' });
  });

  it('should use default ollama model when not specified', () => {
    createLLMModel({ provider: 'ollama', apiKey: '' });
    expect(mockOllamaFactory).toHaveBeenCalledWith('llama3.1');
  });

  it('should use default ollama baseUrl when not specified', async () => {
    const { createOllama } = await import('ollama-ai-provider');
    createLLMModel({ provider: 'ollama', apiKey: '' });
    expect(createOllama).toHaveBeenCalledWith({ baseURL: 'http://localhost:11434' });
  });
});

describe('healthCheckProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return ok=true on successful check', async () => {
    const { generateText } = await import('ai');
    vi.mocked(generateText).mockResolvedValue({ text: '1' } as never);

    process.env.DEEPSEEK_API_KEY = 'test-key';
    const result = await healthCheckProvider('deepseek');
    expect(result.ok).toBe(true);
    expect(result.provider).toBe('deepseek');
    expect(result.model).toBe(PROVIDER_REGISTRY.deepseek.defaultModel);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should return ok=false on failure', async () => {
    const { generateText } = await import('ai');
    vi.mocked(generateText).mockRejectedValue(new Error('connection refused'));

    process.env.DEEPSEEK_API_KEY = 'test-key';
    const result = await healthCheckProvider('deepseek');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('connection refused');
  });

  it('should use default provider when none specified', async () => {
    const { generateText } = await import('ai');
    vi.mocked(generateText).mockResolvedValue({ text: '1' } as never);

    process.env.LLM_API_KEY = 'test-key';
    const result = await healthCheckProvider();
    expect(result.ok).toBe(true);
  });

  it('should return error when provider not configured', async () => {
    delete process.env.MIMO_API_KEY;
    delete process.env.LLM_API_KEY;
    const result = await healthCheckProvider('mimo');
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('should include latencyMs in result', async () => {
    const { generateText } = await import('ai');
    vi.mocked(generateText).mockResolvedValue({ text: '1' } as never);

    process.env.DEEPSEEK_API_KEY = 'test-key';
    const result = await healthCheckProvider('deepseek');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.latencyMs).toBe('number');
  });
});

describe('healthCheckAllProviders', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return empty array when no providers configured', async () => {
    for (const key of Object.keys(PROVIDER_REGISTRY)) {
      delete process.env[`${key.toUpperCase()}_API_KEY`];
    }
    delete process.env.LLM_API_KEY;
    const results = await healthCheckAllProviders();
    expect(results).toEqual([]);
  });

  it('should check only configured providers', async () => {
    const { generateText } = await import('ai');
    vi.mocked(generateText).mockResolvedValue({ text: '1' } as never);

    process.env.DEEPSEEK_API_KEY = 'test-key';
    process.env.OPENAI_API_KEY = 'sk-test';
    const results = await healthCheckAllProviders();
    expect(results.length).toBe(2);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it('should report failed providers in results', async () => {
    const { generateText } = await import('ai');
    vi.mocked(generateText).mockRejectedValue(new Error('timeout'));

    process.env.DEEPSEEK_API_KEY = 'test-key';
    const results = await healthCheckAllProviders();
    expect(results.length).toBe(1);
    expect(results[0].ok).toBe(false);
    expect(results[0].error).toContain('timeout');
  });

  it('should skip unconfigured providers', async () => {
    const { generateText } = await import('ai');
    vi.mocked(generateText).mockResolvedValue({ text: '1' } as never);

    process.env.DEEPSEEK_API_KEY = 'test-key';
    // All others are unconfigured
    for (const key of Object.keys(PROVIDER_REGISTRY)) {
      if (key !== 'deepseek') {
        delete process.env[`${key.toUpperCase()}_API_KEY`];
      }
    }
    delete process.env.LLM_API_KEY;
    const results = await healthCheckAllProviders();
    expect(results.length).toBe(1);
    expect(results[0].provider).toBe('deepseek');
  });
});

// =========================================================================
// DB settings masked API key resolution
// =========================================================================

describe('DB settings masked key resolution', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
    clearSettingsCache();
  });

  afterEach(() => {
    process.env = originalEnv;
    clearSettingsCache();
  });

  it('should resolve masked API key from cache when available', async () => {
    const { getAllSettings } = await import('../../db/schema');
    vi.mocked(getAllSettings).mockReturnValue({
      DEEPSEEK_API_KEY: '••••••••',
      LLM_MODEL: 'deepseek-chat',
    });

    // Set the resolved key in cache
    updateResolvedApiKey('DEEPSEEK_API_KEY', 'real-secret-key');

    const config = getProviderConfig();
    expect(config.apiKey).toBe('real-secret-key');
  });

  it('should keep masked value when no cached resolution exists', async () => {
    const { getAllSettings } = await import('../../db/schema');
    vi.mocked(getAllSettings).mockReturnValue({
      AGENT_LLM_PROVIDER: 'openai',
      OPENAI_API_KEY: '••••••••',
      OPENAI_MODEL: 'gpt-4o',
    });

    const config = getProviderConfig();
    // The masked value should be kept as-is (not resolved)
    expect(config.apiKey).toBe('••••••••');
    expect(config.provider).toBe('openai');
  });

  it('should pass through non-masked settings normally', async () => {
    const { getAllSettings } = await import('../../db/schema');
    vi.mocked(getAllSettings).mockReturnValue({
      DEEPSEEK_API_KEY: 'actual-key-value',
      LLM_MODEL: 'deepseek-chat',
    });

    const config = getProviderConfig();
    expect(config.apiKey).toBe('actual-key-value');
  });

  it('should fallback to env when DB read fails', async () => {
    const { getDatabase } = await import('../../db/connection');
    vi.mocked(getDatabase).mockImplementation(() => {
      throw new Error('DB not initialized');
    });

    process.env.DEEPSEEK_API_KEY = 'env-fallback-key';
    const config = getProviderConfig();
    expect(config.apiKey).toBe('env-fallback-key');
  });
});
