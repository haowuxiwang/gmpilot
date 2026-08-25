/**
 * Logger IPC handlers for Electron main process.
 * Forwards renderer-side log entries into the unified file logger.
 */

import { ipcMain } from 'electron';
import { createLogger, type LogLevel } from '../../core/utils/logger';

export interface RendererLogEntry {
  level: LogLevel;
  module: string;
  message: string;
  data?: Record<string, unknown>;
  error?: { message: string; stack?: string };
}

const VALID_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

// 限制渲染端日志大小，防止恶意或异常数据撑爆日志文件
const MAX_MESSAGE_LENGTH = 2000;
const MAX_DATA_JSON_LENGTH = 4000;

function sanitizeData(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    try {
      const json = JSON.stringify(value);
      if (json && json.length > MAX_DATA_JSON_LENGTH) {
        sanitized[key] = `[truncated: ${json.length} chars]`;
      } else {
        sanitized[key] = value;
      }
    } catch {
      sanitized[key] = String(value);
    }
  }
  return sanitized;
}

export function registerLoggerIPC(): void {
  ipcMain.handle('log:forward', (_event, entry: RendererLogEntry) => {
    if (!entry || typeof entry !== 'object') return;

    const level = VALID_LEVELS.includes(entry.level) ? entry.level : 'info';
    const module = typeof entry.module === 'string' && entry.module
      ? `Renderer/${entry.module}`
      : 'Renderer';
    const message = typeof entry.message === 'string'
      ? entry.message.slice(0, MAX_MESSAGE_LENGTH)
      : String(entry.message);

    const log = createLogger(module);
    const data = entry.data && typeof entry.data === 'object'
      ? sanitizeData(entry.data)
      : undefined;

    const error = entry.error && typeof entry.error.message === 'string'
      ? new Error(entry.error.message)
      : undefined;
    if (error?.message) {
      error.stack = typeof entry.error.stack === 'string' ? entry.error.stack : undefined;
    }

    if (error) {
      log[level](message, data, error);
    } else {
      log[level](message, data);
    }
  });

  const log = createLogger('Logger');
  log.info('Logger IPC handlers registered');
}
