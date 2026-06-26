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

  constructor(maxSize: number) {
    this.maxSize = maxSize;
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
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
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
    this.config = {
      dimensions: config?.dimensions || 1024,
      tableName: config?.tableName || 'document_embeddings',
    };
    // Cache up to 1000 embeddings
    this.embeddingCache = new LRUCache(1000);
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
      this.useFallback = true;
      // Fallback: create a regular table and do brute-force search
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
      // Add index on doc_id for faster queries
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_${this.activeTable}_doc_id ON ${this.activeTable}(doc_id)`);
      this.initialized = true;
    }
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

    // sqlite-vec path: use hex-encoded Float32 blob for embeddings.
    // better-sqlite3's prepare().run() doesn't handle vec0 parameter binding correctly,
    // so we use db.exec() with inline hex blobs and escaped text values.
    const table = this.activeTable;
    const stmts = records.map((record) => {
      const embeddingHex = Buffer.from(new Float32Array(record.embedding).buffer).toString('hex');
      const content = escapeSqliteString(record.content);
      const sectionPath = escapeSqliteString(record.sectionPath);
      // Validate numeric fields to prevent injection via non-numeric values
      const docId = Number.isFinite(record.docId) ? record.docId : 0;
      const chunkIndex = Number.isFinite(record.chunkIndex) ? record.chunkIndex : 0;
      return `INSERT INTO ${table} (doc_id, chunk_index, content, section_path, embedding) VALUES (${docId}, ${chunkIndex}, '${content}', '${sectionPath}', X'${embeddingHex}')`;
    });

    const tx = this.db.transaction(() => {
      for (const stmt of stmts) {
        this.db.exec(stmt);
      }
    });
    tx();
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
      // C-8 fix: Persist fallback flag so subsequent queries skip failing vec0
      this.useFallback = true;
      log.warn('vec0 search failed, falling back to brute-force permanently', { error: String(error) });
      return this.searchFallback(queryEmbedding, topK, docId);
    }
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
        similarity: 1 - r.distance, // cosine distance [0,2] → similarity [-1,1]
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
      similarity: 1 - r.distance,
    }));
  }

  /**
   * Brute-force cosine similarity search (fallback when sqlite-vec unavailable).
   * Uses LRU cache for embeddings to avoid repeated JSON.parse.
   */
  private searchFallback(
    queryEmbedding: number[],
    topK: number,
    docId?: number,
  ): VectorRecord[] {
    const whereClause = docId ? `WHERE doc_id = ?` : '';
    const params = docId ? [docId] : [];

    const rows = this.db
      .prepare(`SELECT id, doc_id, chunk_index, content, section_path, embedding FROM ${this.activeTable} ${whereClause}`)
      .all(...params) as Array<{
      id: number;
      doc_id: number;
      chunk_index: number;
      content: string;
      section_path: string;
      embedding: string;
    }>;

    // Compute cosine similarity with cached embeddings
    log.debug('Brute-force search started', { totalVectors: rows.length, table: this.activeTable });
    const scored = rows.map((r) => {
      // Check cache first
      let embedding = this.embeddingCache.get(r.embedding);
      if (!embedding) {
        embedding = JSON.parse(r.embedding) as number[];
        this.embeddingCache.set(r.embedding, embedding);
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

/**
 * Escape a string for safe inclusion in SQL single-quoted literals.
 * Handles single quotes, backslashes, null bytes, and control characters.
 */
function escapeSqliteString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')   // Escape backslashes first
    .replace(/'/g, "''")       // Escape single quotes
    .replace(/\0/g, '')        // Remove null bytes
    .replace(controlCharRegex, ''); // Remove control chars (keep \t \n \r)
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
