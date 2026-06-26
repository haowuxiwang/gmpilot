/**
 * Embedding generation for RAG.
 * Supports local (BAAI/bge-large-zh-v1.5) and cloud (OpenAI) providers.
 *
 * Local provider uses @huggingface/transformers for browser/Node.js.
 * Cloud provider uses Vercel AI SDK's embed() function.
 */

import { embedMany } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createLogger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

const log = createLogger('RAG');

// ============================================================================
// Types
// ============================================================================

export interface EmbeddingProvider {
  name: string;
  dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
  isAvailable(): boolean;
}

// ============================================================================
// OpenAI Cloud Provider
// ============================================================================

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  name = 'openai';
  dimensions = 1536;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private model: any = null;

  constructor(
    private apiKey: string,
    private baseUrl?: string,
    private modelName = 'text-embedding-3-small',
  ) {}

  isAvailable(): boolean {
    return !!this.apiKey && !this.apiKey.startsWith('your_');
  }

  async embed(texts: string[]): Promise<number[][]> {
    const start = Date.now();
    const maxRetries = 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (!this.model) {
          const openai = createOpenAI({
            apiKey: this.apiKey,
            baseURL: this.baseUrl,
          });
          this.model = openai.textEmbeddingModel(this.modelName);
        }

        const result = await embedMany({
          model: this.model,
          values: texts,
        });

        log.debug('Embeddings generated', { provider: this.name, texts: texts.length, duration: `${Date.now() - start}ms` });
        return result.embeddings;
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        // Retry on timeout or network errors
        if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('fetch') || error.message.includes('network'))) {
          log.warn('OpenAI embedding retry', { attempt: attempt + 1, error: error.message });
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }
        throw error;
      }
    }

    throw new Error('OpenAI embedding failed after retries');
  }
}

// ============================================================================
// SiliconFlow Provider (direct API call)
// ============================================================================

class SiliconFlowEmbeddingProvider implements EmbeddingProvider {
  name = 'siliconflow';
  dimensions = 1024; // bge-large-zh-v1.5 outputs 1024 dimensions

  constructor(
    private apiKey: string,
    private baseUrl = 'https://api.siliconflow.cn/v1',
    private modelName = 'BAAI/bge-large-zh-v1.5',
  ) {}

  isAvailable(): boolean {
    return !!this.apiKey && !this.apiKey.startsWith('your_');
  }

