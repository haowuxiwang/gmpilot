import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import type { PathLike } from 'fs';
import path from 'path';

// Mock fs
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn(),
    watch: vi.fn(),
  },
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  watch: vi.fn(),
}));

// Mock parser - return different templates based on file path
vi.mock('../parser', () => ({
  parseTemplate: vi.fn().mockImplementation((filePath: string) => {
    const id = path.basename(filePath, '.md');
    return {
      id,
      filePath,
      title: 'Test Template',
      titleEn: 'Test Template',
      description: 'Test description',
      fields: [{ name: 'product', label: '产品', labelEn: 'Product', type: 'text', description: '产品名称' }],
      prompt: 'Test prompt',
      outputFormat: 'Test output format',
      rawContent: 'Test raw content',
      lastModified: new Date(),
    };
  }),
}));

describe('Template Loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should load all templates from directory', async () => {
    const mockFiles = ['background.md', 'cover.md', 'conclusion.md'];
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync as (path: string) => string[]).mockReturnValue(mockFiles);
    vi.mocked(fs.readFileSync).mockReturnValue('# Test Template');
    vi.mocked(fs.statSync).mockReturnValue({ mtime: new Date() } as unknown as fs.Stats);

    const { loadAllTemplates, clearCache } = await import('../loader');
    clearCache();
    const templates = loadAllTemplates();

    expect(templates.size).toBe(3);
  });

  it('should return empty map when directory does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const { loadAllTemplates, clearCache } = await import('../loader');
    clearCache();
    const templates = loadAllTemplates();

    expect(templates.size).toBe(0);
  });

  it('should get template by id', async () => {
    const mockFiles = ['background.md'];
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync as (path: string) => string[]).mockReturnValue(mockFiles);
    vi.mocked(fs.readFileSync).mockReturnValue('# Test Template');
    vi.mocked(fs.statSync).mockReturnValue({ mtime: new Date() } as unknown as fs.Stats);

    const { getTemplate, clearCache } = await import('../loader');
    clearCache();
    const template = getTemplate('background');

    expect(template).toBeDefined();
    expect(template?.id).toBe('background');
  });

  it('should return null for non-existent template', async () => {
    // Simulate file not found by making readFileSync throw
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory');
    });

    const { getTemplate, clearCache } = await import('../loader');
    clearCache();
    const template = getTemplate('nonexistent');

    expect(template).toBeNull();
  });

  it('should clear cache', async () => {
    const { clearCache } = await import('../loader');

    // Should not throw
    expect(() => clearCache()).not.toThrow();
  });

  it('should get all templates with caching', async () => {
    const mockFiles = ['background.md', 'cover.md'];
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync as (path: string) => string[]).mockReturnValue(mockFiles);
    vi.mocked(fs.readFileSync).mockReturnValue('# Test');
    vi.mocked(fs.statSync).mockReturnValue({ mtime: new Date() } as unknown as fs.Stats);

    const { getAllTemplates, clearCache } = await import('../loader');
    clearCache();
    const templates = getAllTemplates();

    expect(templates.length).toBe(2);
    // Second call should use cache
    const cached = getAllTemplates();
    expect(cached.length).toBe(2);
  });

  it('should reload template and notify listeners', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('# Updated');
    vi.mocked(fs.statSync).mockReturnValue({ mtime: new Date() } as unknown as fs.Stats);

    const { reloadTemplate, onTemplateChange, clearCache } = await import('../loader');
    clearCache();

    const changeFn = vi.fn();
    const unsubscribe = onTemplateChange(changeFn);

    const template = reloadTemplate('background');
    expect(template).not.toBeNull();
    expect(changeFn).toHaveBeenCalledWith('background', expect.any(Object));

    // Unsubscribe
    unsubscribe();
    reloadTemplate('background');
    expect(changeFn).toHaveBeenCalledTimes(1); // Not called again
  });

  it('should start and stop watching', async () => {
    const mockClose = vi.fn();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.watch).mockReturnValue({ close: mockClose } as unknown as fs.FSWatcher);

    const { startWatching, stopWatching } = await import('../loader');

    startWatching();
    expect(fs.watch).toHaveBeenCalled();

    // Calling again should not create another watcher
    startWatching();
    expect(fs.watch).toHaveBeenCalledTimes(1);

    stopWatching();
    expect(mockClose).toHaveBeenCalled();
  });

  it('should skip watching when directory does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const { startWatching, stopWatching } = await import('../loader');
    stopWatching(); // Ensure no existing watcher

    startWatching();
    expect(fs.watch).not.toHaveBeenCalled();
  });

  it('should handle watcher file change callback', async () => {
    let watchCallback: (event: string, filename: string | null) => void = () => {};
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.watch).mockImplementation(((_dir: PathLike, cb: (eventType: string, filename: string | null) => void) => {
      watchCallback = cb;
      return { close: vi.fn() } as unknown as fs.FSWatcher;
    }) as typeof fs.watch);
    vi.mocked(fs.readFileSync).mockReturnValue('# Changed');
    vi.mocked(fs.statSync).mockReturnValue({ mtime: new Date() } as unknown as fs.Stats);

    const { startWatching, stopWatching, clearCache } = await import('../loader');
    clearCache();
    stopWatching();
    startWatching();

    // Simulate file change
    watchCallback('change', 'background.md');
    // Non-md file should be ignored
    watchCallback('change', 'readme.txt');
    // Null filename
    watchCallback('change', null);

    stopWatching();
  });

  it('should return null when template file does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT: no such file');
    });

    const { getTemplate, clearCache } = await import('../loader');
    clearCache();
    const template = getTemplate('nonexistent');

    expect(template).toBeNull();
  });
});
