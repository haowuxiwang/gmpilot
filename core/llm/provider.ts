/**
 * LLM Provider configuration.
 * Uses Vercel AI SDK unified provider abstraction.
 * Supports both local (Ollama) and cloud providers.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOllama } from 'ollama-ai-provider';
import { createLogger } from '../utils/logger';
import { getDatabase } from '../db/connection';
import { getAllSettings } from '../db/schema';

const log = createLogger('LLM');

/**
 * SSRF 防护：校验用户可配置的 baseUrl。
 * 仅允许 https（云端）与 http://localhost/127.0.0.1（本地推理），
 * 拒绝指向内网 IP / 元数据端点 / 其他协议的 URL。
 */
export function validateBaseUrl(baseUrl: string | undefined, isLocalProvider = false): void {
  if (!baseUrl) return;

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(`LLM Base URL 格式无效: ${baseUrl}`);
  }

  // 协议白名单
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`LLM Base URL 仅支持 http/https 协议: ${baseUrl}`);
  }

  const hostname = parsed.hostname.toLowerCase();
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '0.0.0.0';

  // 本地 provider（如 Ollama）允许 localhost
  if (isLocalhost && isLocalProvider) return;
  if (isLocalhost && !isLocalProvider) {
    log.warn('Non-local provider using localhost URL — allowed but unusual', { baseUrl });
    return;
  }

  // 云端必须 https
  if (parsed.protocol !== 'https:') {
    throw new Error(`云端 LLM Base URL 必须使用 https: ${baseUrl}`);
  }

  // 拒绝内网/链路本地/元数据地址（防 SSRF 探测内网）
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/.test(hostname) || hostname === 'metadata.google.internal' || hostname.endsWith('.internal') || hostname.endsWith('.local')) {
    throw new Error(`LLM Base URL 不允许指向内网地址: ${baseUrl}`);
  }
}

