import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';

// Mock dependencies
const mockEmbed = vi.fn().mockResolvedValue([[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]]);
const mockSearch = vi.fn().mockResolvedValue([
  { content: 'GMP 第二章 质量管理', sectionPath: '第二章', similarity: 0.85, docId: 1, chunkIndex: 0 },
  { content: '偏差处理规定', sectionPath: '第五章', similarity: 0.72, docId: 1, chunkIndex: 3 },
]);
const mockSearchByDocIds = vi.fn().mockResolvedValue([
  { content: 'SOP 操作规程', sectionPath: '第三章', similarity: 0.9, docId: 5, chunkIndex: 0 },
  { content: '法规条款匹配', sectionPath: '第四章', similarity: 0.6, docId: 6, chunkIndex: 1 },
]);
const mockCount = vi.fn().mockResolvedValue(10);

vi.mock('../embedder', () => ({
  createEmbeddingProvider: vi.fn().mockReturnValue({
    name: 'mock',
    dimensions: 8,
    embed: (...args: unknown[]) => mockEmbed(...args),
    isAvailable: vi.fn().mockReturnValue(true),
  }),
}));

vi.mock('../store', () => ({
  VectorStore: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    insertBatch: vi.fn().mockResolvedValue(undefined),
    search: (...args: unknown[]) => mockSearch(...args),
    searchByDocIds: (...args: unknown[]) => mockSearchByDocIds(...args),
    deleteByDocId: vi.fn().mockResolvedValue(undefined),
    count: (...args: unknown[]) => mockCount(...args),
  })),
}));

vi.mock('../../db/schema', () => ({
  getKnowledgeDocIdsByCategories: vi.fn().mockReturnValue([5, 6]),
}));

describe('Retriever', () => {
  let retriever: InstanceType<Awaited<typeof import('../retriever')>['Retriever']>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockEmbed.mockResolvedValue([[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]]);
    mockSearch.mockResolvedValue([
      { content: 'GMP 第二章 质量管理', sectionPath: '第二章', similarity: 0.85, docId: 1, chunkIndex: 0 },
      { content: '偏差处理规定', sectionPath: '第五章', similarity: 0.72, docId: 1, chunkIndex: 3 },
    ]);
    mockSearchByDocIds.mockResolvedValue([
      { content: 'SOP 操作规程', sectionPath: '第三章', similarity: 0.9, docId: 5, chunkIndex: 0 },
      { content: '法规条款匹配', sectionPath: '第四章', similarity: 0.6, docId: 6, chunkIndex: 1 },
    ]);
    mockCount.mockResolvedValue(10);

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

  it('should return 0 for empty content indexing', async () => {
    const count = await retriever.indexDocument(1, '');
    expect(count).toBe(0);
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

  it('should truncate overly long queries', async () => {
    const longQuery = 'A'.repeat(3000);
    const results = await retriever.retrieve(longQuery);
    // Should still work (truncated to 2000 chars)
    expect(results).toBeDefined();
    // Verify embed was called with truncated text
    expect(mockEmbed).toHaveBeenCalledWith([expect.stringMatching(/^A{2000}$/)]);
  });

  it('should dedup chunks from same doc with similar scores', async () => {
    mockSearch.mockResolvedValue([
      { content: 'Chunk A', sectionPath: 'S1', similarity: 0.85, docId: 1, chunkIndex: 0 },
      { content: 'Chunk B', sectionPath: 'S2', similarity: 0.83, docId: 1, chunkIndex: 1 },
      { content: 'Chunk C', sectionPath: 'S3', similarity: 0.70, docId: 2, chunkIndex: 0 },
    ]);
    const results = await retriever.retrieve('test', { minSimilarity: 0.1 });
    // Chunk A and B are from same doc with similarity diff < 0.05 → dedup keeps only A
    expect(results).toHaveLength(2);
    expect(results[0].content).toBe('Chunk A');
    expect(results[1].content).toBe('Chunk C');
  });

  it('should return empty when no results pass minSimilarity', async () => {
    mockSearch.mockResolvedValue([
      { content: 'Low score', sectionPath: 'S', similarity: 0.05, docId: 1, chunkIndex: 0 },
    ]);
    const results = await retriever.retrieve('test', { minSimilarity: 0.5 });
    expect(results).toHaveLength(0);
  });

  it('should get regulation context as formatted string', async () => {
    const context = await retriever.getRegulationContext('GMP 偏差处理');
    expect(context).toContain('GMP 第二章 质量管理');
    expect(context).toContain('相似度');
    expect(context).toContain('---');
  });

  it('should return fallback message when no regulation context found', async () => {
    mockSearch.mockResolvedValue([]);
    const context = await retriever.getRegulationContext('不存在的查询');
    expect(context).toBe('（未找到相关法规条款）');
  });

  it('should get audit context with category filtering', async () => {
    const context = await retriever.getAuditContext('SOP 操作');
    expect(context).toContain('SOP 操作规程');
    expect(context).toContain('相似度');
  });

  it('should return fallback message when no audit context found', async () => {
    mockSearchByDocIds.mockResolvedValue([]);
    const context = await retriever.getAuditContext('不存在的查询');
    expect(context).toBe('（未找到相关SOP/法规条款）');
  });

  it('should retrieve by categories', async () => {
    const results = await retriever.retrieve('SOP', { categories: ['sop', 'regulation'] });
    expect(results.length).toBeGreaterThan(0);
    expect(mockSearchByDocIds).toHaveBeenCalled();
  });

  it('should return empty for categories with no matching docs', async () => {
    const { getKnowledgeDocIdsByCategories } = await import('../../db/schema');
    (getKnowledgeDocIdsByCategories as ReturnType<typeof vi.fn>).mockReturnValueOnce([]);
    const results = await retriever.retrieve('test', { categories: ['nonexistent'] });
    expect(results).toEqual([]);
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

  it('should handle stats error gracefully', async () => {
    mockCount.mockRejectedValueOnce(new Error('DB error'));
    const stats = await retriever.getStats();
    expect(stats.totalChunks).toBe(0);
    expect(stats.isAvailable).toBe(false);
  });
});
