/**
 * Template upload IPC handlers.
 * Handles user-uploaded deviation report templates.
 */

import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { createLogger } from '../../core/utils/logger';
import { resolveResourcePath } from '../../core/utils/paths';
import { parseDocx, detectSections, getMissingModules } from '../../core/template-engine';
import { registerTemplate } from '../../core/template-engine';
import type { TemplateMeta } from '../../core/template-engine/types';

const log = createLogger('TemplateUpload');

/** Allowed file extensions for upload */
const ALLOWED_EXTENSIONS = ['.docx'];

/** Maximum file size (10MB) */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** User upload directory */
const USER_TEMPLATE_DIR = resolveResourcePath('resources', 'templates', 'user');

/**
 * Ensure user template directory exists.
 */
function ensureUserDir(): void {
  if (!fs.existsSync(USER_TEMPLATE_DIR)) {
    fs.mkdirSync(USER_TEMPLATE_DIR, { recursive: true });
  }
}

/**
 * Validate an uploaded template file.
 */
function validateTemplate(buffer: Buffer): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check file size
  if (buffer.length > MAX_FILE_SIZE) {
    errors.push(`文件过大 (${(buffer.length / 1024 / 1024).toFixed(1)}MB)，最大允许 ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB`);
  }

  // Check file signature (PK zip magic)
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    errors.push('文件格式无效：不是有效的 docx 文件');
  }

  // Try to parse
  try {
    const ast = parseDocx(buffer);
    const sections = detectSections(ast);
    const missing = getMissingModules(ast);

    if (sections.length === 0) {
      errors.push('未能识别到任何标准章节（背景/调查/结论/风险/CAPA/附件）');
    }

    if (missing.length > 4) {
      errors.push(`缺少过多模块：${missing.join('、')}（至少需要识别 3 个模块）`);
    }
  } catch (error) {
    errors.push(`解析失败：${error instanceof Error ? error.message : '未知错误'}`);
  }

  return { valid: errors.length === 0, errors };
}

export function registerTemplateUploadIPC(): void {
  /**
   * Open file dialog and upload a template.
   */
  ipcMain.handle('template:upload', async () => {
    try {
      ensureUserDir();

      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: '上传偏差报告模板',
        filters: [
          { name: 'Word 文档', extensions: ['docx'] },
        ],
        properties: ['openFile'],
      });

      if (canceled || filePaths.length === 0) {
        return { success: false, error: '用户取消' };
      }

      const filePath = filePaths[0];
      const ext = path.extname(filePath).toLowerCase();

      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return { success: false, error: `不支持的文件格式: ${ext}，请上传 .docx 文件` };
      }

      const buffer = fs.readFileSync(filePath);
      const validation = validateTemplate(buffer);

      if (!validation.valid) {
        return { success: false, error: validation.errors.join('; ') };
      }

      // Generate unique template ID
      const timestamp = Date.now();
      const baseName = path.basename(filePath, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
      const templateId = `${baseName}_${timestamp}`;
      const templateDir = path.join(USER_TEMPLATE_DIR, templateId);

      // Create template directory
      fs.mkdirSync(templateDir, { recursive: true });

      // Save fillable template
      const fillablePath = path.join(templateDir, 'deviation-report-fillable.docx');
      fs.writeFileSync(fillablePath, buffer);

      // Parse and detect sections for metadata
      const ast = parseDocx(buffer);
      const sections = detectSections(ast);
      const detectedModules = sections.map((s) => s.moduleId);

      // Create style.json (default style, user can customize later)
      const styleConfig = {
        name: baseName,
        version: '1.0.0',
        description: `用户上传模板：${baseName}`,
        fonts: {
          ascii: 'Arial',
          eastAsia: '宋体',
        },
        sizes: {
          body: 21,
          heading1: 32,
          heading2: 26,
          heading3: 24,
        },
        detectedModules,
      };
      fs.writeFileSync(path.join(templateDir, 'style.json'), JSON.stringify(styleConfig, null, 2));

      // Create meta.json
      const meta = {
        name: baseName,
        version: '1.0.0',
        description: `用户上传模板：${baseName}`,
        builtIn: false,
        sourceFile: filePath,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(path.join(templateDir, 'meta.json'), JSON.stringify(meta, null, 2));

      // Register template
      const templateMeta: TemplateMeta = {
        id: templateId,
        name: baseName,
        version: '1.0.0',
        description: `用户上传模板：${baseName}`,
        builtIn: false,
        path: templateDir,
        fillablePath,
        stylePath: path.join(templateDir, 'style.json'),
        metaPath: path.join(templateDir, 'meta.json'),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      registerTemplate(templateId, templateMeta);

      log.info('Template uploaded', { templateId, modules: detectedModules });

      return {
        success: true,
        template: {
          id: templateId,
          name: baseName,
          description: `检测到 ${sections.length} 个模块：${detectedModules.join('、')}`,
          builtIn: false,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : '上传失败';
      log.error('Template upload failed', { error: msg });
      return { success: false, error: msg };
    }
  });

  /**
   * Delete a user-uploaded template.
   */
  ipcMain.handle('template:delete', async (_event, templateId: string) => {
    try {
      const templateDir = path.join(USER_TEMPLATE_DIR, templateId);

      if (!fs.existsSync(templateDir)) {
        return { success: false, error: '模板不存在' };
      }

      // Remove directory recursively
      fs.rmSync(templateDir, { recursive: true, force: true });

      log.info('Template deleted', { templateId });
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : '删除失败';
      log.error('Template delete failed', { error: msg });
      return { success: false, error: msg };
    }
  });

  log.info('Template upload IPC handlers registered');
}
