/**
 * Notification IPC handlers for Electron main process.
 * Manages Feishu (Lark) notification configuration and message sending.
 */

import { ipcMain } from 'electron';
import { getDatabase, initSchema } from '../../core/db/connection';
import { getAllSettings, setSettings } from '../../core/db/schema';
import { createLogger } from '../../core/utils/logger';
import { getSecret, setSecret } from '../../core/utils/secure-storage';
import {
  testConnection,
  sendReportNotification,
  validateConfig,
  clearTokenCache,
  type FeishuConfig,
  type ReportNotificationData,
} from '../../core/integration/feishu-client';

const log = createLogger('Notification');

// Settings keys
const FEISHU_APP_ID_KEY = 'FEISHU_APP_ID';
const FEISHU_APP_SECRET_KEY = 'FEISHU_APP_SECRET';
const FEISHU_RECEIVE_ID_KEY = 'FEISHU_RECEIVE_ID';
const FEISHU_RECEIVE_ID_TYPE_KEY = 'FEISHU_RECEIVE_ID_TYPE';
const FEISHU_ENABLED_KEY = 'FEISHU_ENABLED';

/**
 * Load Feishu config from database settings + secure storage.
 */
export async function loadFeishuConfig(): Promise<FeishuConfig> {
  const db = getDatabase();
  await initSchema(db);
  const settings = getAllSettings(db);

  // App Secret may be in secure storage
  let appSecret = settings[FEISHU_APP_SECRET_KEY] || '';
  if (appSecret === '••••••••') {
    const secret = await getSecret(FEISHU_APP_SECRET_KEY);
    if (secret) appSecret = secret;
  }

  return {
    appId: settings[FEISHU_APP_ID_KEY] || '',
    appSecret,
    receiveIdType: (settings[FEISHU_RECEIVE_ID_TYPE_KEY] as FeishuConfig['receiveIdType']) || 'open_id',
    receiveId: settings[FEISHU_RECEIVE_ID_KEY] || '',
    enabled: settings[FEISHU_ENABLED_KEY] === 'true',
  };
}

/**
 * Send report notification if Feishu is configured and enabled.
 * Fire-and-forget: errors are logged but never thrown.
 */
export async function notifyReportComplete(report: ReportNotificationData): Promise<void> {
  try {
    const config = await loadFeishuConfig();
    if (!config.enabled) {
      log.debug('Feishu notification disabled, skipping');
      return;
    }

    const validation = validateConfig(config);
    if (!validation.valid) {
      log.warn('Feishu config incomplete, skipping notification', { error: validation.error });
      return;
    }

    await sendReportNotification(config, report);
    log.info('Report notification sent via Feishu', { deviationId: report.deviationId });
  } catch (error) {
    // Fire-and-forget: never block workflow completion
    log.warn('Feishu notification failed (non-fatal)', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function registerNotificationIPC(): void {
  // Get Feishu config (masked secret)
  ipcMain.handle('notification:getFeishuConfig', async () => {
    try {
      const config = await loadFeishuConfig();
      return {
        success: true,
        config: {
          appId: config.appId,
          appSecret: config.appSecret ? '••••••••' : '',
          receiveIdType: config.receiveIdType,
          receiveId: config.receiveId,
          enabled: config.enabled,
        },
      };
    } catch (error) {
      log.error('getFeishuConfig failed', { error: String(error) });
      return { success: false, error: String(error) };
    }
  });

  // Save Feishu config
  ipcMain.handle('notification:saveFeishuConfig', async (_event, config: {
    appId?: string;
    appSecret?: string;
    receiveIdType?: string;
    receiveId?: string;
    enabled?: boolean;
  }) => {
    try {
      const db = getDatabase();
      await initSchema(db);

      const settingsToSave: Record<string, string> = {};

      if (config.appId !== undefined) {
        settingsToSave[FEISHU_APP_ID_KEY] = config.appId.trim();
      }

      // Store App Secret in secure storage
      if (config.appSecret !== undefined && config.appSecret !== '••••••••' && config.appSecret.trim()) {
        try {
          await setSecret(FEISHU_APP_SECRET_KEY, config.appSecret.trim());
          settingsToSave[FEISHU_APP_SECRET_KEY] = '••••••••';
        } catch {
          // SECURITY: Fallback to plain text storage if secure storage unavailable.
          // The secret will be stored in SQLite without encryption.
          // This is acceptable for local desktop app but should be logged for audit.
          log.warn('Feishu App Secret stored in plain text (secure storage unavailable)', {
            key: FEISHU_APP_SECRET_KEY,
          });
          settingsToSave[FEISHU_APP_SECRET_KEY] = config.appSecret.trim();
        }
      }

      if (config.receiveIdType !== undefined) {
        settingsToSave[FEISHU_RECEIVE_ID_TYPE_KEY] = config.receiveIdType;
      }

      if (config.receiveId !== undefined) {
        settingsToSave[FEISHU_RECEIVE_ID_KEY] = config.receiveId.trim();
      }

      if (config.enabled !== undefined) {
        settingsToSave[FEISHU_ENABLED_KEY] = String(config.enabled);
      }

      if (Object.keys(settingsToSave).length > 0) {
        setSettings(db, settingsToSave);
      }

      // Clear token cache when credentials change
      clearTokenCache();

      log.info('Feishu config saved', { enabled: config.enabled });
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error('saveFeishuConfig failed', { error: msg });
      return { success: false, error: msg };
    }
  });

  // Test Feishu connection
  ipcMain.handle('notification:testFeishu', async () => {
    try {
      const config = await loadFeishuConfig();

      const validation = validateConfig(config);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      const result = await testConnection(config);
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error('testFeishu failed', { error: msg });
      return { success: false, error: msg };
    }
  });
}
