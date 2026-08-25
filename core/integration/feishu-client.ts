/**
 * Feishu (Lark) Open Platform notification client.
 *
 * Uses tenant_access_token authentication to send messages via im/v1/messages API.
 * Designed for fire-and-forget notification push (report completion alerts).
 *
 * Prerequisites (user configures on open.feishu.cn):
 * - Create enterprise self-built app with Bot capability
 * - Grant permission: im:message:send_as_bot
 * - Publish a version
 * - Add target user to app visibility scope
 */

import { createLogger } from '../utils/logger';

const log = createLogger('Feishu');

// ============================================================================
// Types
// ============================================================================

export interface FeishuConfig {
  appId: string;
  appSecret: string;
  /** receive_id_type: open_id | chat_id | user_id | email */
  receiveIdType: 'open_id' | 'chat_id' | 'user_id' | 'email';
  /** The actual receive ID (user's open_id, group chat_id, etc.) */
  receiveId: string;
  /** Whether notification is enabled */
  enabled: boolean;
}

export interface FeishuMessageCard {
  title: string;
  content: string;
  fields?: { label: string; value: string }[];
  color?: 'blue' | 'green' | 'red' | 'orange' | 'grey';
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

// ============================================================================
// Constants
// ============================================================================

const FEISHU_BASE_URL = 'https://open.feishu.cn/open-apis';
const TOKEN_URL = `${FEISHU_BASE_URL}/auth/v3/tenant_access_token/internal`;
const SEND_MESSAGE_URL = `${FEISHU_BASE_URL}/im/v1/messages`;

// Token refresh buffer: refresh 5 minutes before expiry
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

// ============================================================================
// Token Management
// ============================================================================

let tokenCache: TokenCache | null = null;

/**
 * Get tenant_access_token with caching.
 * Token is valid for 2 hours; we cache and refresh 5 min before expiry.
 */
export async function getTenantAccessToken(appId: string, appSecret: string): Promise<string> {
  // Return cached token if still valid
  if (tokenCache && Date.now() < tokenCache.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
    return tokenCache.token;
  }

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });

  if (!response.ok) {
    throw new Error(`飞书认证失败: HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    code: number;
    msg: string;
    tenant_access_token?: string;
    expire?: number;
  };

  if (data.code !== 0 || !data.tenant_access_token) {
    throw new Error(`飞书认证失败: ${data.msg} (code: ${data.code})`);
  }

  // Cache token (expire is in seconds)
  const expireMs = (data.expire || 7200) * 1000;
  tokenCache = {
    token: data.tenant_access_token,
    expiresAt: Date.now() + expireMs,
  };

  log.info('Feishu token acquired', { expiresIn: `${data.expire || 7200}s` });
  return tokenCache.token;
}

/**
 * Clear token cache (useful when credentials change).
 */
export function clearTokenCache(): void {
  tokenCache = null;
}

// ============================================================================
// Message Sending
// ============================================================================

/**
 * Send a text message to the configured receiver.
 */
export async function sendTextMessage(config: FeishuConfig, text: string): Promise<void> {
  const token = await getTenantAccessToken(config.appId, config.appSecret);

  const url = `${SEND_MESSAGE_URL}?receive_id_type=${config.receiveIdType}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      receive_id: config.receiveId,
      msg_type: 'text',
      content: JSON.stringify({ text }),
    }),
  });

  if (!response.ok) {
    throw new Error(`飞书消息发送失败: HTTP ${response.status}`);
  }

  const data = (await response.json()) as { code: number; msg: string };
  if (data.code !== 0) {
    throw new Error(`飞书消息发送失败: ${data.msg} (code: ${data.code})`);
  }

  log.info('Feishu text message sent', { receiveIdType: config.receiveIdType });
}

/**
 * Send an interactive card message (rich format with header, fields, markdown).
 */
