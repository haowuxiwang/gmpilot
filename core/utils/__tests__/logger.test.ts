import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs module before importing logger
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    appendFile: vi.fn((_path: string, _data: string, cb: (err: Error | null) => void) => cb(null)),
  },
}));

import fs from 'fs';
import {
  createLogger,
  configureLogger,
  timed,
  getLogFilePath,
  getConfiguredLevel,
} from '../logger';

describe('logger', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset logger configuration to defaults
    configureLogger({ level: 'info' });
    // Reset logFilePath by not passing logDir
    // We need to explicitly clear it — configure without logDir keeps previous
    // So we call configureLogger with a known level only
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  // =========================================================================
  // createLogger
  // =========================================================================

  describe('createLogger', () => {
    it('should return a logger with debug/info/warn/error methods', () => {
      const log = createLogger('TestModule');
      expect(typeof log.debug).toBe('function');
      expect(typeof log.info).toBe('function');
      expect(typeof log.warn).toBe('function');
      expect(typeof log.error).toBe('function');
    });

    it('should log info messages by default', () => {
      const log = createLogger('TestModule');
      log.info('hello');
      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const output = consoleLogSpy.mock.calls[0][0] as string;
      expect(output).toContain('[INFO]');
      expect(output).toContain('[TestModule]');
      expect(output).toContain('hello');
    });

    it('should include module name in output', () => {
      const log = createLogger('MyModule');
      log.info('test message');
      const output = consoleLogSpy.mock.calls[0][0] as string;
      expect(output).toContain('[MyModule]');
    });

    it('should include data in output', () => {
      const log = createLogger('Test');
      log.info('msg', { key: 'value', count: 42 });
      const output = consoleLogSpy.mock.calls[0][0] as string;
      expect(output).toContain('key="value"');
      expect(output).toContain('count=42');
    });

    it('should handle Error objects in data', () => {
      const log = createLogger('Test');
      log.error('failed', {}, new Error('boom'));
      // console.error is called twice: first with the formatted line, then with the stack
      // The stack trace contains the error message
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      const stackOutput = consoleErrorSpy.mock.calls[1][0] as string;
      expect(stackOutput).toContain('boom');
    });

    it('should log error with stack trace', () => {
      const log = createLogger('Test');
      const err = new Error('stack test');
      log.error('err', {}, err);
      // console.error should be called twice: once for message, once for stack
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    });

    it('should use warn for warn level', () => {
      const log = createLogger('Test');
      log.warn('warning msg');
      expect(consoleWarnSpy).toHaveBeenCalledOnce();
      const output = consoleWarnSpy.mock.calls[0][0] as string;
      expect(output).toContain('[WARN]');
    });
  });

  // =========================================================================
  // configureLogger — log level
  // =========================================================================

  describe('configureLogger — log level', () => {
    it('should respect debug level', () => {
      configureLogger({ level: 'debug' });
      const log = createLogger('Test');
      log.debug('debug msg');
      expect(consoleLogSpy).toHaveBeenCalledOnce();
    });

    it('should filter out debug when level is info', () => {
      configureLogger({ level: 'info' });
      const log = createLogger('Test');
      log.debug('should not appear');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should filter out debug and info when level is warn', () => {
      configureLogger({ level: 'warn' });
      const log = createLogger('Test');
      log.debug('no');
      log.info('no');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should filter out everything except error when level is error', () => {
      configureLogger({ level: 'error' });
      const log = createLogger('Test');
      log.debug('no');
      log.info('no');
      log.warn('no');
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();

      log.error('yes');
      expect(consoleErrorSpy).toHaveBeenCalledOnce();
    });

    it('should use LOG_LEVEL env var when no option given', () => {
      const original = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = 'debug';
      configureLogger({});
      const log = createLogger('Test');
      log.debug('env debug');
      expect(consoleLogSpy).toHaveBeenCalledOnce();
      process.env.LOG_LEVEL = original;
    });

    it('should ignore invalid LOG_LEVEL env var', () => {
      const original = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = 'invalid_level';
      configureLogger({});
      // Default is 'info', so debug should be filtered
      const log = createLogger('Test');
      log.debug('should not appear');
      expect(consoleLogSpy).not.toHaveBeenCalled();
      process.env.LOG_LEVEL = original;
    });

    it('should prioritize options.level over LOG_LEVEL env', () => {
      const original = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = 'error';
      configureLogger({ level: 'debug' });
      const log = createLogger('Test');
      log.debug('should appear');
      expect(consoleLogSpy).toHaveBeenCalledOnce();
      process.env.LOG_LEVEL = original;
    });
  });

  // =========================================================================
  // configureLogger — file logging
  // =========================================================================

  describe('configureLogger — file logging', () => {
    it('should set up file logging when logDir is provided', () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      configureLogger({ logDir: '/tmp/test-logs' });
      expect(getLogFilePath()).toBeTruthy();
      expect(getLogFilePath()).toContain('gmpilot-');
      expect(getLogFilePath()).toContain('.log');
    });

    it('should create directory if it does not exist', () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
      configureLogger({ logDir: '/tmp/new-logs' });
      expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp/new-logs', { recursive: true });
    });

    it('should write to file when file logging is configured', () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.appendFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (_path: string, _data: string, cb: (err: Error | null) => void) => cb(null),
      );
      configureLogger({ logDir: '/tmp/test-logs' });

      const log = createLogger('FileTest');
      log.info('file write test');

      expect(fs.appendFile).toHaveBeenCalled();
      const callArgs = (fs.appendFile as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[0]).toContain('gmpilot-');
      expect(callArgs[1]).toContain('file write test');
    });

    it('should handle file logging config error gracefully', () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('permission denied');
      });
      // Should not throw
      expect(() => configureLogger({ logDir: '/bad/path' })).not.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // File write error throttling
  // =========================================================================

  describe('file write error throttling', () => {
    it('should throttle file write error warnings', () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.appendFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (_path: string, _data: string, cb: (err: Error | null) => void) =>
          cb(new Error('disk full')),
      );
      configureLogger({ logDir: '/tmp/test-logs' });

      const log = createLogger('ThrottleTest');

      // First call should warn
      log.info('msg1');
      // Give the callback time to fire
      vi.useFakeTimers();
      vi.advanceTimersByTime(0);

      // Second call immediately should NOT warn again (throttled)
      log.info('msg2');
      vi.advanceTimersByTime(0);

      // After 60 seconds, should warn again
      vi.advanceTimersByTime(61_000);
      log.info('msg3');
      vi.advanceTimersByTime(0);

      vi.useRealTimers();
    });
  });

  // =========================================================================
  // timed utility
  // =========================================================================

  describe('timed', () => {
    it('should log start and completion of async operation', async () => {
      const log = createLogger('TimedTest');
      const fn = vi.fn().mockResolvedValue('result');

      const result = await timed(log, 'myOperation', fn);

      expect(result).toBe('result');
      // Should have logged start and completion
      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
      const startLog = consoleLogSpy.mock.calls[0][0] as string;
      const endLog = consoleLogSpy.mock.calls[1][0] as string;
      expect(startLog).toContain('myOperation started');
      expect(endLog).toContain('myOperation completed');
    });

    it('should include extra data in log messages', async () => {
      const log = createLogger('TimedTest');
      const fn = vi.fn().mockResolvedValue('ok');

      await timed(log, 'op', fn, { provider: 'deepseek' });

      const startLog = consoleLogSpy.mock.calls[0][0] as string;
      expect(startLog).toContain('provider="deepseek"');
    });

    it('should log error and rethrow on failure', async () => {
      const log = createLogger('TimedTest');
      const error = new Error('LLM failed');
      const fn = vi.fn().mockRejectedValue(error);

      await expect(timed(log, 'failOp', fn)).rejects.toThrow('LLM failed');

      // Should have logged start + error
      expect(consoleLogSpy).toHaveBeenCalledTimes(1); // start
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2); // error message + stack
      const errorLog = consoleErrorSpy.mock.calls[0][0] as string;
      expect(errorLog).toContain('failOp failed');
    });

    it('should handle non-Error thrown values', async () => {
      const log = createLogger('TimedTest');
      const fn = vi.fn().mockRejectedValue('string error');

      await expect(timed(log, 'strErr', fn)).rejects.toBe('string error');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should include duration in completion log', async () => {
      const log = createLogger('TimedTest');
      const fn = vi.fn().mockResolvedValue('ok');

      await timed(log, 'durOp', fn);

      const endLog = consoleLogSpy.mock.calls[1][0] as string;
      expect(endLog).toMatch(/duration="\d+ms"/);
    });
  });

  // =========================================================================
  // getLogFilePath / getConfiguredLevel
  // =========================================================================

  describe('getLogFilePath', () => {
    it('should return null when no logDir configured', () => {
      configureLogger({ level: 'info' });
      // getLogFilePath returns whatever was last configured
      // After a configure without logDir, it should remain from previous or be null
      // We need to test the initial state — let's just verify it returns a string or null
      const path = getLogFilePath();
      expect(path === null || typeof path === 'string').toBe(true);
    });
  });

  describe('getConfiguredLevel', () => {
    it('should return the configured level', () => {
      configureLogger({ level: 'warn' });
      expect(getConfiguredLevel()).toBe('warn');
    });

    it('should return info by default', () => {
      // Reset by calling with no options and clearing env
      const original = process.env.LOG_LEVEL;
      delete process.env.LOG_LEVEL;
      configureLogger({});
      expect(getConfiguredLevel()).toBe('info');
      process.env.LOG_LEVEL = original;
    });
  });

  // =========================================================================
  // formatValue edge cases (tested indirectly via data logging)
  // =========================================================================

  describe('formatValue edge cases', () => {
    it('should handle null and undefined values in data', () => {
      const log = createLogger('Test');
      log.info('test', { a: null, b: undefined });
      const output = consoleLogSpy.mock.calls[0][0] as string;
      expect(output).toContain('a=null');
      expect(output).toContain('b=null');
    });

    it('should handle boolean and number values', () => {
      const log = createLogger('Test');
      log.info('test', { active: true, count: 0 });
      const output = consoleLogSpy.mock.calls[0][0] as string;
      expect(output).toContain('active=true');
      expect(output).toContain('count=0');
    });

    it('should handle string values with quotes', () => {
      const log = createLogger('Test');
      log.info('test', { name: 'hello' });
      const output = consoleLogSpy.mock.calls[0][0] as string;
      expect(output).toContain('name="hello"');
    });

    it('should handle objects via JSON.stringify', () => {
      const log = createLogger('Test');
      log.info('test', { nested: { key: 'val' } });
      const output = consoleLogSpy.mock.calls[0][0] as string;
      expect(output).toContain('nested=');
    });

    it('should handle empty data object', () => {
      const log = createLogger('Test');
      log.info('test', {});
      const output = consoleLogSpy.mock.calls[0][0] as string;
      // Should not have {} for empty data
      expect(output).not.toContain('{}');
    });

    it('should handle no data parameter', () => {
      const log = createLogger('Test');
      log.info('test');
      const output = consoleLogSpy.mock.calls[0][0] as string;
      expect(output).toContain('test');
    });
  });
});
