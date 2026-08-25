import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import Database from 'better-sqlite3';

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

describe('initSchema', () => {
  it('should create tables via migrations', async () => {
    vi.resetModules();
    const { initSchema } = await import('../connection');
    const db = new Database(':memory:');

    await initSchema(db);

    // Verify tables exist
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];
    const tableNames = tables.map(t => t.name);

    expect(tableNames).toContain('settings');
    expect(tableNames).toContain('reports');
    expect(tableNames).toContain('knowledge_docs');
    expect(tableNames).toContain('audit_tasks');
    expect(tableNames).toContain('workflow_checkpoints');
    expect(tableNames).toContain('schema_migrations');

    db.close();
  });

  it('should apply migrations idempotently', async () => {
    vi.resetModules();
    const { initSchema } = await import('../connection');
    const db = new Database(':memory:');

    // Run twice - should not throw
    await initSchema(db);
    // Reset the initPromise to allow re-init
    vi.resetModules();
    const { initSchema: initSchema2 } = await import('../connection');
    await initSchema2(db);

    // Verify migration versions recorded
    const migrations = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as { version: number }[];
    expect(migrations.length).toBeGreaterThanOrEqual(3);

    db.close();
  });

  it('should create tables directly when migrations dir missing', async () => {
    vi.resetModules();
    // Mock getMigrationsPath to return non-existent dir
    vi.doMock('../../utils/paths', async (importOriginal) => {
      const original = await importOriginal<typeof import('../../utils/paths')>();
      return {
        ...original,
        getMigrationsPath: () => '/nonexistent/migrations',
      };
    });

    const { initSchema } = await import('../connection');
    const db = new Database(':memory:');

    await initSchema(db);

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];
    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('settings');
    expect(tableNames).toContain('reports');

    db.close();
    vi.doUnmock('../../utils/paths');
  });
});

describe('closeDatabase', () => {
  it('should close without error when no db open', async () => {
    vi.resetModules();
    const { closeDatabase } = await import('../connection');
    expect(() => closeDatabase()).not.toThrow();
  });
});

describe('getDatabase', () => {
  const originalEnv = process.env;
  const testDbPath = path.join('/tmp', `gmpilot-test-${Date.now()}`, 'test.db');

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should create database and parent directory', async () => {
    const { getDatabase, closeDatabase } = await import('../connection');

    const db = getDatabase(testDbPath);

    expect(db).toBeDefined();
    expect(db.open).toBe(true);

    // Verify WAL mode is enabled
    const journalMode = db.pragma('journal_mode', { simple: true });
    expect(journalMode).toBe('wal');

    closeDatabase();
  });

  it('should return same instance on subsequent calls', async () => {
    const { getDatabase, closeDatabase } = await import('../connection');

    const db1 = getDatabase(testDbPath);
    const db2 = getDatabase(testDbPath);

    expect(db1).toBe(db2);

    closeDatabase();
  });
});
