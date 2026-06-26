import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';

// Mock dependencies
vi.mock('../embedder', () => ({
  createEmbeddingProvider: vi.fn().mockReturnValue({
    name: 'mock',
    dimensions: 8,
    embed: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]]),
    isAvailable: vi.fn().mockReturnValue(true),
  }),
}));

vi.mock('../store', () => ({
  VectorStore: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    insertBatch: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([
      { content: 'GMP 第二章 质量管理', sectionPath: '第二章', similarity: 0.85, docId: 1, chunkIndex: 0 },
      { content: '偏差处理规定', sectionPath: '第五章', similarity: 0.72, docId: 1, chunkIndex: 3 },
    ]),
    deleteByDocId: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockResolvedValue(10),
  })),
}));

describe('Retriever', () => {
  let retriever: InstanceType<Awaited<typeof import('../retriever')>['Retriever']>;

  beforeEach(async () => {
    const { Retriever } = await import('../retriever');
    const mockDb = {} as Database.Database;
    retriever = new Retriever(mockDb);
    await retriever.initialize();
  });

  it('should initialize successfully', () => {
    expect(retriever).toBeDefined();
  });

  it('should index documents and return chunk count', async () => {
    const count = await retriever.indexDocument(1, 'Test content for chunking');
    expect(count).toBeGreaterThan(0);
  });

  it('should retrieve relevant chunks', async () => {
    const results = await retriever.retrieve('GMP 质量管理');
    expect(results).toHaveLength(2);
    expect(results[0].similarity).toBe(0.85);
    expect(results[0].content).toBe('GMP 第二章 质量管理');
  });

  it('should filter by minimum similarity', async () => {
    const results = await retriever.retrieve('test', { minSimilarity: 0.8 });
    expect(results).toHaveLength(1);
    expect(results[0].similarity).toBeGreaterThanOrEqual(0.8);
  });

  it('should get regulation context as formatted string', async () => {
    const context = await retriever.getRegulationContext('GMP 偏差处理');
    expect(context).toContain('GMP 第二章 质量管理');
    expect(context).toContain('相似度');
    expect(context).toContain('---');
  });

  it('should delete document vectors', async () => {
    await retriever.deleteDocument(1);
    // Should not throw
  });

  it('should get stats', async () => {
    const stats = await retriever.getStats();
    expect(stats.totalChunks).toBe(10);
    expect(stats.isAvailable).toBe(true);
  });
});
