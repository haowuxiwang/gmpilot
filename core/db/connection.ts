/**
 * SQLite database connection manager.
 * Uses better-sqlite3 with WAL mode for concurrent read/write.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { createLogger } from '../utils/logger';

const log = createLogger('DB');

// 获取 migration 目录路径（兼容打包后的 Electron 环境）
function getMigrationsDir(): string {
  // 开发环境使用项目根目录
  return path.join(process.cwd(), 'core', 'db', 'migrations');
}

let db: Database.Database | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Get or create database connection.
 * @param dbPath Path to SQLite database file. If not provided, uses APP_DATA_DIR/gmpilot.db
 */
export function getDatabase(dbPath?: string): Database.Database {
  if (db) return db;

  const dataDir = process.env.APP_DATA_DIR || path.join(process.cwd(), 'data');
  const resolvedPath = dbPath || path.join(dataDir, 'gmpilot.db');

  // Ensure directory exists
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(resolvedPath);

  // Enable WAL mode for concurrent access (same as AuditBee)
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000'); // 64MB cache

  log.info('Database initialized', { path: resolvedPath, mode: 'WAL' });

  return db;
}

/**
 * Initialize database schema from migration SQL.
 * Uses promise-based guard to prevent concurrent initialization.
 * Supports multiple numbered migration files with version tracking.
 * Resets on failure to allow retry.
 */
export async function initSchema(database?: Database.Database): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const conn = database || getDatabase();
      const migrationsDir = getMigrationsDir();

      // 检查 migrations 目录是否存在
      if (!fs.existsSync(migrationsDir)) {
        log.warn('Migrations directory not found, creating tables directly', { dir: migrationsDir });
        // 如果目录不存在，直接创建表
        conn.exec(`
          CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            deviation_id TEXT,
            deviation_type TEXT DEFAULT 'deviation_analysis',
            content TEXT NOT NULL,
            clue_input TEXT,
            factors_json TEXT,
            regulations_json TEXT,
            findings_json TEXT,
            risk_score INTEGER DEFAULT -1,
            risk_level TEXT DEFAULT 'low',
            report_metadata_json TEXT,
            pdf_path TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS knowledge_docs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            source TEXT NOT NULL,
            content TEXT NOT NULL,
            chunk_count INTEGER DEFAULT 0,
            indexed_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS audit_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id INTEGER NOT NULL,
            auditbee_task_id INTEGER NOT NULL,
            status TEXT DEFAULT 'pending',
            findings_json TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME,
            FOREIGN KEY (report_id) REFERENCES reports(id)
          );

          CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `);
        log.info('Database tables created directly');
        return;
      }

      // Ensure schema_migrations table exists
      conn.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Get already-applied versions
      const applied = new Set(
        (conn.prepare('SELECT version FROM schema_migrations').all() as { version: number }[])
          .map((r) => r.version)
      );

      // Read and sort migration files
      const files = fs.readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort();

      let appliedCount = 0;
      for (const file of files) {
        const version = parseInt(file.split('_')[0], 10);
        if (isNaN(version) || applied.has(version)) continue;

        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
        conn.exec(sql);
        conn.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version);
        appliedCount++;
        log.info(`Migration ${file} applied`, { version });
      }

      if (appliedCount === 0) {
        log.info('Database schema up to date');
      } else {
        log.info(`Applied ${appliedCount} migration(s)`);
      }
    } catch (error) {
      initPromise = null; // Allow retry
      log.error('Failed to initialize schema', {}, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  })();

  return initPromise;
}

/**
 * Close database connection.
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
  initPromise = null;
}

/**
 * Get database path (for IPC responses).
 */
export function getDatabasePath(): string {
  const dataDir = process.env.APP_DATA_DIR || path.join(process.cwd(), 'data');
  return path.join(dataDir, 'gmpilot.db');
}

/**
 * Health check result interface.
 */
export interface DatabaseHealthCheckResult {
  ok: boolean;
  path: string;
  error?: string;
}

/**
 * Perform a health check on the database connection.
 * Verifies that the database file exists and is accessible.
 */
export function checkDatabaseHealth(): DatabaseHealthCheckResult {
  const dbPath = getDatabasePath();

  try {
    const conn = getDatabase();
    // Simple query to verify connection
    conn.prepare('SELECT 1').get();
    return { ok: true, path: dbPath };
  } catch (error) {
    return {
      ok: false,
      path: dbPath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