// Provider registry — no ordering preference, user chooses
export const PROVIDER_REGISTRY: Record<string, { name: string; baseUrl: string; defaultModel: string; isLocal?: boolean }> = {
  deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat' },
  glm: { name: '智谱清言 (GLM)', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-4-plus' },
  mimo: { name: 'Mimo', baseUrl: 'https://api.mimo.ai/v1', defaultModel: 'mimo-7b' },
  siliconflow: { name: 'SiliconFlow (硅基流动)', baseUrl: 'https://api.siliconflow.cn/v1', defaultModel: 'deepseek-ai/DeepSeek-V3.2' },
  openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o' },
  qwen: { name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen-plus' },
  anthropic: { name: 'Anthropic', baseUrl: 'https://api.anthropic.com', defaultModel: 'claude-sonnet-4-20250514' },
  openrouter: { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'deepseek/deepseek-chat' },
  ollama: { name: 'Ollama (本地)', baseUrl: 'http://localhost:11434', defaultModel: 'qwen2.5:14b', isLocal: true },
};

// Provider list for frontend UI (single source of truth)
export const PROVIDER_LIST = Object.entries(PROVIDER_REGISTRY).map(([id, config]) => ({
  id,
  name: config.name,
  defaultModel: config.defaultModel,
  defaultBaseUrl: config.baseUrl,
}));

export interface ProviderConfig {
  provider: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

/**
 * Read settings from database (if available).
 * Returns empty object if database is not initialized.
 * Includes 30-second cache to avoid repeated DB queries.
 */
let settingsCache: Record<string, string> | null = null;
let settingsCacheTime = 0;
const SETTINGS_CACHE_TTL = 30_000; // 30 seconds

// In-memory cache for resolved API keys (secure storage -> plain text)
const resolvedApiKeys = new Map<string, string>();

function getDbSettings(): Record<string, string> {
  const now = Date.now();
  if (settingsCache && now - settingsCacheTime < SETTINGS_CACHE_TTL) {
    return settingsCache;
  }

  try {
    const db = getDatabase();
    const raw = getAllSettings(db);

    // Resolve masked API keys from secure storage cache
    const resolved: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (key.endsWith('_API_KEY') && value === '••••••••') {
        // Try to get resolved value from cache
        const cached = resolvedApiKeys.get(key);
        if (cached) {
          resolved[key] = cached;
        } else {
          resolved[key] = value; // Keep masked
        }
      } else {
        resolved[key] = value;
      }
    }

    settingsCache = resolved;
    settingsCacheTime = now;
    return settingsCache;
  } catch (error) {
    log.warn('Failed to read DB settings, using env fallback', { error: String(error) });
    return {};
  }
}

/**
 * Clear settings cache (call when settings are saved).
 */
export function clearSettingsCache(): void {
  settingsCache = null;
  settingsCacheTime = 0;
}

/**
 * Update resolved API key cache (call after retrieving from secure storage).
 */
export function updateResolvedApiKey(key: string, value: string): void {
  resolvedApiKeys.set(key, value);
  clearSettingsCache(); // Invalidate cache
}

/**
 * Get provider config from database settings, falling back to environment variables.
 * Database settings take priority (set via Settings UI).
 *
 * Supports two config styles:
 * 1. Unified: LLM_BASE_URL, LLM_MODEL, LLM_API_KEY (preferred)
 * 2. Legacy: {PROVIDER}_BASE_URL, {PROVIDER}_MODEL, {PROVIDER}_API_KEY
 */
export function getProviderConfig(provider?: string): ProviderConfig {
  const dbSettings = getDbSettings();

  // Try unified config first
  const unifiedApiKey = dbSettings['LLM_API_KEY'] || process.env.LLM_API_KEY;
  const unifiedBaseUrl = dbSettings['LLM_BASE_URL'] || process.env.LLM_BASE_URL;
  const unifiedModel = dbSettings['LLM_MODEL'] || process.env.LLM_MODEL;

  if (unifiedApiKey) {
    // Reject placeholder API keys
    if (unifiedApiKey.startsWith('your_')) {
      log.error('Placeholder API key detected', { key: 'LLM_API_KEY' });
      throw new Error('API Key 是占位符，请在设置中填写真实的 API Key');
    }

    // Determine provider type from URL — match known provider hostnames
    let providerName = 'openai'; // default to OpenAI-compatible
    if (unifiedBaseUrl) {
      for (const [name, reg] of Object.entries(PROVIDER_REGISTRY)) {
        try {
          const hostname = new URL(reg.baseUrl).hostname;
          if (unifiedBaseUrl.includes(hostname)) {
            providerName = name;
            break;
          }
        } catch {
          // Skip malformed registry URL
        }
      }
    }
    // Anthropic uses a separate SDK — override if detected by model prefix
    // Only when URL didn't match a specific provider (to avoid overriding OpenRouter etc.)
    if (providerName === 'openai' && unifiedModel?.startsWith('claude-')) {
      providerName = 'anthropic';
    }

    // SSRF 防护：校验用户可配置的 baseUrl
    validateBaseUrl(unifiedBaseUrl, providerName === 'ollama');

    const config: ProviderConfig = {
      provider: providerName,
      apiKey: unifiedApiKey,
      baseUrl: unifiedBaseUrl,
      model: unifiedModel,
    };

    // Mask API key in logs (only show first 5 chars for security)
    const maskedKey = unifiedApiKey ? `${unifiedApiKey.substring(0, 5)}***` : 'not set';
    log.info('Provider configured (unified)', { provider: providerName, model: config.model, baseUrl: config.baseUrl, apiKey: maskedKey });
    return config;
  }

  // Fallback to legacy per-provider config
  const name = provider || dbSettings['AGENT_LLM_PROVIDER'] || process.env.AGENT_LLM_PROVIDER || 'deepseek';
  const upper = name.toUpperCase();

  const apiKey = dbSettings[`${upper}_API_KEY`] || process.env[`${upper}_API_KEY`] || '';
  const baseUrl = dbSettings[`${upper}_BASE_URL`] || process.env[`${upper}_BASE_URL`];
  const model = dbSettings[`${upper}_MODEL`] || process.env[`${upper}_MODEL`];

  if (!apiKey || apiKey.startsWith('your_')) {
    log.error('Invalid API key', { provider: name, key: `${upper}_API_KEY` });
    throw new Error(`Missing or placeholder API key for ${name}. Set ${upper}_API_KEY in Settings or config/.env`);
  }

  const config: ProviderConfig = {
    provider: name,
    apiKey,
    baseUrl: baseUrl || PROVIDER_REGISTRY[name]?.baseUrl,
    model: model || PROVIDER_REGISTRY[name]?.defaultModel,
  };

  // SSRF 防护：校验用户可配置的 baseUrl
  validateBaseUrl(config.baseUrl, !!PROVIDER_REGISTRY[name]?.isLocal);

  log.info('Provider configured (legacy)', { provider: name, model: config.model, baseUrl: config.baseUrl });
  return config;
}

/**
 * Create Vercel AI SDK model instance.
 */
export function createLLMModel(config?: ProviderConfig) {
  const cfg = config || getProviderConfig();

  // Ollama (local)
  if (cfg.provider === 'ollama') {
    const ollama = createOllama({
      baseURL: cfg.baseUrl || 'http://localhost:11434',
    });
    return ollama(cfg.model || 'llama3.1');
  }

  // Anthropic (uses separate SDK)
  if (cfg.provider === 'anthropic') {
    const anthropic = createAnthropic({ apiKey: cfg.apiKey });
    return anthropic(cfg.model || 'claude-sonnet-4-20250514');
  }

  // All other providers use OpenAI-compatible API
  const openai = createOpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl,
  });
  return openai(cfg.model || 'gpt-4o');
}

