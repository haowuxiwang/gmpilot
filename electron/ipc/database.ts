/**
 * Database IPC handlers for Electron main process.
 * All handlers return structured success/error responses.
 * API keys are stored securely using keytar (OS keychain).
 */

import { ipcMain } from 'electron';
import { getDatabase, initSchema } from '../../core/db/connection';
import { createLogger } from '../../core/utils/logger';
import { setSecret, getSecret, isSecureStorageAvailable } from '../../core/utils/secure-storage';
import {
  getAllSettings,
  setSettings,
  getReports,
  getReport,
  createReport,
  deleteReport,
} from '../../core/db/schema';

const log = createLogger('DB');

let initialized = false;
let secureStorageAvailable = false;

async function ensureInitialized(): Promise<void> {
  if (!initialized) {
    await initSchema();
    initialized = true;

    // Check if secure storage is available
    try {
      secureStorageAvailable = await isSecureStorageAvailable();
      log.info('Secure storage available', { available: secureStorageAvailable });
    } catch {
      secureStorageAvailable = false;
      log.warn('Secure storage not available, API keys will be stored in plain text');
    }
  }
}

export function registerDatabaseIPC(): void {
  // Settings
  ipcMain.handle('db:getSettings', async () => {
    try {
      await ensureInitialized();
      const settings = getAllSettings(getDatabase());

      // Filter sensitive fields — API keys should not be exposed to renderer
      const filtered: Record<string, string> = {};
      for (const [key, value] of Object.entries(settings)) {
        if (key.endsWith('_API_KEY')) {
          // Try to get from secure storage if available
          if (secureStorageAvailable && value === '••••••••') {
            try {
              const secret = await getSecret(key);
              if (secret) {
                // Return masked value for UI
                filtered[key] = '••••••••';
                continue;
              }
            } catch (error) {
              log.warn('Failed to get API key from secure storage', { key, error: String(error) });
            }
          }
          filtered[key] = value ? '••••••••' : '';
        } else {
          filtered[key] = value;
        }
      }
      return filtered;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error('getSettings failed', { error: msg });
      return {};
    }
  });

  ipcMain.handle('db:saveSettings', async (_event, settings: Record<string, string>) => {
    try {
      await ensureInitialized();

      // Process API keys - store in secure storage if available
      const cleaned: Record<string, string> = {};
      for (const [key, value] of Object.entries(settings)) {
        if (key.endsWith('_API_KEY')) {
          // Skip masked values
          if (value === '••••••••') continue;

          // Store in secure storage if available
          if (secureStorageAvailable && value) {
            try {
              await setSecret(key, value);
              cleaned[key] = '••••••••'; // Store masked value in DB
              log.info('API key stored in secure storage', { key });
            } catch (error) {
              log.warn('Failed to store API key in secure storage, keeping in plain text', { key, error: String(error) });
              cleaned[key] = value;
            }
          } else {
            cleaned[key] = value;
          }
        } else {
          cleaned[key] = value;
        }
      }

      setSettings(getDatabase(), cleaned);
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error('saveSettings failed', { error: msg });
      return { success: false, error: msg };
    }
  });

  // Reports
  ipcMain.handle('db:getReports', async (_event, options?: { limit?: number; offset?: number }) => {
    try {
      await ensureInitialized();
      // Validate and clamp limit/offset
      const limit = Math.min(Math.max(Number(options?.limit) || 50, 1), 200);
      const offset = Math.max(Number(options?.offset) || 0, 0);
      return getReports(getDatabase(), limit, offset);
    } catch (error) {
      log.error('getReports failed', { error: String(error) });
      return [];
    }
  });

  ipcMain.handle('db:getReport', async (_event, id: number) => {
    try {
      await ensureInitialized();
      return getReport(getDatabase(), id);
    } catch (error) {
      log.error('getReport failed', { error: String(error) });
      return null;
    }
  });

  ipcMain.handle('db:createReport', async (_event, report) => {
    try {
      if (!report || typeof report !== 'object') {
        return { success: false, error: '无效的报告数据' };
      }
      if (!report.title || typeof report.title !== 'string') {
        return { success: false, error: '报告标题不能为空' };
      }
      if (report.title.length > 500) {
        return { success: false, error: '报告标题过长（最多 500 字符）' };
      }
      if (!report.content || typeof report.content !== 'string') {
        return { success: false, error: '报告内容不能为空' };
      }
      // Validate risk_score if provided
      if (report.risk_score !== undefined && report.risk_score !== null) {
        if (typeof report.risk_score !== 'number' || report.risk_score < -1 || report.risk_score > 100) {
          return { success: false, error: '风险评分必须在 -1 到 100 之间' };
        }
      }
      // Validate risk_level if provided
      if (report.risk_level !== undefined && report.risk_level !== null) {
        const validLevels = ['low', 'medium', 'high'];
        if (!validLevels.includes(report.risk_level)) {
          return { success: false, error: '风险等级必须是 low、medium 或 high' };
        }
      }
      await ensureInitialized();
      const id = createReport(getDatabase(), report);
      return { success: true, id };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error('createReport failed', { error: msg });
      return { success: false, error: msg };
    }
  });

  ipcMain.handle('db:deleteReport', async (_event, id: number) => {
    try {
      if (!Number.isInteger(id) || id <= 0) {
        return { success: false, error: '无效的报告 ID' };
      }
      await ensureInitialized();
      deleteReport(getDatabase(), id);
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error('deleteReport failed', { error: msg });
      return { success: false, error: msg };
    }
  });

}
