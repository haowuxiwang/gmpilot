/**
 * Shared file reader utility.
 * Supports multiple file formats: txt, md, csv, docx, pdf, xlsx, xls.
 */

import fs from 'fs/promises';
import { createLogger } from './logger';

const log = createLogger('FileReader');

// Max file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Check file size before reading.
 */
async function checkFileSize(filePath: string): Promise<void> {
  const stats = await fs.stat(filePath);
  if (stats.size > MAX_FILE_SIZE) {
    throw new Error(`文件过大 (${(stats.size / 1024 / 1024).toFixed(1)}MB)，最大支持 10MB`);
  }
}

/**
 * Read file content based on extension.
 * Supports: .txt, .md, .csv, .docx, .doc, .pdf, .xlsx, .xls
 */
export async function readFileContent(filePath: string, ext: string): Promise<string> {
  // Check file size first
  await checkFileSize(filePath);

  // Text files
  if (ext === '.txt' || ext === '.md' || ext === '.csv') {
    return fs.readFile(filePath, 'utf-8');
  }

  // Word documents
  if (ext === '.docx' || ext === '.doc') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    if (!result.value || result.value.trim().length === 0) {
      throw new Error('Word 文档内容为空或无法解析');
    }
    return result.value;
  }

  // PDF files
  if (ext === '.pdf') {
    const { PDFParse } = await import('pdf-parse');
    const buffer = await fs.readFile(filePath);
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    if (!result.text || result.text.trim().length === 0) {
      throw new Error('PDF 文件内容为空或无法解析');
    }
    return result.text;
  }

  // Excel files
  if (ext === '.xlsx' || ext === '.xls') {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const texts: string[] = [];

    workbook.eachSheet((sheet, _sheetId) => {
      const rows: string[] = [];
      sheet.eachRow((row) => {
        const cells: string[] = [];
        row.eachCell((cell) => {
          const val = cell.value;
          cells.push(String(val ?? ''));
        });
        if (cells.length > 0) rows.push(cells.join(','));
      });
      if (rows.length > 0) {
        texts.push(`[工作表: ${sheet.name}]\n${rows.join('\n')}`);
      }
    });

    if (texts.length === 0) {
      throw new Error('Excel 文件内容为空或无法解析');
    }
    return texts.join('\n\n');
  }

  // Default: read as text
  log.warn('Unknown file extension, reading as text', { ext, filePath });
  return fs.readFile(filePath, 'utf-8');
}

/**
 * Get supported file extensions for file dialog filters.
 */
export function getSupportedExtensions(): string[] {
  return ['txt', 'md', 'csv', 'pdf', 'docx', 'doc', 'xlsx', 'xls'];
}

/**
 * Get file dialog filters for supported file types.
 */
export function getFileFilters(): Electron.FileFilter[] {
  return [
    { name: '文本文件', extensions: ['txt', 'md', 'csv'] },
    { name: 'PDF 文件', extensions: ['pdf'] },
    { name: 'Word 文档', extensions: ['docx', 'doc'] },
    { name: 'Excel 文件', extensions: ['xlsx', 'xls'] },
    { name: '所有支持的文件', extensions: getSupportedExtensions() },
  ];
}
