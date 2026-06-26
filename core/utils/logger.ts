/**
 * Unified logger for GMPilot.
 *
 * Features:
 * - Log levels: debug, info, warn, error
 * - LOG_LEVEL environment variable support
 * - File logging support
 * - ISO timestamps
 * - Structured data formatting
 *
 * Usage:
 *   import { createLogger, configureLogger } from '../utils/logger';
 *
 *   // Configure once at startup
 *   configureLogger({ level: 'debug', logDir: './logs' });
 *
 *   // Use in any module
 *   const log = createLogger('LLM');
 *   log.debug('Raw response', { tokens: 150 });
 *   log.info('analyzeClue completed', { duration: '2.3s', tokens: 150 });
 *   log.warn('Retry attempt', { attempt: 1, maxRetries: 2 });
 *   log.error('Auth failed', { provider: 'deepseek' }, error);
 */

import fs from 'fs';
import path from 'path';

// ============================================================================
// Types
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>, error?: Error): void;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: Record<string, unknown>;
  error?: Error;
}

// ============================================================================
// Configuration
// ============================================================================

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let configuredLevel: LogLevel = 'info';
let logFilePath: string | null = null;

export interface LoggerConfig {
  level?: LogLevel;
  logDir?: string;
}

export function configureLogger(options: LoggerConfig = {}) {
  // Set log level from options or environment
  if (options.level) {
    configuredLevel = options.level;
  } else if (process.env.LOG_LEVEL) {
    const envLevel = process.env.LOG_LEVEL.toLowerCase() as LogLevel;
    if (envLevel in LOG_LEVEL_PRIORITY) {
      configuredLevel = envLevel;
    }
  }

  // Set up file logging
  if (options.logDir) {
    try {
      const logDir = options.logDir;
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      // Clean up old log files (keep last 7 days)
      cleanUpOldLogs(logDir);

      const date = new Date().toISOString().slice(0, 10);
      logFilePath = path.join(logDir, `gmpilot-${date}.log`);
    } catch (error) {
      console.error('[Logger] Failed to configure file logging:', error);
    }
  }
}

/**
 * Clean up log files older than 7 days.
 */
function cleanUpOldLogs(logDir: string): void {
  try {
    const files = fs.readdirSync(logDir);
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

    for (const file of files) {
      if (!file.startsWith('gmpilot-') || !file.endsWith('.log')) {
        continue;
      }

      const filePath = path.join(logDir, file);
      const stats = fs.statSync(filePath);

      // Check if file is older than 7 days
      if (now - stats.mtimeMs > maxAge) {
        fs.unlinkSync(filePath);
        console.log(`[Logger] Cleaned up old log file: ${file}`);
      }
    }
  } catch (error) {
    console.error('[Logger] Failed to clean up old logs:', error);
  }
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[configuredLevel];
}

// ============================================================================
// Formatting
// ============================================================================

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return `"${v}"`;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Error) return `"${v.message}"`;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function formatData(data?: Record<string, unknown>): string {
  if (!data || Object.keys(data).length === 0) return '';
  const pairs = Object.entries(data).map(([k, v]) => `${k}=${formatValue(v)}`);
  return ` {${pairs.join(', ')}}`;
}

function formatEntry(entry: LogEntry): string {
  const level = entry.level.toUpperCase().padEnd(5);
  const timestamp = entry.timestamp;
  const module = `[${entry.module}]`;
  const data = formatData(entry.data);

  let line = `${timestamp} ${level} ${module} ${entry.message}${data}`;

  if (entry.error) {
    line += ` error="${entry.error.message}"`;
    if (entry.error.stack) {
      line += `\n${entry.error.stack}`;
    }
  }

  return line;
}

// ============================================================================
// Output
// ============================================================================

let lastFileWriteError = 0;

// Max log file size: 10MB
const MAX_LOG_FILE_SIZE = 10 * 1024 * 1024;

function writeToFile(formatted: string) {
  if (!logFilePath) return;

  // Check file size and rotate if needed
  try {
    const stats = fs.statSync(logFilePath);
    if (stats.size > MAX_LOG_FILE_SIZE) {
      // Create a new log file with timestamp
      const dir = path.dirname(logFilePath);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      logFilePath = path.join(dir, `gmpilot-${timestamp}.log`);
    }
  } catch {
    // File doesn't exist yet, that's fine
  }

  // 使用异步写入，避免阻塞事件循环
  fs.appendFile(logFilePath, formatted + '\n', (err) => {
    if (err) {
      // 节流警告：最多每 60 秒输出一次文件写入错误
      const now = Date.now();
      if (now - lastFileWriteError > 60_000) {
        lastFileWriteError = now;
        console.warn('[Logger] Failed to write to log file:', err.message);
      }
    }
  });
}

function writeToConsole(entry: LogEntry) {
  const formatted = `${formatTimestamp()} [${entry.level.toUpperCase()}] [${entry.module}] ${entry.message}${formatData(entry.data)}`;

  switch (entry.level) {
    case 'debug':
    case 'info':
      console.log(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    case 'error':
      console.error(formatted);
      if (entry.error?.stack) {
        console.error(entry.error.stack);
      }
      break;
  }
}

function writeLog(entry: LogEntry) {
  writeToConsole(entry);

  if (logFilePath) {
    writeToFile(formatEntry(entry));
  }
}

// ============================================================================
// Logger Factory
// ============================================================================

export function createLogger(module: string): Logger {
  return {
    debug(message: string, data?: Record<string, unknown>) {
      if (shouldLog('debug')) {
        writeLog({ timestamp: formatTimestamp(), level: 'debug', module, message, data });
      }
    },

    info(message: string, data?: Record<string, unknown>) {
      if (shouldLog('info')) {
        writeLog({ timestamp: formatTimestamp(), level: 'info', module, message, data });
      }
    },

    warn(message: string, data?: Record<string, unknown>) {
      if (shouldLog('warn')) {
        writeLog({ timestamp: formatTimestamp(), level: 'warn', module, message, data });
      }
    },

    error(message: string, data?: Record<string, unknown>, error?: Error) {
      if (shouldLog('error')) {
        writeLog({ timestamp: formatTimestamp(), level: 'error', module, message, data, error });
      }
    },
  };
}

// ============================================================================
// Utility: Timed Execution
// ============================================================================

/**
 * Measure execution time of an async operation.
 *
 * Usage:
 *   const result = await timed(log, 'analyzeClue', () => callLLM(...));
 *   const result = await timed(log, 'analyzeClue', () => callLLM(...), { provider: 'deepseek' });
 */
export async function timed<T>(
  log: Logger,
  operation: string,
  fn: () => Promise<T>,
  data?: Record<string, unknown>,
): Promise<T> {
  const start = Date.now();
  log.info(`${operation} started`, data);

  try {
    const result = await fn();
    const duration = Date.now() - start;
    log.info(`${operation} completed`, { ...data, duration: `${duration}ms` });
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    const err = error instanceof Error ? error : new Error(String(error));
    log.error(`${operation} failed`, { ...data, duration: `${duration}ms` }, err);
    throw error;
  }
}

// ============================================================================
// Utility: Log Rotation (simple date-based)
// ============================================================================

/**
 * Get current log file path (for testing/debugging).
 */
export function getLogFilePath(): string | null {
  return logFilePath;
}

/**
 * Get configured log level (for testing/debugging).
 */
export function getConfiguredLevel(): LogLevel {
  return configuredLevel;
}
