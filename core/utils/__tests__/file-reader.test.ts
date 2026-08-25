import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';
import type { Stats } from 'fs';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    stat: vi.fn(),
  },
  readFile: vi.fn(),
  stat: vi.fn(),
}));

// Mock mammoth
vi.mock('mammoth', () => ({
  extractRawText: vi.fn(),
}));

// Mock pdf-parse with PDFParse named export
const mockGetText = vi.fn();
const mockDestroy = vi.fn();
vi.mock('pdf-parse', () => ({
  PDFParse: vi.fn(() => ({
    getText: mockGetText,
    destroy: mockDestroy,
  })),
}));

// Mock exceljs
const mockEachSheet = vi.fn();
const mockReadFile = vi.fn();
const MockWorkbook = vi.fn(() => ({
  xlsx: {
    readFile: mockReadFile,
  },
  eachSheet: mockEachSheet,
}));
vi.mock('exceljs', () => ({
  Workbook: MockWorkbook,
  default: { Workbook: MockWorkbook },
}));

describe('readFileContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should read txt files', async () => {
    const mockContent = 'Hello, World!';
    vi.mocked(fs.readFile).mockResolvedValue(mockContent);
    vi.mocked(fs.stat).mockResolvedValue({ size: 100 } as unknown as Stats);

    const { readFileContent } = await import('../file-reader');
    const result = await readFileContent('test.txt', '.txt');

    expect(result).toBe(mockContent);
    expect(fs.readFile).toHaveBeenCalledWith('test.txt', 'utf-8');
  });

  it('should read md files', async () => {
    const mockContent = '# Hello';
    vi.mocked(fs.readFile).mockResolvedValue(mockContent);
    vi.mocked(fs.stat).mockResolvedValue({ size: 100 } as unknown as Stats);

    const { readFileContent } = await import('../file-reader');
    const result = await readFileContent('test.md', '.md');

    expect(result).toBe(mockContent);
  });

  it('should read csv files', async () => {
    const mockContent = 'a,b,c\n1,2,3';
    vi.mocked(fs.readFile).mockResolvedValue(mockContent);
    vi.mocked(fs.stat).mockResolvedValue({ size: 100 } as unknown as Stats);

    const { readFileContent } = await import('../file-reader');
    const result = await readFileContent('test.csv', '.csv');

    expect(result).toBe(mockContent);
  });

  it('should throw error for files exceeding size limit', async () => {
    vi.mocked(fs.stat).mockResolvedValue({ size: 20 * 1024 * 1024 } as unknown as Stats); // 20MB

    const { readFileContent } = await import('../file-reader');

    await expect(readFileContent('large.txt', '.txt')).rejects.toThrow('文件过大');
  });

  it('should read docx files using mammoth', async () => {
    vi.mocked(fs.stat).mockResolvedValue({ size: 100 } as unknown as Stats);
    const mammoth = await import('mammoth');
    vi.mocked(mammoth.extractRawText).mockResolvedValue({ value: 'Word content', messages: [] });

    const { readFileContent } = await import('../file-reader');
    const result = await readFileContent('test.docx', '.docx');

    expect(result).toBe('Word content');
  });

  it('should throw error for empty docx', async () => {
    vi.mocked(fs.stat).mockResolvedValue({ size: 100 } as unknown as Stats);
    const mammoth = await import('mammoth');
    vi.mocked(mammoth.extractRawText).mockResolvedValue({ value: '', messages: [] });

    const { readFileContent } = await import('../file-reader');

    await expect(readFileContent('empty.docx', '.docx')).rejects.toThrow('Word 文档内容为空');
  });

  it('should return supported extensions', async () => {
    const { getSupportedExtensions } = await import('../file-reader');
    const extensions = getSupportedExtensions();

    expect(extensions).toContain('txt');
    expect(extensions).toContain('pdf');
    expect(extensions).toContain('docx');
    expect(extensions).toContain('xlsx');
  });

  it('should return file filters', async () => {
    const { getFileFilters } = await import('../file-reader');
    const filters = getFileFilters();

    expect(filters.length).toBeGreaterThan(0);
    expect(filters[0]).toHaveProperty('name');
    expect(filters[0]).toHaveProperty('extensions');
  });

  it('should read PDF files', async () => {
    vi.mocked(fs.stat).mockResolvedValue({ size: 500 } as never);
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('pdf-data'));
    mockGetText.mockResolvedValue({ text: 'PDF content here' });
    mockDestroy.mockResolvedValue(undefined);

    const { readFileContent } = await import('../file-reader');
    const result = await readFileContent('test.pdf', '.pdf');

    expect(result).toBe('PDF content here');
    expect(mockDestroy).toHaveBeenCalled();
  });

  it('should throw for empty PDF', async () => {
    vi.mocked(fs.stat).mockResolvedValue({ size: 500 } as never);
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('pdf-data'));
    mockGetText.mockResolvedValue({ text: '  ' });
    mockDestroy.mockResolvedValue(undefined);

    const { readFileContent } = await import('../file-reader');
    await expect(readFileContent('empty.pdf', '.pdf')).rejects.toThrow('PDF 文件内容为空');
  });

  it('should read Excel files', async () => {
    vi.mocked(fs.stat).mockResolvedValue({ size: 500 } as never);
    mockReadFile.mockResolvedValue(undefined);

    // Create a proper mock sheet with eachRow method
    const createMockSheet = (name: string) => ({
      name,
      eachRow: vi.fn((callback: (row: { eachCell: (cb: (cell: { value: unknown }) => void) => void }) => void) => {
        // Simulate one row with one cell
        callback({
          eachCell: (cb: (cell: { value: unknown }) => void) => {
            cb({ value: 'test value' });
          },
        });
      }),
    });

    mockEachSheet.mockImplementation((callback: (sheet: ReturnType<typeof createMockSheet>, id: number) => void) => {
      callback(createMockSheet('Sheet1'), 1);
      callback(createMockSheet('Sheet2'), 2);
    });

    const { readFileContent } = await import('../file-reader');
    const result = await readFileContent('test.xlsx', '.xlsx');

    expect(result).toContain('[工作表: Sheet1]');
    expect(result).toContain('test value');
    expect(result).toContain('[工作表: Sheet2]');
  });

  it('should throw for empty Excel', async () => {
    vi.mocked(fs.stat).mockResolvedValue({ size: 500 } as never);
    mockReadFile.mockResolvedValue(undefined);
    mockEachSheet.mockImplementation(() => {});

    const { readFileContent } = await import('../file-reader');
    await expect(readFileContent('empty.xlsx', '.xlsx')).rejects.toThrow('Excel 文件内容为空');
  });

  it('should read unknown extensions as text', async () => {
    vi.mocked(fs.stat).mockResolvedValue({ size: 100 } as never);
    vi.mocked(fs.readFile).mockResolvedValue('raw content');

    const { readFileContent } = await import('../file-reader');
    const result = await readFileContent('file.xyz', '.xyz');

    expect(result).toBe('raw content');
  });
});
