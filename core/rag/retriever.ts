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

const log = createLogger('RAG');

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

  constructor(
    db: Database.Database,
    config?: Partial<RetrieverConfig>,
  ) {
    this.embedder = createEmbeddingProvider();

    this.config = {
      dimensions: config?.dimensions || this.embedder.dimensions,
      topK: config?.topK || 5,
      minSimilarity: config?.minSimilarity || 0.5,
    };

    this.store = new VectorStore(db, { dimensions: this.config.dimensions });
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
    maxChars = 8000,
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
   * Uses cosine similarity search.
   */
  async retrieve(
    query: string,
    options?: { topK?: number; docId?: number; minSimilarity?: number },
  ): Promise<RetrievalResult[]> {
    const topK = options?.topK || this.config.topK;
    const minSimilarity = options?.minSimilarity || this.config.minSimilarity;

    log.info('Searching', { query: query.slice(0, 80), topK });

    // Embed the query
    const start = Date.now();
    const queryEmbedding = await this.embedder.embed([query]);
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
