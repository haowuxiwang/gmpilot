import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';

describe('getDatabase', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should use APP_DATA_DIR when set', async () => {
    process.env.APP_DATA_DIR = '/tmp/gmpilot-test';
    const { getDatabasePath } = await import('../connection');
    const dbPath = getDatabasePath();
    expect(dbPath).toBe(path.join('/tmp/gmpilot-test', 'gmpilot.db'));
  });

  it('should default to data/ directory', async () => {
    delete process.env.APP_DATA_DIR;
    const { getDatabasePath } = await import('../connection');
    const dbPath = getDatabasePath();
    expect(dbPath).toContain('gmpilot.db');
    expect(dbPath).toContain('data');
  });
});