  async embed(texts: string[]): Promise<number[][]> {
    const start = Date.now();
    const maxRetries = 2;
    const timeoutMs = 30_000; // 30 seconds

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(`${this.baseUrl}/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.modelName,
            input: texts,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`SiliconFlow embedding failed: ${response.status} ${error}`);
        }

        const data = await response.json();
        const embeddings = data.data.map((item: { embedding: number[] }) => item.embedding);

        log.debug('Embeddings generated', { provider: this.name, texts: texts.length, duration: `${Date.now() - start}ms` });
        return embeddings;
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        // Retry on timeout or network errors
        if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('fetch'))) {
          log.warn('Embedding retry', { attempt: attempt + 1, error: error.message });
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }
        throw error;
      }
    }

    throw new Error('SiliconFlow embedding failed after retries');
  }
}

// ============================================================================
// Local Provider (BAAI/bge-large-zh-v1.5)
// ============================================================================

class LocalEmbeddingProvider implements EmbeddingProvider {
  name = 'local';
  dimensions = 1024;

  private pipeline: unknown = null;
  private loading = false;
  private loadPromise: Promise<void> | null = null;

  constructor(
    private modelPath = './model',
    private modelName = 'BAAI/bge-large-zh-v1.5',
  ) {}

  isAvailable(): boolean {
    try {
      const modelDir = path.join(this.modelPath, this.modelName);
      return fs.existsSync(modelDir);
    } catch {
      return false;
    }
  }

  private async loadModel(): Promise<void> {
    if (this.pipeline) return;
    if (this.loading) return this.loadPromise!;

    this.loading = true;
    this.loadPromise = (async () => {
      try {
        // Dynamic import for @huggingface/transformers
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const transformers = await (Function('return import("@huggingface/transformers")')() as Promise<any>);
        this.pipeline = await transformers.pipeline('feature-extraction', this.modelName, {
          device: 'cpu',
        });
      } catch (error) {
        log.error('Failed to load local model', { error: String(error) });
        throw new Error(
          `Local embedding model not available. Set EMBEDDING_PROVIDER=cloud or download the model to ${this.modelPath}. Error: ${error}`,
        );
      } finally {
        this.loading = false;
      }
    })();

    return this.loadPromise;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const start = Date.now();
    await this.loadModel();

    // Batch processing: pass all texts at once
    const pipeline = this.pipeline as { call: (texts: string | string[]) => Promise<{ data: Float32Array | Float32Array[] }> };
    const output = await pipeline.call(texts);

    // Handle batch output
    const results: number[][] = [];
    if (Array.isArray(output.data)) {
      // Batch result: array of Float32Array
      for (const embedding of output.data) {
        results.push(Array.from(embedding.slice(0, this.dimensions)));
      }
    } else {
      // Single result: Float32Array (shouldn't happen with batch, but handle gracefully)
      results.push(Array.from(output.data.slice(0, this.dimensions)));
    }

    log.debug('Embeddings generated', { provider: this.name, texts: texts.length, duration: `${Date.now() - start}ms` });
    return results;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Get settings from database (if available).
 * Uses synchronous require for compatibility with module factory.
 */
function getDbSettings(): Record<string, string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getDatabase } = require('../db/connection');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getAllSettings } = require('../db/schema');
    const db = getDatabase();
    return getAllSettings(db);
  } catch {
    return {};
  }
}

/**
 * Create embedding provider based on configuration.
 * Priority: database settings > environment variables > defaults
 */
export function createEmbeddingProvider(): EmbeddingProvider {
  const dbSettings = getDbSettings();

  const provider = dbSettings['EMBEDDING_PROVIDER'] || process.env.EMBEDDING_PROVIDER || 'local';

  if (provider === 'openai' || provider === 'voyage') {
    const apiKey = dbSettings['OPENAI_API_KEY'] || dbSettings['LLM_API_KEY'] || process.env.OPENAI_API_KEY || process.env.LLM_API_KEY || '';
    const baseUrl = dbSettings['OPENAI_BASE_URL'] || dbSettings['LLM_BASE_URL'] || process.env.OPENAI_BASE_URL || process.env.LLM_BASE_URL || '';
    const modelName = dbSettings['EMBEDDING_MODEL'] || process.env.EMBEDDING_MODEL || 'text-embedding-3-small';

    // Use SiliconFlow provider for SiliconFlow API
    if (baseUrl.includes('siliconflow')) {
      log.info('Embedding provider: siliconflow', { baseUrl, model: modelName });
      return new SiliconFlowEmbeddingProvider(apiKey, baseUrl, modelName);
    }

    log.info('Embedding provider: openai', { baseUrl: baseUrl || 'default', model: modelName });
    return new OpenAIEmbeddingProvider(apiKey, baseUrl, modelName);
  }

  // Default: local provider with fallback to cloud
  const modelPath = dbSettings['EMBEDDING_MODEL_PATH'] || process.env.EMBEDDING_MODEL_PATH || './model';
  const modelName = dbSettings['EMBEDDING_MODEL'] || process.env.EMBEDDING_MODEL || 'BAAI/bge-large-zh-v1.5';
  const localProvider = new LocalEmbeddingProvider(modelPath, modelName);

  if (localProvider.isAvailable()) {
    log.info('Embedding provider: local', { model: modelName, path: modelPath });
    return localProvider;
  }

  // Auto-fallback: try cloud provider if local model not available
  const fallbackApiKey = dbSettings['OPENAI_API_KEY'] || dbSettings['LLM_API_KEY'] || process.env.OPENAI_API_KEY || process.env.LLM_API_KEY || '';
  const fallbackBaseUrl = dbSettings['OPENAI_BASE_URL'] || dbSettings['LLM_BASE_URL'] || process.env.OPENAI_BASE_URL || process.env.LLM_BASE_URL || '';
  const fallbackModel = dbSettings['EMBEDDING_MODEL'] || process.env.EMBEDDING_MODEL || 'BAAI/bge-large-zh-v1.5';
  if (fallbackApiKey) {
    // Use SiliconFlow provider for SiliconFlow API
    if (fallbackBaseUrl.includes('siliconflow')) {
      log.warn('Local embedding model not found, falling back to SiliconFlow', { baseUrl: fallbackBaseUrl, model: fallbackModel });
      return new SiliconFlowEmbeddingProvider(fallbackApiKey, fallbackBaseUrl, fallbackModel);
    }

    log.warn('Local embedding model not found, falling back to cloud provider', { baseUrl: fallbackBaseUrl || 'default', model: fallbackModel });
    return new OpenAIEmbeddingProvider(fallbackApiKey, fallbackBaseUrl, fallbackModel);
  }

  // No fallback available — return local provider (will throw on embed)
  log.warn('Local embedding model not found and no cloud API key available');
  return localProvider;
}

/**
 * Generate embedding for a single text.
 */
export async function embedText(
  text: string,
  provider?: EmbeddingProvider,
): Promise<number[]> {
  const p = provider || createEmbeddingProvider();
  const embeddings = await p.embed([text]);
  return embeddings[0];
}

/**
 * Generate embeddings for multiple texts (batch).
 */
export async function embedTexts(
  texts: string[],
  provider?: EmbeddingProvider,
): Promise<number[][]> {
  const p = provider || createEmbeddingProvider();
  return p.embed(texts);
}
