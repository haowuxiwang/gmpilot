/**
 * RAG retriever — combines chunking, embedding, and vector search.
 * This is the main entry point for RAG operations.
 */

import type Database from 'better-sqlite3';
import { chunkText } from './chunker';
import { createEmbeddingProvider, type EmbeddingProvider } from './embedder';
import { VectorStore } from './store';
import { createLogger } from '../utils/logger';
import { recordMetric } from '../utils/metrics';
import { getKnowledgeDocIdsByCategories } from '../db/schema';

const log = createLogger('RAG');

// ============================================================================
// Query Cache (LRU)
// ============================================================================

interface CacheEntry {
  results: RetrievalResult[];
  timestamp: number;
}

class QueryCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private ttl: number;

  constructor(maxSize = 100, ttlMs = 5 * 60 * 1000) { // 5 minutes default TTL
    this.maxSize = maxSize;
    this.ttl = ttlMs;
  }

  private getKey(query: string, options?: { topK?: number; docId?: number; categories?: string[] }): string {
    const parts = [query];
    if (options?.topK) parts.push(`k${options.topK}`);
    if (options?.docId) parts.push(`d${options.docId}`);
    if (options?.categories) parts.push(options.categories.sort().join(','));
    return parts.join('|');
  }

  get(query: string, options?: { topK?: number; docId?: number; categories?: string[] }): RetrievalResult[] | null {
    const key = this.getKey(query, options);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.results;
  }

  set(query: string, options: { topK?: number; docId?: number; categories?: string[] } | undefined, results: RetrievalResult[]): void {
    const key = this.getKey(query, options);

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      results,
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// ============================================================================
// Types
// ============================================================================

export interface RetrievalResult {
  content: string;
  sectionPath: string;
  similarity: number;
  docId: number;
  chunkIndex: number;
}

export interface RetrieverConfig {
  dimensions: number;
  topK: number;
  minSimilarity: number;
}

// ============================================================================
// Retriever
// ============================================================================

export class Retriever {
  private store: VectorStore;
  private embedder: EmbeddingProvider;
  private config: RetrieverConfig;
  private db: Database.Database;
  private cache: QueryCache;

  constructor(
    db: Database.Database,
    config?: Partial<RetrieverConfig>,
  ) {
    this.db = db;
    this.embedder = createEmbeddingProvider();

    this.config = {
      dimensions: config?.dimensions || this.embedder.dimensions,
      topK: config?.topK || 5,
      minSimilarity: config?.minSimilarity || 0.15,
    };

    this.store = new VectorStore(db, { dimensions: this.config.dimensions });
    this.cache = new QueryCache(100, 5 * 60 * 1000); // 100 entries, 5 min TTL
  }

  /**
   * Initialize the retriever (create vector table).
   */
  async initialize(): Promise<void> {
    await this.store.initialize();
  }

  /**
   * Index a document: chunk → embed → store.
   * Returns the number of chunks created.
   * W-15 fix: Deletes old vectors before inserting new ones for atomicity.
   * Batch processing: limits embedding batch size to avoid API limits.
   */
  async indexDocument(
    docId: number,
    content: string,
    // bge-large-zh-v1.5 max_seq_length=512 tokens（中文实测约 1.17 tokens/字），
    // 分块超过 512 tokens 会触发 ONNX Expand 崩溃且截断丢内容；
    // 400 字符 ≈ 470 tokens，保证完整输入模型，同时提高检索粒度。
    maxChars = 400,
  ): Promise<number> {
    // Step 1: Chunk the document
    const chunks = chunkText(content, maxChars);
    if (chunks.length === 0) return 0;

    // Step 2: Generate embeddings (batch processing)
    const BATCH_SIZE = 10;
    const texts = chunks.map((c) => c.content);
    const embeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const batchEmbeddings = await this.embedder.embed(batch);
      embeddings.push(...batchEmbeddings);
    }

    // Step 3: Delete old vectors for this doc (W-15 fix: atomicity)
    await this.store.deleteByDocId(docId);

    // Step 4: Store new vectors
    const records = chunks.map((chunk, i) => ({
      docId,
      chunkIndex: chunk.index,
      content: chunk.content,
      sectionPath: chunk.sectionPath,
      embedding: embeddings[i],
    }));

    await this.store.insertBatch(records);
    return chunks.length;
  }

  /**
   * Retrieve relevant chunks for a query.
   * Uses cosine similarity search with query caching.
   * Supports category filtering via doc_ids lookup.
   */
  async retrieve(
    query: string,
    options?: { topK?: number; docId?: number; minSimilarity?: number; categories?: string[] },
  ): Promise<RetrievalResult[]> {
    // Input validation: truncate overly long queries to prevent embedding API failures
    const MAX_QUERY_LENGTH = 2000;
    const safeQuery = query.length > MAX_QUERY_LENGTH ? query.slice(0, MAX_QUERY_LENGTH) : query;
    if (safeQuery.length !== query.length) {
      log.warn('Query truncated', { originalLength: query.length, truncatedTo: MAX_QUERY_LENGTH });
    }

    const topK = options?.topK || this.config.topK;
    const minSimilarity = options?.minSimilarity || this.config.minSimilarity;

    // Check cache first
    const cacheKey = { topK: options?.topK, docId: options?.docId, categories: options?.categories };
    const cachedResults = this.cache.get(safeQuery, cacheKey);
    if (cachedResults) {
      log.debug('Cache hit', { query: safeQuery.slice(0, 80) });
      return cachedResults;
    }

    log.info('Searching', { query: safeQuery.slice(0, 80), topK, categories: options?.categories });

    // If categories specified, resolve to doc_ids and search per-doc
    if (options?.categories && options.categories.length > 0) {
      const results = await this.retrieveByCategories(safeQuery, options.categories, topK, minSimilarity);
      this.cache.set(safeQuery, cacheKey, results);
      return results;
    }

    // Embed the query
    const start = Date.now();
    const queryEmbedding = await this.embedder.embed([safeQuery]);
    const embedding = queryEmbedding[0];

    // Search
    const results = await this.store.search(embedding, topK, options?.docId);

    // Filter by minimum similarity
    const filtered = results
      .filter((r) => (r.similarity || 0) >= minSimilarity)
      .map((r) => ({
        content: r.content,
        sectionPath: r.sectionPath,
        similarity: r.similarity || 0,
        docId: r.docId,
        chunkIndex: r.chunkIndex,
      }));

    // Dedup: if two chunks from the same doc have similarity within 0.05, keep the higher one
    const deduped: typeof filtered = [];
    for (const item of filtered) {
      const isDup = deduped.some(
        (d) => d.docId === item.docId && Math.abs(d.similarity - item.similarity) < 0.05,
      );
      if (!isDup) deduped.push(item);
    }

    const duration = Date.now() - start;
    if (deduped.length > 0) {
      log.info('Search completed', { results: deduped.length, bestSimilarity: deduped[0].similarity.toFixed(3), duration: `${duration}ms` });
      recordMetric('rag.retrieve', duration, true, { results: deduped.length });
    } else {
      log.info('Search completed: no results', { duration: `${duration}ms` });
      recordMetric('rag.retrieve', duration, true, { results: 0 });
    }

    // Cache the results
    this.cache.set(safeQuery, cacheKey, deduped);

    return deduped;
  }

  /**
   * Get regulation context for LLM prompt.
   * Retrieves top-k relevant regulation chunks and formats them as context.
   */
  async getRegulationContext(
    query: string,
    topK = 3,
  ): Promise<string> {
    const results = await this.retrieve(query, { topK });

    if (results.length === 0) {
      log.warn('No regulation context found', { query: query.slice(0, 80) });
      return '（未找到相关法规条款）';
    }

    log.info('Regulation context ready', { chunks: results.length, sections: results.map(r => r.sectionPath).join(', ') });

    return results
      .map(
        (r, i) =>
          `[${i + 1}] ${r.sectionPath}\n${r.content}\n(相似度: ${r.similarity.toFixed(3)})`,
      )
      .join('\n\n---\n\n');
  }

  /**
   * Get audit context from SOP and regulation documents.
   * Used by the built-in Audit Agent.
   */
  async getAuditContext(
    query: string,
    topK = 5,
  ): Promise<string> {
    const results = await this.retrieve(query, { topK, categories: ['sop', 'regulation'] });

    if (results.length === 0) {
      log.warn('No audit context found', { query: query.slice(0, 80) });
      return '（未找到相关SOP/法规条款）';
    }

    log.info('Audit context ready', { chunks: results.length, sections: results.map(r => r.sectionPath).join(', ') });

    return results
      .map(
        (r, i) =>
          `[${i + 1}] ${r.sectionPath}\n${r.content}\n(相似度: ${r.similarity.toFixed(3)})`,
      )
      .join('\n\n---\n\n');
  }

  /**
   * Retrieve by document categories.
   * Resolves categories to doc_ids, then searches across those docs.
   * H-1 fix: Use single searchByDocIds query instead of N+1 loop.
   */
  private async retrieveByCategories(
    query: string,
    categories: string[],
    topK: number,
    minSimilarity: number,
  ): Promise<RetrievalResult[]> {
    const docIds = getKnowledgeDocIdsByCategories(this.db, categories);
    if (docIds.length === 0) {
      log.warn('No documents found for categories', { categories });
      return [];
    }

    // Embed query once
    const start = Date.now();
    const queryEmbedding = await this.embedder.embed([query]);
    const embedding = queryEmbedding[0];

    // H-1 fix: Single query across all matching docs
    const results = await this.store.searchByDocIds(embedding, topK * 2, docIds);

    // Filter by minimum similarity and format
    const filtered = results
      .filter((r) => (r.similarity || 0) >= minSimilarity)
      .map((r) => ({
        content: r.content,
        sectionPath: r.sectionPath,
        similarity: r.similarity || 0,
        docId: r.docId,
        chunkIndex: r.chunkIndex,
      }));

    // Sort by similarity and take topK
    filtered.sort((a, b) => b.similarity - a.similarity);
    const deduped = filtered.slice(0, topK);

    const duration = Date.now() - start;
    log.info('Category search completed', { categories, results: deduped.length, duration: `${duration}ms` });
    recordMetric('rag.retrieve_category', duration, true, { categories: categories.join(','), results: deduped.length });

    return deduped;
  }

  /**
   * Delete all vectors for a document.
   */
  async deleteDocument(docId: number): Promise<void> {
    await this.store.deleteByDocId(docId);
  }

  /**
   * Get index statistics.
   */
  async getStats(): Promise<{ totalChunks: number; isAvailable: boolean }> {
    try {
      const totalChunks = await this.store.count();
      return { totalChunks, isAvailable: true };
    } catch {
      return { totalChunks: 0, isAvailable: false };
    }
  }
}