/**
 * Check if a provider is configured (has valid API key).
 */
export function isProviderConfigured(provider: string): boolean {
  try {
    const config = getProviderConfig(provider);
    return !!config.apiKey && !config.apiKey.startsWith('your_');
  } catch {
    return false;
  }
}

/**
 * List all configured providers.
 */
export function getConfiguredProviders(): string[] {
  return Object.keys(PROVIDER_REGISTRY).filter(isProviderConfigured);
}

/**
 * Health check result interface.
 */
export interface HealthCheckResult {
  ok: boolean;
  provider: string;
  model: string;
  latencyMs: number;
  error?: string;
}

/**
 * Perform a lightweight health check on a provider.
 * Sends a minimal request to verify API key and connectivity.
 */
export async function healthCheckProvider(provider?: string): Promise<HealthCheckResult> {
  const start = Date.now();

  try {
    const config = getProviderConfig(provider);
    const model = createLLMModel(config);

    // Use a minimal prompt to test connectivity
    const { generateText } = await import('ai');
    await generateText({
      model,
      prompt: 'ping',
      maxTokens: 1,
    });

    const latencyMs = Date.now() - start;
    log.info('Health check passed', { provider: config.provider, model: config.model, latencyMs });

    return {
      ok: true,
      provider: config.provider,
      model: config.model || 'unknown',
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - start;
    const errorMessage = error instanceof Error ? error.message : String(error);

    log.warn('Health check failed', {
      provider: provider || 'default',
      latencyMs,
      error: errorMessage,
    });

    return {
      ok: false,
      provider: provider || 'default',
      model: 'unknown',
      latencyMs,
      error: errorMessage,
    };
  }
}

/**
 * Health check all configured providers (parallel execution).
 */
export async function healthCheckAllProviders(): Promise<HealthCheckResult[]> {
  const providers = Object.keys(PROVIDER_REGISTRY);
  const configuredProviders = providers.filter(isProviderConfigured);

  // Run health checks in parallel
  const promises = configuredProviders.map(provider => healthCheckProvider(provider));
  const results = await Promise.allSettled(promises);

  // Extract results, filtering out any unexpected failures
  return results
    .filter((result): result is PromiseFulfilledResult<HealthCheckResult> => result.status === 'fulfilled')
    .map(result => result.value);
}
