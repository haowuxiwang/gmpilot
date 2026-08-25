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
import { getModelDirPath, isPackaged } from '../utils/paths';
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

    // 空输入直接返回（避免无意义 API 调用）；空白文本归一化为单个空格（部分 provider 拒绝空串）
    if (texts.length === 0) return [];
    const normalized = texts.map((t) => (t && t.trim() ? t : ' '));

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
          values: normalized,
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

    // 空输入直接返回（避免无意义 API 调用）
    if (texts.length === 0) return [];

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
        // 本地模型目录显式指定（打包版为 resources/model，dev 为 ./model），
        // 并禁止远程下载（GMP 离线环境依赖本地模型，避免 fetch failed）
        transformers.env.localModelPath = this.modelPath;
        transformers.env.allowRemoteModels = false;
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

    // transformers.js v4: pipeline 返回可调用函数（直接调用，与 embed-worker.cjs 一致）
    const pipeline = this.pipeline as { (texts: string[], options: Record<string, unknown>): Promise<{ dims: number[]; data: Float32Array }> };
    const output = await pipeline(texts, { pooling: 'mean', normalize: true });

    const dims = output.dims;
    const data = output.data;
    const results: number[][] = [];
    for (let i = 0; i < dims[0]; i++) {
      results.push(Array.prototype.slice.call(data, i * dims[1], (i + 1) * dims[1]) as number[]);
    }

    log.debug('Embeddings generated', { provider: this.name, texts: texts.length, duration: `${Date.now() - start}ms` });
    return results;
  }
}

// ============================================================================
// Worker-backed Local Provider
// onnxruntime-node 的 run() 在调用线程上同步执行，主进程直接跑会阻塞 event loop
// （启动/CDP/IPC 全部卡死）。embed-worker.cjs 将模型加载与推理移到 worker 线程。
// ============================================================================

import { Worker } from 'worker_threads';

interface PendingEmbed {
  resolve: (vectors: number[][]) => void;
  reject: (err: Error) => void;
}

class WorkerEmbeddingProvider implements EmbeddingProvider {
  name = 'local';
  dimensions = 1024;

  private worker: Worker | null = null;
  private pending = new Map<number, PendingEmbed>();
  private idSeq = 0;
  private workerError: Error | null = null;

  constructor(
    private modelPath: string,
    private modelName: string,
    private workerPath: string,
  ) {}

  isAvailable(): boolean {
    try {
      const modelDir = path.join(this.modelPath, this.modelName);
      return fs.existsSync(modelDir) && fs.existsSync(this.workerPath);
    } catch {
      return false;
    }
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;

    const worker = new Worker(this.workerPath, {
      workerData: { modelPath: this.modelPath, modelName: this.modelName },
    });

    worker.on('message', (msg: { type: string; id: number; vectors?: number[][]; error?: string }) => {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      if (msg.type === 'result') {
        pending.resolve(msg.vectors || []);
      } else {
        pending.reject(new Error(msg.error || 'embedding worker error'));
      }
    });

    worker.on('error', (err) => {
      this.workerError = err;
      for (const [, pending] of this.pending) {
        pending.reject(err);
      }
      this.pending.clear();
      this.worker?.terminate().catch(() => {});
      this.worker = null;
    });

    worker.on('exit', () => {
      this.worker = null;
    });

    this.worker = worker;
    return worker;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (this.workerError) throw this.workerError;

    const worker = this.ensureWorker();
    const id = ++this.idSeq;

    return new Promise<number[][]>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ type: 'embed', id, texts });
    });
  }
}

/**
 * Resolve the embedding worker script path.
 * 打包版（asar:false）：resources/app/dist-electron/main/embed-worker.cjs（copy-worker 复制）
 * dev：项目根 electron/embed-worker.cjs
 */
function getWorkerPath(): string {
  if (isPackaged()) {
    return path.join(process.resourcesPath, 'app', 'dist-electron', 'main', 'embed-worker.cjs');
  }
  return path.join(process.cwd(), 'electron', 'embed-worker.cjs');
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
  // 打包感知的模型目录（打包版 → resources/model 或 exe 旁 model/；dev → ./model）
  const defaultModelPath = getModelDirPath();
  const modelPath = dbSettings['EMBEDDING_MODEL_PATH'] || process.env.EMBEDDING_MODEL_PATH || defaultModelPath;
  const modelName = dbSettings['EMBEDDING_MODEL'] || process.env.EMBEDDING_MODEL || 'BAAI/bge-large-zh-v1.5';
  // 优先 worker 线程（不阻塞主进程 event loop）；worker 文件缺失时回退主线程直跑
  const workerProvider = new WorkerEmbeddingProvider(modelPath, modelName, getWorkerPath());

  if (workerProvider.isAvailable()) {
    log.info('Embedding provider: local (worker)', { model: modelName, path: modelPath });
    return workerProvider;
  }

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
