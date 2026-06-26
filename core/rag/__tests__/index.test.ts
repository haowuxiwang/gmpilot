import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';

// Mock the Retriever class
vi.mock('../retriever', () => ({
  Retriever: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    retrieve: vi.fn().mockResolvedValue([]),
    getRegulationContext: vi.fn().mockResolvedValue('mock context'),
    deleteDocument: vi.fn().mockResolvedValue(undefined),
    getStats: vi.fn().mockResolvedValue({ totalChunks: 0, isAvailable: true }),
  })),
}));

// Need to reset module state between tests
beforeEach(() => {
  vi.resetModules();
});

describe('RAG index singleton', () => {
  it('should throw when not initialized', async () => {
    const { getRetriever } = await import('../index');
    expect(() => getRetriever()).toThrow('Retriever not initialized');
  });

  it('should report unavailable when not initialized', async () => {
    const { isRetrieverAvailable } = await import('../index');
    expect(isRetrieverAvailable()).toBe(false);
  });

  it('should initialize and return retriever', async () => {
    const { initRetriever, getRetriever, isRetrieverAvailable } = await import('../index');
    const mockDb = {} as Database.Database;
    const retriever = await initRetriever(mockDb);

    expect(retriever).toBeDefined();
    expect(isRetrieverAvailable()).toBe(true);
    expect(getRetriever()).toBe(retriever);
  });

  it('should return same instance for same database', async () => {
    const { initRetriever } = await import('../index');
    const mockDb = {} as Database.Database;
    const r1 = await initRetriever(mockDb);
    const r2 = await initRetriever(mockDb);
    expect(r1).toBe(r2);
  });
});
