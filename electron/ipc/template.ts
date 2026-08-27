/**
 * Template management IPC handlers for Electron main process.
 */

import { ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { createLogger } from '../../core/utils/logger';
import { getAllTemplates, getTemplate, reloadTemplate, clearCache } from '../../core/template';
import { getAllWordTemplates } from '../../core/template-engine';
import { resolveResourcePath } from '../../core/utils/paths';

const log = createLogger('Template');

const TEMPLATE_DIR = resolveResourcePath('docs', 'templates');

/**
 * Validate template ID to prevent path traversal.
 * Only allows alphanumeric characters, hyphens, and underscores.
 */
function isValidTemplateId(templateId: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(templateId);
}

/**
 * Get validated template file path.
 * Returns null if templateId is invalid or path is outside TEMPLATE_DIR.
 */
function getValidatedPath(templateId: string): string | null {
  if (!isValidTemplateId(templateId)) {
    return null;
  }
  const filePath = path.join(TEMPLATE_DIR, `${templateId}.md`);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(TEMPLATE_DIR))) {
    return null;
  }
  return filePath;
}

export function registerTemplateIPC(): void {
  /**
   * List all templates.
   */
  ipcMain.handle('template:list', async () => {
    try {
      const templates = getAllTemplates();
      return {
        success: true,
        templates: templates.map((t) => ({
          id: t.id,
          title: t.title,
          titleEn: t.titleEn,
          description: t.description,
          fields: t.fields,
          lastModified: t.lastModified,
        })),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : '获取模版列表失败';
      log.error('Failed to list templates', { error: msg });
      return { success: false, error: msg };
    }
  });

  /**
   * Get a specific template by ID.
   */
  ipcMain.handle('template:get', async (_event, templateId: string) => {
    try {
      const template = getTemplate(templateId);
      if (!template) {
        return { success: false, error: `模版未找到: ${templateId}` };
      }
      return { success: true, template };
    } catch (error) {
      const msg = error instanceof Error ? error.message : '获取模版失败';
      log.error('Failed to get template', { templateId, error: msg });
      return { success: false, error: msg };
    }
  });

  /**
   * Get the raw content of a template file.
   */
  ipcMain.handle('template:getContent', async (_event, templateId: string) => {
    try {
      const filePath = getValidatedPath(templateId);
      if (!filePath) {
        return { success: false, error: '无效的模版 ID' };
      }
      if (!fs.existsSync(filePath)) {
        return { success: false, error: `模版文件未找到: ${templateId}` };
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      return { success: true, content };
    } catch (error) {
      const msg = error instanceof Error ? error.message : '获取模版内容失败';
      log.error('Failed to get template content', { templateId, error: msg });
      return { success: false, error: msg };
    }
  });

  /**
   * Update a template file.
   */
  ipcMain.handle('template:update', async (_event, templateId: string, content: string) => {
    const filePath = getValidatedPath(templateId);
    if (!filePath) {
      return { success: false, error: '无效的模版 ID' };
    }

    // Backup original file
    const backupPath = `${filePath}.bak`;
    const hasBackup = fs.existsSync(filePath);
    if (hasBackup) {
      fs.copyFileSync(filePath, backupPath);
    }

    try {
      // Write new content
      fs.writeFileSync(filePath, content, 'utf-8');

      // Reload template cache
      reloadTemplate(templateId);

      log.info('Template updated', { templateId });
      return { success: true };
    } catch (error) {
      // Auto-rollback: restore from backup
      if (hasBackup && fs.existsSync(backupPath)) {
        try {
          fs.copyFileSync(backupPath, filePath);
          log.info('Template rolled back from backup', { templateId });
        } catch (rollbackError) {
          log.error('Failed to rollback template', { templateId, error: String(rollbackError) });
        }
      }

      const msg = error instanceof Error ? error.message : '更新模版失败';
      log.error('Failed to update template', { templateId, error: msg });
      return { success: false, error: msg };
    }
  });

  /**
   * Reset a template to default (restore from backup if available).
   */
  ipcMain.handle('template:reset', async (_event, templateId: string) => {
    try {
      const filePath = getValidatedPath(templateId);
      if (!filePath) {
        return { success: false, error: '无效的模版 ID' };
      }
      const backupPath = `${filePath}.bak`;

      if (!fs.existsSync(backupPath)) {
        return { success: false, error: '未找到备份文件' };
      }

      // Restore from backup
      fs.copyFileSync(backupPath, filePath);

      // Reload template cache
      reloadTemplate(templateId);

      log.info('Template reset', { templateId });
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : '重置模版失败';
      log.error('Failed to reset template', { templateId, error: msg });
      return { success: false, error: msg };
    }
  });

  /**
   * Clear template cache.
   */
  ipcMain.handle('template:clearCache', async () => {
    try {
      clearCache();
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : '清除缓存失败';
      log.error('Failed to clear cache', { error: msg });
      return { success: false, error: msg };
    }
  });

  log.info('Template IPC handlers registered');

  /**
   * Get all Word templates (for multi-factory template selection).
   */
  ipcMain.handle('template:getAllWordTemplates', async () => {
    try {
      log.debug('template:getAllWordTemplates handler invoked');
      const templates = getAllWordTemplates();
      log.info('Word templates loaded', { count: templates.length, ids: templates.map((t) => t.id) });
      return templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        builtIn: t.builtIn,
      }));
    } catch (error) {
      log.error('Failed to get word templates', { error: String(error) });
      return [];
    }
  });
}
