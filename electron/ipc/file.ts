/**
 * File operation IPC handlers for Electron main process.
 */

import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { createLogger } from '../../core/utils/logger';
import { readFileContent, getFileFilters } from '../../core/utils/file-reader';
import type { DeviationReport } from '../../core/workflow/types';
import { getSetting } from '../../core/db/schema';

const log = createLogger('File');

export function registerFileIPC(): void {
  // C-1 fix: Removed file:readFile — arbitrary file read vulnerability.
  // Use file:pickAndRead (dialog-based) instead for safe file selection.

  // Font path for renderer-side FontFace registration (bundled via extraResources)
  ipcMain.handle('resources:getFontPath', () => {
    const base = process.resourcesPath || path.join(__dirname, '..', '..');
    const fontPath = path.join(base, 'resources', 'fonts', 'NotoSerifCJKsc-Regular.otf');
    log.debug('resources:getFontPath', { fontPath });
    return fontPath;
  });

  // Pick file via dialog and read content
  ipcMain.handle('file:pickAndRead', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: '选择文件',
        filters: getFileFilters(),
        properties: ['openFile'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: '用户取消选择' };
      }

      const filePath = result.filePaths[0];
      const ext = path.extname(filePath).toLowerCase();
      log.debug('Reading file', { filePath, ext });

      // Check file size before reading (max 10MB)
      const MAX_FILE_SIZE = 10 * 1024 * 1024;
      const stats = fs.statSync(filePath);
      if (stats.size > MAX_FILE_SIZE) {
        return { success: false, error: `文件过大 (${Math.round(stats.size / 1024 / 1024)}MB)，最大支持 10MB` };
      }

      const content = await readFileContent(filePath, ext);
      log.info('File read successfully', { filePath, size: content.length });
      return { success: true, content, filePath };
    } catch (error) {
      log.error('pickAndRead failed', {}, error instanceof Error ? error : new Error(String(error)));
      return { success: false, error: error instanceof Error ? error.message : '文件读取失败' };
    }
  });

  // Export PDF
  ipcMain.handle('file:exportPdf', async (_event, report: DeviationReport) => {
    try {
      log.info('Export PDF requested', { deviationId: report.deviationId });

      // Show save dialog
      const result = await dialog.showSaveDialog({
        title: '导出 PDF',
        defaultPath: `${report.deviationId || '偏差报告'}.pdf`,
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
      });

      if (result.canceled || !result.filePath) {
        log.info('PDF export cancelled by user');
        return { success: false, error: '用户取消' };
      }

      // Generate PDF using react-pdf
      const { generatePdfToFile } = await import('../../core/pdf/generator');
      const filePath = await generatePdfToFile(
        { report },
        result.filePath,
      );

      log.info('PDF exported successfully', { filePath });
      return { success: true, filePath };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error('exportPdf failed', { deviationId: report.deviationId, error: msg });
      return { success: false, error: msg };
    }
  });

  // Export Word (docx) — fill the factory template via docxtemplater
  ipcMain.handle('file:exportDocx', async (_event, report: DeviationReport) => {
    try {
      log.info('Export Word requested', { deviationId: report.deviationId });

      const { defaultDocxFileName } = await import('../../core/word/filler');
      const result = await dialog.showSaveDialog({
        title: '导出 Word',
        defaultPath: defaultDocxFileName(report),
        filters: [{ name: 'Word 文档', extensions: ['docx'] }],
      });

      if (result.canceled || !result.filePath) {
        log.info('Word export cancelled by user');
        return { success: false, error: '用户取消' };
      }

      const { exportDocxToFile } = await import('../../core/word/filler');
      const db = getDatabase();
      const selectedTemplate = getSetting(db, 'SELECTED_TEMPLATE');
      const filePath = exportDocxToFile(report, result.filePath, selectedTemplate ?? undefined);

      log.info('Word exported successfully', { filePath });
      return { success: true, filePath };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error('exportDocx failed', { deviationId: report.deviationId, error: msg });
      return { success: false, error: msg };
    }
  });
}
