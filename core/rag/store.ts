/**
 * Vector store using sqlite-vec for similarity search.
 * Integrates with better-sqlite3 for unified storage.
 *
 * sqlite-vec provides virtual table for vector operations.
 * WASM build avoids native module issues in Electron.
 */

import type Database from 'better-sqlite3';
import { createLogger } from '../utils/logger';

const log = createLogger('RAG');

// ============================================================================
// Types
// ============================================================================

export interface VectorRecord {
  id: number;
  docId: number;
  chunkIndex: number;
  content: string;
  sectionPath: string;
  similarity?: number;
}

export interface StoreConfig {
  dimensions: number;  // Embedding dimensions (1024 for BAAI/bge-large-zh-v1.5)
  tableName: string;   // Virtual table name
}

// ============================================================================
// LRU Cache for embeddings
// ============================================================================

class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;
  private currentSize = 0;
  private estimateSize: (value: V) => number;

  constructor(maxSize: number, estimateSize?: (value: V) => number) {
    this.maxSize = maxSize;
    this.estimateSize = estimateSize || (() => 1);
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    const oldSize = this.estimateSize(value);
    
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.currentSize + oldSize > this.maxSize) {
      // Remove oldest entries until we have space
      while (this.currentSize + oldSize > this.maxSize && this.cache.size > 0) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey !== undefined) {
          const removedValue = this.cache.get(firstKey);
          if (removedValue !== undefined) {
            this.currentSize -= this.estimateSize(removedValue);
          }
          this.cache.delete(firstKey);
        }
      }
    }
    
    this.currentSize += oldSize;
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
  }

  get size(): number {
    return this.cache.size;
  }

  get estimatedMemory(): number {
    return this.currentSize;
  }
}

// ============================================================================
// Vector Store
// ============================================================================

export class VectorStore {
  private db: Database.Database;
  private config: StoreConfig;
  private initialized = false;
  private useFallback = false;
  private embeddingCache: LRUCache<string, number[]>;

  /** Actual table name (may differ from config if using fallback) */
  private get activeTable(): string {
    return this.useFallback ? `${this.config.tableName}_fallback` : this.config.tableName;
  }

