/**
 * Frontend logger utility.
 * Logs to console and optionally forwards to main process via IPC.
 * Includes global error capture for unhandled errors.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let minLevel: LogLevel = 'info';

// 防止转发失败（如测试环境无 window.gmpilot）时抛出异常
function forwardToMain(level: LogLevel, module: string, message: string, data?: Record<string, unknown>): void {
  try {
    const api = typeof window !== 'undefined' ? window.gmpilot : undefined;
    if (!api?.log?.forward) return;
    // Fire-and-forget，不阻塞渲染线程
    api.log.forward({ level, module, message, data }).catch(() => {
      /* 转发失败不影响渲染端运行 */
    });
  } catch {
    /* 同口径，静默忽略 */
  }
}

/**
 * Create a logger for a specific module.
 */
export function createLogger(module: string) {
  const log = (level: LogLevel, message: string, data?: Record<string, unknown>) => {
    if (LOG_LEVELS[level] < LOG_LEVELS[minLevel]) return;

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [${module}]`;

    switch (level) {
      case 'debug':
        console.debug(prefix, message, data || '');
        break;
      case 'info':
        console.info(prefix, message, data || '');
        break;
      case 'warn':
        console.warn(prefix, message, data || '');
        break;
      case 'error':
        console.error(prefix, message, data || '');
        break;
    }

    forwardToMain(level, module, message, data);
  };

  return {
    debug: (message: string, data?: Record<string, unknown>) => log('debug', message, data),
    info: (message: string, data?: Record<string, unknown>) => log('info', message, data),
    warn: (message: string, data?: Record<string, unknown>) => log('warn', message, data),
    error: (message: string, data?: Record<string, unknown>) => log('error', message, data),
  };
}

/**
 * Set minimum log level.
 */
export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

/**
 * Initialize global error capture.
 * Call this once at app startup.
 */
export function initGlobalErrorCapture(): void {
  const log = createLogger('GlobalError');

  // Capture unhandled errors
  window.addEventListener('error', (event) => {
    log.error('Unhandled error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;

    log.error('Unhandled promise rejection', {
      message,
      stack: stack?.substring(0, 500),
    });
  });

  log.info('Global error capture initialized');
}