export async function sendCardMessage(config: FeishuConfig, card: FeishuMessageCard): Promise<void> {
  const token = await getTenantAccessToken(config.appId, config.appSecret);

  // Build card JSON structure
  const colorMap: Record<string, string> = {
    blue: 'blue',
    green: 'green',
    red: 'red',
    orange: 'orange',
    grey: 'grey',
  };

  const elements: unknown[] = [];

  // Main content (supports lark_md)
  if (card.content) {
    elements.push({
      tag: 'div',
      text: { tag: 'lark_md', content: card.content },
    });
  }

  // Fields as key-value pairs
  if (card.fields && card.fields.length > 0) {
    const fieldElements = card.fields.map((f) => ({
      is_short: true,
      text: { tag: 'lark_md', content: `**${f.label}**\n${f.value}` },
    }));
    elements.push({ tag: 'div', fields: fieldElements });
  }

  const cardJson = {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: card.title },
      template: colorMap[card.color || 'blue'] || 'blue',
    },
    elements,
  };

  const url = `${SEND_MESSAGE_URL}?receive_id_type=${config.receiveIdType}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      receive_id: config.receiveId,
      msg_type: 'interactive',
      content: JSON.stringify(cardJson),
    }),
  });

  if (!response.ok) {
    throw new Error(`飞书卡片消息发送失败: HTTP ${response.status}`);
  }

  const data = (await response.json()) as { code: number; msg: string };
  if (data.code !== 0) {
    throw new Error(`飞书卡片消息发送失败: ${data.msg} (code: ${data.code})`);
  }

  log.info('Feishu card message sent', { title: card.title, receiveIdType: config.receiveIdType });
}

// ============================================================================
// High-level: Report Notification
// ============================================================================

export interface ReportNotificationData {
  deviationId: string;
  title: string;
  riskLevel?: string;
  riskScore?: number;
  summary?: string;
}

/**
 * Send a deviation report completion notification as a rich card.
 * This is the primary use case: notify via Feishu when a report is generated.
 */
export async function sendReportNotification(
  config: FeishuConfig,
  report: ReportNotificationData,
): Promise<void> {
  const riskColorMap: Record<string, 'red' | 'orange' | 'green'> = {
    high: 'red',
    medium: 'orange',
    low: 'green',
  };

  const riskLabelMap: Record<string, string> = {
    high: '高风险',
    medium: '中风险',
    low: '低风险',
  };

  const riskLevel = report.riskLevel || 'unknown';
  const color = riskColorMap[riskLevel] || 'blue';
  const riskLabel = riskLabelMap[riskLevel] || '未评估';

  const fields = [
    { label: '偏差编号', value: report.deviationId },
    { label: '风险等级', value: riskLabel },
  ];

  if (report.riskScore !== undefined && report.riskScore >= 0) {
    fields.push({ label: '风险评分', value: String(report.riskScore) });
  }

  const content = report.summary
    ? `**报告摘要**\n${report.summary}`
    : '偏差调查报告已生成完毕，请查看。';

  await sendCardMessage(config, {
    title: `✅ 偏差报告生成完成 - ${report.title}`,
    content,
    fields,
    color,
  });
}

// ============================================================================
// Connectivity Test
// ============================================================================

/**
 * Test Feishu connectivity by sending a test message.
 * Returns latency in ms on success.
 */
export async function testConnection(config: FeishuConfig): Promise<{ success: boolean; latency?: number; error?: string }> {
  const start = Date.now();
  try {
    await sendTextMessage(config, '🔔 GMPilot 飞书通知连接测试成功！');
    return { success: true, latency: Date.now() - start };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error('Feishu connection test failed', { error: msg });
    return { success: false, latency: Date.now() - start, error: msg };
  }
}

// ============================================================================
// Config Validation
// ============================================================================

/**
 * Validate Feishu configuration completeness.
 */
export function validateConfig(config: Partial<FeishuConfig>): { valid: boolean; error?: string } {
  if (!config.appId || config.appId.trim().length === 0) {
    return { valid: false, error: 'App ID 不能为空' };
  }
  if (!config.appSecret || config.appSecret.trim().length === 0) {
    return { valid: false, error: 'App Secret 不能为空' };
  }
  if (!config.receiveId || config.receiveId.trim().length === 0) {
    return { valid: false, error: '接收者 ID 不能为空' };
  }
  const validTypes = ['open_id', 'chat_id', 'user_id', 'email'];
  if (config.receiveIdType && !validTypes.includes(config.receiveIdType)) {
    return { valid: false, error: '无效的接收者 ID 类型' };
  }
  return { valid: true };
}