  constructor(db: Database.Database, config?: Partial<StoreConfig>) {
    this.db = db;
    const rawTableName = config?.tableName || 'document_embeddings';
    // Validate table name: only alphanumeric and underscore allowed (prevent SQL injection)
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(rawTableName)) {
      throw new Error(`Invalid table name: ${rawTableName}. Only alphanumeric and underscore allowed.`);
    }
    this.config = {
      dimensions: config?.dimensions || 1024,
      tableName: rawTableName,
    };
    // Cache with memory limit: ~50MB max (each embedding ~4KB for 1024 dimensions)
    this.embeddingCache = new LRUCache(50 * 1024 * 1024, (arr) => arr.length * 8);
  }

  /**
   * Initialize vector table. Must be called before any operations.
   * Uses sqlite-vec virtual table for vector search.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Load sqlite-vec WASM extension into the connection
      const { load } = await import('sqlite-vec');
      load(this.db);
      log.info('sqlite-vec extension loaded');

      // vec0 virtual table: rowid is the implicit primary key.
      // Metadata columns (doc_id, chunk_index, content, section_path) are stored alongside the embedding.
      // Embeddings must be stored as Float32 buffers, not JSON strings.
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS ${this.config.tableName}
        USING vec0(
          doc_id INTEGER,
          chunk_index INTEGER,
          content TEXT,
          section_path TEXT,
          embedding float[${this.config.dimensions}]
        )
      `);
      this.initialized = true;
      log.info('Vector table initialized (sqlite-vec)', { table: this.config.tableName, dimensions: this.config.dimensions });
    } catch (error) {
      log.warn('sqlite-vec not available, using fallback', { error: String(error) });
      this.enableFallback();
      this.initialized = true;
    }
  }

  /**
   * Enable brute-force fallback mode and ensure the fallback table exists.
   * Safe to call multiple times (idempotent). Must be called BEFORE any
   * fallback-path SQL so the *_fallback table is always present.
   */
  private enableFallback(): void {
    if (this.useFallback) return;
    this.useFallback = true;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.activeTable} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id INTEGER,
        chunk_index INTEGER,
        content TEXT,
        section_path TEXT,
        embedding BLOB
      )
    `);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_${this.activeTable}_doc_id ON ${this.activeTable}(doc_id)`);
  }

  /**
   * Insert vectors in batch.
   * For sqlite-vec path: embeddings stored as Float32 Buffer.
   * For fallback path: embeddings stored as JSON string.
   */
  async insertBatch(records: {
    docId: number;
    chunkIndex: number;
    content: string;
    sectionPath: string;
    embedding: number[];
  }[]): Promise<void> {
    if (records.length === 0) return;

    if (this.useFallback) {
      return this.insertBatchFallback(records);
    }

    // SECURITY: sqlite-vec vec0 virtual tables do NOT support standard parameter binding
    // for INSERT (better-sqlite3 binds JS numbers as FLOAT, vec0 expects strict INTEGER).
    // String concatenation is the ONLY supported method for vec0 inserts.
    // Mitigations applied:
    //   1. Table name validated against ^[a-zA-Z0-9_]+$ (line 196)
    //   2. content/sectionPath escaped via escapeSqliteString (handles ', \, null bytes, bidi overrides)
    //   3. docId/chunkIndex enforced as finite integers via Math.trunc
    //   4. embedding is hex-encoded binary (no user input)
    const table = this.activeTable;
    // Validate table name to prevent SQL injection (only allow alphanumeric and underscores)
    if (!/^[a-zA-Z0-9_]+$/.test(table)) {
      throw new Error(`Invalid table name: ${table}`);
    }
    const stmts = records.map((record) => {
      const embeddingHex = Buffer.from(new Float32Array(record.embedding).buffer).toString('hex');
      const content = escapeSqliteString(record.content, 50_000);
      const sectionPath = escapeSqliteString(record.sectionPath, 1_000);
      // vec0 requires strict integers for metadata columns
      const docId = Number.isFinite(record.docId) ? Math.trunc(record.docId) : 0;
      const chunkIndex = Number.isFinite(record.chunkIndex) ? Math.trunc(record.chunkIndex) : 0;
      return `INSERT INTO ${table} (doc_id, chunk_index, content, section_path, embedding) VALUES (${docId}, ${chunkIndex}, '${content}', '${sectionPath}', X'${embeddingHex}')`;
    });

    const tx = this.db.transaction(() => {
      for (const stmt of stmts) {
        this.db.exec(stmt);
      }
    });
    try {
      tx();
    } catch (error) {
      // vec0 insert can fail (e.g. embedding dimension drift after provider change).
      // Fall back to the regular table so indexing is never lost.
      log.warn('vec0 insert failed, falling back to regular table', { error: String(error) });
      this.enableFallback();
      this.insertBatchFallback(records);
    }
    log.debug('Vector batch insert (sqlite-vec)', { records: records.length, table: this.activeTable });
  }

  /**
   * Insert vectors using JSON string format (fallback path).
   */
  private insertBatchFallback(records: {
    docId: number;
    chunkIndex: number;
    content: string;
    sectionPath: string;
    embedding: number[];
  }[]): void {
    const insert = this.db.prepare(`
      INSERT INTO ${this.activeTable}
      (doc_id, chunk_index, content, section_path, embedding)
      VALUES (?, ?, ?, ?, ?)
    `);

    const tx = this.db.transaction(() => {
      for (const record of records) {
        insert.run(
          record.docId,
          record.chunkIndex,
          record.content,
          record.sectionPath,
          JSON.stringify(record.embedding),
        );
      }
    });
    tx();
    log.debug('Vector batch insert (fallback)', { records: records.length, table: this.activeTable });
  }

  /**
   * Search for similar vectors using cosine similarity.
   * Returns top-k results sorted by similarity.
   */
  async search(
    queryEmbedding: number[],
    topK = 5,
    docId?: number,
  ): Promise<VectorRecord[]> {
    if (this.useFallback) {
      return this.searchFallback(queryEmbedding, topK, docId);
    }
    // Try vec0 search first
    try {
      return this.searchVec0(queryEmbedding, topK, docId);
    } catch (error) {
      // C-8 fix: Persist fallback flag + ensure table so subsequent queries skip failing vec0
      this.enableFallback();
      log.warn('vec0 search failed, falling back to brute-force permanently', { error: String(error) });
      return this.searchFallback(queryEmbedding, topK, docId);
    }
  }

  /**
   * Search across multiple documents (H-1 fix: avoid N+1 queries).
   * More efficient than calling search() for each docId individually.
   */
  async searchByDocIds(
    queryEmbedding: number[],
    topK: number,
    docIds: number[],
  ): Promise<VectorRecord[]> {
    if (docIds.length === 0) return [];
    if (docIds.length === 1) return this.search(queryEmbedding, topK, docIds[0]);

    if (this.useFallback) {
      return this.searchFallbackByDocIds(queryEmbedding, topK, docIds);
    }
    try {
      return this.searchVec0ByDocIds(queryEmbedding, topK, docIds);
    } catch (error) {
      this.enableFallback();
      log.warn('vec0 search failed, falling back to brute-force permanently', { error: String(error) });
      return this.searchFallbackByDocIds(queryEmbedding, topK, docIds);
    }
  }

  /**
   * Vec0 search across multiple doc IDs.
   */
  private searchVec0ByDocIds(
    queryEmbedding: number[],
    topK: number,
    docIds: number[],
  ): VectorRecord[] {
    const embeddingBuf = Buffer.from(new Float32Array(queryEmbedding).buffer);
    const placeholders = docIds.map(() => '?').join(',');
    const query = `
      SELECT rowid, doc_id, chunk_index, content, section_path, distance
      FROM ${this.config.tableName}
      WHERE embedding MATCH ? AND doc_id IN (${placeholders})
      ORDER BY distance
      LIMIT ?
    `;
    const rows = this.db.prepare(query).all(embeddingBuf, ...docIds, topK) as Array<{
      rowid: number;
      doc_id: number;
      chunk_index: number;
      content: string;
      section_path: string;
      distance: number;
    }>;

    return rows.map((r) => ({
      id: r.rowid,
      docId: r.doc_id,
      chunkIndex: r.chunk_index,
      content: r.content,
      sectionPath: r.section_path,
      similarity: 1 - (r.distance * r.distance) / 2,
    }));
  }

  /**
   * Fallback search across multiple doc IDs.
   */
  private searchFallbackByDocIds(
    queryEmbedding: number[],
    topK: number,
    docIds: number[],
  ): VectorRecord[] {
    const placeholders = docIds.map(() => '?').join(',');
    const maxRows = Math.max(topK * 10, 100);

    const rows = this.db
      .prepare(`SELECT id, doc_id, chunk_index, content, section_path, embedding FROM ${this.activeTable} WHERE doc_id IN (${placeholders}) LIMIT ?`)
      .all(...docIds, maxRows) as Array<{
      id: number;
      doc_id: number;
      chunk_index: number;
      content: string;
      section_path: string;
      embedding: string;
    }>;

    log.debug('Brute-force multi-doc search', { totalVectors: rows.length, docIds: docIds.length });
    const scored = rows.map((r) => {
      const cacheKey = String(r.id);
      let embedding = this.embeddingCache.get(cacheKey);
      if (!embedding) {
        embedding = JSON.parse(r.embedding) as number[];
        this.embeddingCache.set(cacheKey, embedding);
      }
      return {
        id: r.id,
        docId: r.doc_id,
        chunkIndex: r.chunk_index,
        content: r.content,
        sectionPath: r.section_path,
        similarity: cosineSimilarity(queryEmbedding, embedding),
      };
    });

    scored.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
    return scored.slice(0, topK);
  }

  /**
   * Search using sqlite-vec's vec0 virtual table.
   * Uses Float32 Buffer for the query embedding.
   */
  private searchVec0(
    queryEmbedding: number[],
    topK: number,
    docId?: number,
  ): VectorRecord[] {
    const embeddingBuf = Buffer.from(new Float32Array(queryEmbedding).buffer);

    if (docId) {
      const query = `
        SELECT rowid, doc_id, chunk_index, content, section_path, distance
        FROM ${this.config.tableName}
        WHERE embedding MATCH ? AND doc_id = ?
        ORDER BY distance
        LIMIT ?
      `;
      const rows = this.db.prepare(query).all(embeddingBuf, docId, topK) as Array<{
        rowid: number;
        doc_id: number;
        chunk_index: number;
        content: string;
        section_path: string;
        distance: number;
      }>;

      return rows.map((r) => ({
        id: r.rowid,
        docId: r.doc_id,
        chunkIndex: r.chunk_index,
        content: r.content,
        sectionPath: r.section_path,
        // sqlite-vec vec0 uses L2 distance by default. For normalized vectors:
        // cosine_similarity = 1 - L2_distance² / 2
        similarity: 1 - (r.distance * r.distance) / 2,
      }));
    }

    const query = `
      SELECT rowid, doc_id, chunk_index, content, section_path, distance
      FROM ${this.config.tableName}
      WHERE embedding MATCH ?
      ORDER BY distance
      LIMIT ?
    `;
    const rows = this.db.prepare(query).all(embeddingBuf, topK) as Array<{
      rowid: number;
      doc_id: number;
      chunk_index: number;
      content: string;
      section_path: string;
      distance: number;
    }>;

    return rows.map((r) => ({
      id: r.rowid,
      docId: r.doc_id,
      chunkIndex: r.chunk_index,
      content: r.content,
      sectionPath: r.section_path,
      similarity: 1 - (r.distance * r.distance) / 2,
    }));
  }

  /**
   * Brute-force cosine similarity search (fallback when sqlite-vec unavailable).
   * Uses LRU cache for embeddings to avoid repeated JSON.parse.
   * C-3 fix: Add LIMIT to prevent OOM on large datasets.
   * C-4 fix: Use row id as cache key instead of full embedding string.
   */
  private searchFallback(
    queryEmbedding: number[],
    topK: number,
    docId?: number,
  ): VectorRecord[] {
    const whereClause = docId ? `WHERE doc_id = ?` : '';
    const params = docId ? [docId] : [];
    // C-3 fix: Limit rows to prevent memory overflow (topK * 10 as heuristic)
    const maxRows = Math.max(topK * 10, 100);

    const rows = this.db
      .prepare(`SELECT id, doc_id, chunk_index, content, section_path, embedding FROM ${this.activeTable} ${whereClause} LIMIT ?`)
      .all(...params, maxRows) as Array<{
      id: number;
      doc_id: number;
      chunk_index: number;
      content: string;
      section_path: string;
      embedding: string;
    }>;

    // Compute cosine similarity with cached embeddings
    log.debug('Brute-force search started', { totalVectors: rows.length, table: this.activeTable, maxRows });
    const scored = rows.map((r) => {
      // C-4 fix: Use row id as cache key instead of full embedding string
      const cacheKey = String(r.id);
      let embedding = this.embeddingCache.get(cacheKey);
      if (!embedding) {
        embedding = JSON.parse(r.embedding) as number[];
        this.embeddingCache.set(cacheKey, embedding);
      }
      return {
        id: r.id,
        docId: r.doc_id,
        chunkIndex: r.chunk_index,
        content: r.content,
        sectionPath: r.section_path,
        similarity: cosineSimilarity(queryEmbedding, embedding),
      };
    });

    // Sort by similarity descending, take top-k
    scored.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
    return scored.slice(0, topK);
  }

  /**
   * Delete all vectors for a document.
   */
  async deleteByDocId(docId: number): Promise<void> {
    this.db.prepare(`DELETE FROM ${this.activeTable} WHERE doc_id = ?`).run(docId);
    log.debug('Vectors deleted', { docId, table: this.activeTable });
  }

  /**
   * Get total vector count.
   */
  async count(): Promise<number> {
    const row = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.activeTable}`).get() as { count: number };
    return row.count;
  }
}

// ============================================================================
// Utilities
// ============================================================================

// Build control char regex dynamically to satisfy no-control-regex ESLint rule
const controlCharRegex = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(8)}${String.fromCharCode(0x0b)}${String.fromCharCode(0x0c)}${String.fromCharCode(0x0e)}-${String.fromCharCode(0x1f)}]`,
  'g',
);

// Unicode bidirectional override characters (potential injection vectors)
const bidiOverrideRegex = /[\u202A-\u202E\u2066-\u2069]/g;

/**
 * Escape a string for safe inclusion in SQL single-quoted literals.
 * Handles: single quotes, backslashes, null bytes, control chars, bidi overrides.
 * @param value - Raw string to escape
 * @param maxLen - Maximum allowed length (truncated if exceeded)
 */
function escapeSqliteString(value: string, maxLen = 100_000): string {
  return value
    .slice(0, maxLen)              // Enforce length limit
    .replace(/'/g, "''")       // Escape single quotes first
    .replace(/\\/g, '\\\\')   // Then escape backslashes
    .replace(/\0/g, '')        // Remove null bytes
    .replace(controlCharRegex, '') // Remove control chars (keep \t \n \r)
    .replace(bidiOverrideRegex, ''); // Remove Unicode bidi override chars
}

/**
 * Cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}
