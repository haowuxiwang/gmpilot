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
  log.debug('Ensuring user template directory exists', { USER_TEMPLATE_DIR });
  if (!fs.existsSync(USER_TEMPLATE_DIR)) {
    fs.mkdirSync(USER_TEMPLATE_DIR, { recursive: true });
    log.info('Created user template directory', { USER_TEMPLATE_DIR });
  }
}

/**
 * Validate an uploaded template file.
 */
function validateTemplate(buffer: Buffer): { valid: boolean; errors: string[]; ast?: any; sections?: any[] } {
  const errors: string[] = [];
  log.debug('Starting template validation', { size: buffer.length });

  // Check file size
  if (buffer.length > MAX_FILE_SIZE) {
    errors.push(`文件过大 (${(buffer.length / 1024 / 1024).toFixed(1)}MB)，最大允许 ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB`);
    log.warn('Template file too large', { size: buffer.length, max: MAX_FILE_SIZE });
  }

  // Check file signature (PK zip magic)
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    errors.push('文件格式无效：不是有效的 docx 文件');
    log.warn('Invalid file signature', { byte0: buffer[0], byte1: buffer[1] });
  }

  // Try to parse
  let ast: any;
  let sections: any[] = [];
  try {
    log.debug('Parsing docx buffer...');
    ast = parseDocx(buffer);
    log.info('Docx parsed successfully', {
      paragraphCount: ast.paragraphs.length,
      tableCount: ast.tables.length,
      styleCount: ast.styles.size,
      fontCount: ast.fonts.length,
    });

    log.debug('Detecting sections...');
    sections = detectSections(ast);
    const missing = getMissingModules(ast);

    log.info('Section detection complete', {
      detectedCount: sections.length,
      detectedModules: sections.map((s: any) => s.moduleId),
      missingModules: missing,
    });

    if (sections.length === 0) {
      errors.push('未能识别到任何标准章节（背景/调查/结论/风险/CAPA/附件）');
      log.warn('No sections detected in template');
    }

    if (missing.length > 4) {
      errors.push(`缺少过多模块：${missing.join('、')}（至少需要识别 3 个模块）`);
      log.warn('Too many missing modules', { missing });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : '未知错误';
    errors.push(`解析失败：${msg}`);
    log.error('Template parsing failed', { error: msg, stack: error instanceof Error ? error.stack : undefined });
  }

  return { valid: errors.length === 0, errors, ast, sections };
}

export function registerTemplateUploadIPC(): void {
  /**
   * Open file dialog and upload a template.
   */
  ipcMain.handle('template:upload', async () => {
    log.info('Template upload IPC handler invoked');
    try {
      ensureUserDir();

      log.debug('Opening file dialog...');
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: '上传偏差报告模板',
        filters: [
          { name: 'Word 文档', extensions: ['docx'] },
        ],
        properties: ['openFile'],
      });

      if (canceled || filePaths.length === 0) {
        log.info('User cancelled file dialog');
        return { success: false, error: '用户取消' };
      }

      const filePath = filePaths[0];
      log.info('File selected', { filePath });

      const ext = path.extname(filePath).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        log.warn('Unsupported file extension', { ext });
        return { success: false, error: `不支持的文件格式: ${ext}，请上传 .docx 文件` };
      }

      log.debug('Reading file...');
      const buffer = fs.readFileSync(filePath);
      log.info('File read complete', { size: buffer.length });

      log.debug('Validating template...');
      const validation = validateTemplate(buffer);

      if (!validation.valid) {
        log.warn('Template validation failed', { errors: validation.errors });
        return { success: false, error: validation.errors.join('; ') };
      }

      // Generate unique template ID
      const timestamp = Date.now();
      const baseName = path.basename(filePath, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
      const templateId = `${baseName}_${timestamp}`;
      const templateDir = path.join(USER_TEMPLATE_DIR, templateId);

      log.debug('Creating template directory...', { templateDir });
      fs.mkdirSync(templateDir, { recursive: true });

      // Save fillable template
      const fillablePath = path.join(templateDir, 'deviation-report-fillable.docx');
      fs.writeFileSync(fillablePath, buffer);
      log.debug('Template file saved', { fillablePath });

      // Parse and detect sections for metadata
      const sections = validation.sections || [];
      const detectedModules = sections.map((s: any) => s.moduleId);

      // Create style.json
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

      log.info('Template uploaded successfully', {
        templateId,
        name: baseName,
        modules: detectedModules,
        sectionCount: sections.length,
      });

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
      log.error('Template upload failed', {
        error: msg,
        stack: error instanceof Error ? error.stack : undefined,
      });
      return { success: false, error: msg };
    }
  });

  /**
   * Delete a user-uploaded template.
   */
  ipcMain.handle('template:delete', async (_event, templateId: string) => {
    log.info('Template delete IPC handler invoked', { templateId });
    try {
      const templateDir = path.join(USER_TEMPLATE_DIR, templateId);

      if (!fs.existsSync(templateDir)) {
        log.warn('Template directory not found', { templateId, templateDir });
        return { success: false, error: '模板不存在' };
      }

      fs.rmSync(templateDir, { recursive: true, force: true });
      log.info('Template deleted successfully', { templateId });
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : '删除失败';
      log.error('Template delete failed', { error: msg, stack: error instanceof Error ? error.stack : undefined });
      return { success: false, error: msg };
    }
  });

  log.info('Template upload IPC handlers registered');
}
