/**
 * Unit tests for Feishu (Lark) notification client.
 */

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import {
  getTenantAccessToken,
  clearTokenCache,
  sendTextMessage,
  sendCardMessage,
  sendReportNotification,
  testConnection,
  validateConfig,
  type FeishuConfig,
} from '../feishu-client';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock logger
vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const validConfig: FeishuConfig = {
  appId: 'cli_test123',
  appSecret: 'secret_abc',
  receiveIdType: 'open_id',
  receiveId: 'ou_user123',
  enabled: true,
};

describe('Feishu Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearTokenCache();
  });

  afterEach(() => {
    clearTokenCache();
  });

  afterAll(() => {
    // 单线程模式下全局 fetch stub 会泄漏到后续测试文件（如真实 LLM 网络测试），必须恢复
    vi.unstubAllGlobals();
  });

  // ==========================================================================
  // validateConfig
  // ==========================================================================

  describe('validateConfig', () => {
    it('should return valid for complete config', () => {
      const result = validateConfig(validConfig);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject empty appId', () => {
      const result = validateConfig({ ...validConfig, appId: '' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('App ID');
    });

    it('should reject empty appSecret', () => {
      const result = validateConfig({ ...validConfig, appSecret: '' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('App Secret');
    });

    it('should reject empty receiveId', () => {
      const result = validateConfig({ ...validConfig, receiveId: '' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('接收者 ID');
    });

    it('should reject invalid receiveIdType', () => {
      const result = validateConfig({ ...validConfig, receiveIdType: 'invalid' as never });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('ID 类型');
    });

    it('should accept all valid receiveIdTypes', () => {
      for (const type of ['open_id', 'chat_id', 'user_id', 'email']) {
        const result = validateConfig({ ...validConfig, receiveIdType: type as never });
        expect(result.valid).toBe(true);
      }
    });
  });

  // ==========================================================================
  // getTenantAccessToken
  // ==========================================================================

  describe('getTenantAccessToken', () => {
    it('should fetch and return token on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          msg: 'ok',
          tenant_access_token: 't-token123',
          expire: 7200,
        }),
      });

      const token = await getTenantAccessToken('cli_test', 'secret');
      expect(token).toBe('t-token123');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Verify request body
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('tenant_access_token/internal');
      const body = JSON.parse(options.body);
      expect(body.app_id).toBe('cli_test');
      expect(body.app_secret).toBe('secret');
    });

    it('should cache token on subsequent calls', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          msg: 'ok',
          tenant_access_token: 't-cached',
          expire: 7200,
        }),
      });

      const token1 = await getTenantAccessToken('cli_test', 'secret');
      const token2 = await getTenantAccessToken('cli_test', 'secret');

      expect(token1).toBe('t-cached');
      expect(token2).toBe('t-cached');
      expect(mockFetch).toHaveBeenCalledTimes(1); // Only one HTTP call
    });

    it('should throw on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      await expect(getTenantAccessToken('cli_test', 'secret')).rejects.toThrow('HTTP 500');
    });

    it('should throw on API error code', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 10003, msg: 'invalid app_id' }),
      });

      await expect(getTenantAccessToken('cli_bad', 'secret')).rejects.toThrow('invalid app_id');
    });

    it('should re-fetch after clearTokenCache', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 0,
          msg: 'ok',
          tenant_access_token: 't-new',
          expire: 7200,
        }),
      });

      await getTenantAccessToken('cli_test', 'secret');
      clearTokenCache();
      await getTenantAccessToken('cli_test', 'secret');

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // ==========================================================================
  // sendTextMessage
  // ==========================================================================

  describe('sendTextMessage', () => {
    it('should send text message successfully', async () => {
      // First call: token, second call: message
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ code: 0, tenant_access_token: 't-1', expire: 7200 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ code: 0, msg: 'ok' }),
        });

      await expect(sendTextMessage(validConfig, 'Hello')).resolves.toBeUndefined();

      // Verify message request
      const [url, options] = mockFetch.mock.calls[1];
      expect(url).toContain('receive_id_type=open_id');
      expect(options.headers.Authorization).toBe('Bearer t-1');
      const body = JSON.parse(options.body);
      expect(body.receive_id).toBe('ou_user123');
      expect(body.msg_type).toBe('text');
      expect(JSON.parse(body.content).text).toBe('Hello');
    });

    it('should throw on send failure', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ code: 0, tenant_access_token: 't-1', expire: 7200 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ code: 230001, msg: 'bot not in chat' }),
        });

      await expect(sendTextMessage(validConfig, 'Hello')).rejects.toThrow('bot not in chat');
    });
  });

  // ==========================================================================
  // sendCardMessage
  // ==========================================================================

  describe('sendCardMessage', () => {
    it('should send card message with fields', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ code: 0, tenant_access_token: 't-1', expire: 7200 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ code: 0, msg: 'ok' }),
        });

      await sendCardMessage(validConfig, {
        title: 'Test Card',
        content: '**Bold** content',
        fields: [{ label: 'Key', value: 'Value' }],
        color: 'red',
      });

      const [, options] = mockFetch.mock.calls[1];
      const body = JSON.parse(options.body);
      expect(body.msg_type).toBe('interactive');

      const card = JSON.parse(body.content);
      expect(card.header.title.content).toBe('Test Card');
      expect(card.header.template).toBe('red');
      expect(card.elements[0].text.content).toBe('**Bold** content');
      expect(card.elements[1].fields[0].text.content).toContain('Key');
    });

    it('should default to blue color', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ code: 0, tenant_access_token: 't-1', expire: 7200 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ code: 0, msg: 'ok' }),
        });

      await sendCardMessage(validConfig, { title: 'No Color', content: 'text' });

      const [, options] = mockFetch.mock.calls[1];
      const card = JSON.parse(JSON.parse(options.body).content);
      expect(card.header.template).toBe('blue');
    });
  });

  // ==========================================================================
  // sendReportNotification
  // ==========================================================================

  describe('sendReportNotification', () => {
    it('should send report notification with risk mapping', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ code: 0, tenant_access_token: 't-1', expire: 7200 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ code: 0, msg: 'ok' }),
        });

      await sendReportNotification(validConfig, {
        deviationId: 'DEV-ABC123',
        title: '温度偏差',
        riskLevel: 'high',
        riskScore: 85,
        summary: '冷库温度超标',
      });

      const [, options] = mockFetch.mock.calls[1];
      const card = JSON.parse(JSON.parse(options.body).content);
      expect(card.header.template).toBe('red');
      expect(card.header.title.content).toContain('DEV-ABC123'.length > 0 ? '温度偏差' : '');
    });

    it('should handle missing riskLevel gracefully', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ code: 0, tenant_access_token: 't-1', expire: 7200 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ code: 0, msg: 'ok' }),
        });

      await sendReportNotification(validConfig, {
        deviationId: 'DEV-001',
        title: 'Test',
      });

      const [, options] = mockFetch.mock.calls[1];
      const card = JSON.parse(JSON.parse(options.body).content);
      expect(card.header.template).toBe('blue'); // default
    });
  });

  // ==========================================================================
  // testConnection
  // ==========================================================================

  describe('testConnection', () => {
    it('should return success with latency', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ code: 0, tenant_access_token: 't-1', expire: 7200 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ code: 0, msg: 'ok' }),
        });

      const result = await testConnection(validConfig);
      expect(result.success).toBe(true);
      expect(result.latency).toBeGreaterThanOrEqual(0);
      expect(result.error).toBeUndefined();
    });

    it('should return error on failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

      const result = await testConnection(validConfig);
      expect(result.success).toBe(false);
      expect(result.error).toContain('401');
    });
  });
});
