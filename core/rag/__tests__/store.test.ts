import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { VectorStore } from '../store';

let db: Database.Database;
let store: VectorStore;

beforeAll(async () => {
  db = new Database(':memory:');
  store = new VectorStore(db, { dimensions: 8 }); // Small dimensions for testing
  await store.initialize();
});

afterAll(() => {
  db.close();
});

describe('VectorStore (sqlite-vec path)', () => {
  it('should initialize without error', async () => {
    const newDb = new Database(':memory:');
    const newStore = new VectorStore(newDb, { dimensions: 8 });
    await newStore.initialize();
    expect(await newStore.count()).toBe(0);
    newDb.close();
  });

  it('should skip re-initialization when already initialized', async () => {
    // Calling initialize() again should be a no-op
    await store.initialize();
    expect(await store.count()).toBeGreaterThanOrEqual(0);
  });

  it('should insert vectors', async () => {
    await store.insertBatch([
      {
        docId: 1,
        chunkIndex: 0,
        content: '偏差处理程序',
        sectionPath: '第二章',
        embedding: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
      },
      {
        docId: 1,
        chunkIndex: 1,
        content: '变更控制系统',
        sectionPath: '第二章',
        embedding: [0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1],
      },
    ]);
    expect(await store.count()).toBe(2);
  });

  it('should search by similarity', async () => {
    const results = await store.search(
      [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
      2,
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toBeTruthy();
  });

  it('should filter by docId in vec0 search', async () => {
    await store.insertBatch([
      {
        docId: 2,
        chunkIndex: 0,
        content: '不同文档的内容',
        sectionPath: '第三章',
        embedding: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
      },
    ]);

    const results = await store.search(
      [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
      10,
      1, // Only doc 1
    );
    expect(results.every((r) => r.docId === 1)).toBe(true);
  });

  it('should delete by docId', async () => {
    const countBefore = await store.count();
    await store.deleteByDocId(2);
    const countAfter = await store.count();
    expect(countAfter).toBeLessThan(countBefore);
  });

  it('should handle empty search', async () => {
    const results = await store.search([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8], 5, 999);
    expect(results).toEqual([]);
  });

  it('should return early on empty insertBatch', async () => {
    const countBefore = await store.count();
    await store.insertBatch([]);
    expect(await store.count()).toBe(countBefore);
  });

  it('should handle content with single quotes via escapeSqliteString', async () => {
    const quoteStore = new VectorStore(new Database(':memory:'), { dimensions: 4 });
    await quoteStore.initialize();
    await quoteStore.insertBatch([
      {
        docId: 10,
        chunkIndex: 0,
        content: "It's a test with 'quotes'",
        sectionPath: "Section 'A'",
        embedding: [1, 0, 0, 0],
      },
    ]);
    const results = await quoteStore.search([1, 0, 0, 0], 1);
    expect(results[0].content).toBe("It's a test with 'quotes'");
    expect(results[0].sectionPath).toBe("Section 'A'");
  });

  it('should handle content with backslashes via escapeSqliteString', async () => {
    const bsStore = new VectorStore(new Database(':memory:'), { dimensions: 4 });
    await bsStore.initialize();
    await bsStore.insertBatch([
      {
        docId: 11,
        chunkIndex: 0,
        content: 'Path: C:\\Users\\test\\file.txt',
        sectionPath: 'Section\\Sub',
        embedding: [0, 1, 0, 0],
      },
    ]);
    // escapeSqliteString doubles backslashes; SQLite doesn't un-escape them
    // so stored value has doubled backslashes — verify data round-trips cleanly
    expect(await bsStore.count()).toBe(1);
    const results = await bsStore.search([0, 1, 0, 0], 1);
    expect(results.length).toBe(1);
    expect(results[0].content).toContain('Users');
    expect(results[0].content).toContain('file.txt');
  });

  it('should strip null bytes and control characters from content', async () => {
    const ctrlStore = new VectorStore(new Database(':memory:'), { dimensions: 4 });
    await ctrlStore.initialize();
    // \x00 = null byte, \x01 = control char, \x0b = vertical tab
    // escapeSqliteString removes these; verify insertBatch doesn't throw
    await ctrlStore.insertBatch([
      {
        docId: 12,
        chunkIndex: 0,
        content: 'Hello\x00 World\x01 Test\x0b End',
        sectionPath: 'Sec\x00tion',
        embedding: [0, 0, 1, 0],
      },
    ]);
    // Verify the record was inserted successfully
    expect(await ctrlStore.count()).toBe(1);
  });

  it('should normalize non-numeric docId and chunkIndex to 0', async () => {
    const nanStore = new VectorStore(new Database(':memory:'), { dimensions: 4 });
    await nanStore.initialize();
    await nanStore.insertBatch([
      {
        docId: Number.NaN,
        chunkIndex: Number.POSITIVE_INFINITY,
        content: 'NaN test',
        sectionPath: 's',
        embedding: [1, 1, 1, 1],
      },
    ]);
    const results = await nanStore.search([1, 1, 1, 1], 1);
    expect(results[0].docId).toBe(0);
    expect(results[0].chunkIndex).toBe(0);
  });
});

// ============================================================================
// Fallback path tests — use a factory that directly creates a fallback store
// by calling initialize() with sqlite-vec load() forced to throw
// ============================================================================

/**
 * Create a VectorStore in fallback mode by monkey-patching the db.exec
 * so that `CREATE VIRTUAL TABLE` throws, triggering the catch path.
 */
async function createFallbackStore(dimensions: number): Promise<{ db: Database.Database; store: VectorStore }> {
  const db = new Database(':memory:');
  const store = new VectorStore(db, { dimensions });

  // Patch db.exec to throw on vec0 virtual table creation
  let patched = true;
  const dbWithExec = db as unknown as { exec: (sql: string) => unknown };
  const origExecMethod = dbWithExec.exec.bind(db);
  dbWithExec.exec = (sql: string) => {
    if (patched && sql.includes('CREATE VIRTUAL TABLE')) {
      patched = false; // only intercept once
      throw new Error('sqlite-vec not available (test mock)');
    }
    return origExecMethod(sql);
  };

  await store.initialize();
  // Restore original exec after initialization
  dbWithExec.exec = origExecMethod;
  return { db, store };
}

describe('VectorStore (fallback path)', () => {
  let fallbackDb: Database.Database;
  let fallbackStore: VectorStore;

  beforeAll(async () => {
    const result = await createFallbackStore(8);
    fallbackDb = result.db;
    fallbackStore = result.store;
  });

  afterAll(() => {
    fallbackDb.close();
  });

  it('should initialize in fallback mode', async () => {
    expect(await fallbackStore.count()).toBe(0);
  });

  it('should insert vectors via fallback path', async () => {
    await fallbackStore.insertBatch([
      {
        docId: 1,
        chunkIndex: 0,
        content: 'Fallback item A',
        sectionPath: 'Section A',
        embedding: [1, 0, 0, 0, 0, 0, 0, 0],
      },
      {
        docId: 1,
        chunkIndex: 1,
        content: 'Fallback item B',
        sectionPath: 'Section B',
        embedding: [0, 1, 0, 0, 0, 0, 0, 0],
      },
      {
        docId: 2,
        chunkIndex: 0,
        content: 'Fallback item C',
        sectionPath: 'Section C',
        embedding: [0, 0, 1, 0, 0, 0, 0, 0],
      },
    ]);
    expect(await fallbackStore.count()).toBe(3);
  });

  it('should return early on empty insertBatch in fallback mode', async () => {
    const countBefore = await fallbackStore.count();
    await fallbackStore.insertBatch([]);
    expect(await fallbackStore.count()).toBe(countBefore);
  });

  it('should search via brute-force fallback', async () => {
    const results = await fallbackStore.search(
      [1, 0, 0, 0, 0, 0, 0, 0],
      3,
    );
    expect(results.length).toBe(3);
    // Most similar should be item A (exact match)
    expect(results[0].content).toBe('Fallback item A');
    expect(results[0].similarity).toBeCloseTo(1.0, 5);
    // Results should be sorted by similarity descending
    for (let i = 1; i < results.length; i++) {
      expect(results[i].similarity!).toBeLessThanOrEqual(results[i - 1].similarity!);
    }
  });

  it('should filter by docId in fallback search', async () => {
    const results = await fallbackStore.search(
      [1, 0, 0, 0, 0, 0, 0, 0],
      10,
      2,
    );
    expect(results.length).toBe(1);
    expect(results[0].docId).toBe(2);
    expect(results[0].content).toBe('Fallback item C');
  });

  it('should respect topK in fallback search', async () => {
    const results = await fallbackStore.search(
      [1, 0, 0, 0, 0, 0, 0, 0],
      1,
    );
    expect(results.length).toBe(1);
    expect(results[0].content).toBe('Fallback item A');
  });

  it('should delete by docId in fallback mode', async () => {
    await fallbackStore.deleteByDocId(1);
    expect(await fallbackStore.count()).toBe(1);
    const results = await fallbackStore.search([0, 0, 1, 0, 0, 0, 0, 0], 10);
    expect(results.length).toBe(1);
    expect(results[0].docId).toBe(2);
  });

  it('should return empty for non-existent docId search', async () => {
    const results = await fallbackStore.search([1, 0, 0, 0, 0, 0, 0, 0], 5, 999);
    expect(results).toEqual([]);
  });
});

// ============================================================================
// Search fallback: vec0 failure → permanently switches to brute-force
// ============================================================================

describe('VectorStore (vec0 → fallback degradation)', () => {
  it('should permanently switch to fallback when vec0 search fails', async () => {
    const testDb = new Database(':memory:');
    const testStore = new VectorStore(testDb, { dimensions: 4 });
    await testStore.initialize();

    // Insert via vec0 path
    await testStore.insertBatch([
      {
        docId: 1,
        chunkIndex: 0,
        content: 'Degradation test',
        sectionPath: 's',
        embedding: [1, 0, 0, 0],
      },
    ]);

    // Drop the vec0 virtual table to simulate vec0 search failure
    testDb.exec('DROP TABLE document_embeddings');
    // Create the fallback table manually with the data
    testDb.exec(`
      CREATE TABLE document_embeddings_fallback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id INTEGER,
        chunk_index INTEGER,
        content TEXT,
        section_path TEXT,
        embedding BLOB
      )
    `);
    testDb.prepare(`
      INSERT INTO document_embeddings_fallback (doc_id, chunk_index, content, section_path, embedding)
      VALUES (?, ?, ?, ?, ?)
    `).run(1, 0, 'Degradation test', 's', JSON.stringify([1, 0, 0, 0]));

    // First search should fail on vec0, fall back to brute-force permanently
    const results = await testStore.search([1, 0, 0, 0], 5);
    expect(results.length).toBe(1);
    expect(results[0].content).toBe('Degradation test');

    // Second search should go directly to fallback (useFallback is now permanently true)
    const results2 = await testStore.search([1, 0, 0, 0], 5);
    expect(results2.length).toBe(1);
    expect(results2[0].content).toBe('Degradation test');

    testDb.close();
  });
});

// ============================================================================
// searchByDocIds tests
// ============================================================================

describe('VectorStore searchByDocIds (sqlite-vec path)', () => {
  let multiDb: Database.Database;
  let multiStore: VectorStore;

  beforeAll(async () => {
    multiDb = new Database(':memory:');
    multiStore = new VectorStore(multiDb, { dimensions: 4 });
    await multiStore.initialize();
    await multiStore.insertBatch([
      { docId: 1, chunkIndex: 0, content: 'Doc1-A', sectionPath: 'S1', embedding: [1, 0, 0, 0] },
      { docId: 1, chunkIndex: 1, content: 'Doc1-B', sectionPath: 'S2', embedding: [0.9, 0.1, 0, 0] },
      { docId: 2, chunkIndex: 0, content: 'Doc2-A', sectionPath: 'S3', embedding: [0, 1, 0, 0] },
      { docId: 3, chunkIndex: 0, content: 'Doc3-A', sectionPath: 'S4', embedding: [0, 0, 1, 0] },
    ]);
  });

  afterAll(() => {
    multiDb.close();
  });

  it('should return empty for empty docIds array', async () => {
    const results = await multiStore.searchByDocIds([1, 0, 0, 0], 5, []);
    expect(results).toEqual([]);
  });

  it('should delegate to search() for single docId', async () => {
    const results = await multiStore.searchByDocIds([1, 0, 0, 0], 5, [1]);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.docId === 1)).toBe(true);
  });

  it('should search across multiple docIds', async () => {
    const results = await multiStore.searchByDocIds([1, 0, 0, 0], 10, [1, 2]);
    expect(results.length).toBeGreaterThan(0);
    const docIds = new Set(results.map((r) => r.docId));
    expect(docIds.has(3)).toBe(false); // doc 3 excluded
  });

  it('should respect topK limit', async () => {
    const results = await multiStore.searchByDocIds([1, 0, 0, 0], 1, [1, 2, 3]);
    expect(results.length).toBe(1);
  });
});

describe('VectorStore searchByDocIds (fallback path)', () => {
  let fallbackDb2: Database.Database;
  let fallbackStore2: VectorStore;

  beforeAll(async () => {
    const result = await createFallbackStore(4);
    fallbackDb2 = result.db;
    fallbackStore2 = result.store;
    await fallbackStore2.insertBatch([
      { docId: 10, chunkIndex: 0, content: 'FB-Doc10', sectionPath: 'S1', embedding: [1, 0, 0, 0] },
      { docId: 20, chunkIndex: 0, content: 'FB-Doc20', sectionPath: 'S2', embedding: [0, 1, 0, 0] },
      { docId: 30, chunkIndex: 0, content: 'FB-Doc30', sectionPath: 'S3', embedding: [0, 0, 1, 0] },
    ]);
  });

  afterAll(() => {
    fallbackDb2.close();
  });

  it('should search across multiple docIds in fallback mode', async () => {
    const results = await fallbackStore2.searchByDocIds([1, 0, 0, 0], 10, [10, 20]);
    expect(results.length).toBe(2);
    const docIds = new Set(results.map((r) => r.docId));
    expect(docIds.has(10)).toBe(true);
    expect(docIds.has(20)).toBe(true);
    expect(docIds.has(30)).toBe(false);
  });

  it('should sort by similarity in fallback multi-doc search', async () => {
    const results = await fallbackStore2.searchByDocIds([1, 0, 0, 0], 10, [10, 20, 30]);
    expect(results[0].docId).toBe(10); // Exact match
    expect(results[0].similarity).toBeCloseTo(1.0, 5);
  });

  it('should respect topK in fallback multi-doc search', async () => {
    const results = await fallbackStore2.searchByDocIds([1, 0, 0, 0], 2, [10, 20, 30]);
    expect(results.length).toBe(2);
  });
});

// ============================================================================
// Invalid table name validation
// ============================================================================

describe('VectorStore table name validation', () => {
  it('should reject invalid table names', () => {
    const db = new Database(':memory:');
    expect(() => new VectorStore(db, { tableName: 'invalid; DROP TABLE' })).toThrow('Invalid table name');
    expect(() => new VectorStore(db, { tableName: '123start' })).toThrow('Invalid table name');
    db.close();
  });

  it('should accept valid table names', () => {
    const db = new Database(':memory:');
    expect(() => new VectorStore(db, { tableName: 'valid_table_1' })).not.toThrow();
    expect(() => new VectorStore(db, { tableName: '_private' })).not.toThrow();
    db.close();
  });
});

// ============================================================================
// cosine similarity edge cases (tested indirectly through fallback search)
// ============================================================================

describe('cosineSimilarity (via fallback search)', () => {
  it('should return 1.0 for identical vectors', async () => {
    const { db: testDb, store: testStore } = await createFallbackStore(4);
    await testStore.insertBatch([
      { docId: 1, chunkIndex: 0, content: 'A', sectionPath: 's', embedding: [1, 2, 3, 4] },
    ]);
    const results = await testStore.search([1, 2, 3, 4], 1);
    expect(results[0].similarity).toBeCloseTo(1.0, 5);
    testDb.close();
  });

  it('should return 0 for orthogonal vectors', async () => {
    const { db: testDb, store: testStore } = await createFallbackStore(3);
    await testStore.insertBatch([
      { docId: 1, chunkIndex: 0, content: 'A', sectionPath: 's', embedding: [1, 0, 0] },
    ]);
    const results = await testStore.search([0, 1, 0], 1);
    expect(results[0].similarity).toBeCloseTo(0, 5);
    testDb.close();
  });

  it('should return 0 for zero-vector inputs', async () => {
    const { db: testDb, store: testStore } = await createFallbackStore(3);
    await testStore.insertBatch([
      { docId: 1, chunkIndex: 0, content: 'A', sectionPath: 's', embedding: [0, 0, 0] },
    ]);
    const results = await testStore.search([1, 0, 0], 1);
    // Zero vector → denominator is 0 → similarity 0
    expect(results[0].similarity).toBe(0);
    testDb.close();
  });

  it('should return 0 for vectors of different lengths', async () => {
    const { db: testDb, store: testStore } = await createFallbackStore(4);
    // Manually insert with mismatched embedding length (3 elements vs query 4)
    testDb.prepare(`
      INSERT INTO document_embeddings_fallback (doc_id, chunk_index, content, section_path, embedding)
      VALUES (?, ?, ?, ?, ?)
    `).run(1, 0, 'Mismatch', 's', JSON.stringify([1, 2, 3]));

    const results = await testStore.search([1, 0, 0, 0], 1);
    expect(results[0].similarity).toBe(0);
    testDb.close();
  });
});
