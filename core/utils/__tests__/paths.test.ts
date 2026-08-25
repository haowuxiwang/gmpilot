import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';

describe('paths', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('isPackaged should return false in test environment', async () => {
    const { isPackaged } = await import('../paths');
    expect(isPackaged()).toBe(false);
  });

  it('getResourcesDir should return cwd in dev', async () => {
    const { getResourcesDir } = await import('../paths');
    expect(getResourcesDir()).toBe(process.cwd());
  });

  it('getUserDataDir should return cwd in dev', async () => {
    const { getUserDataDir } = await import('../paths');
    expect(getUserDataDir()).toBe(process.cwd());
  });

  it('resolveResourcePath should join with cwd', async () => {
    const { resolveResourcePath } = await import('../paths');
    const result = resolveResourcePath('core', 'db');
    expect(result).toBe(path.join(process.cwd(), 'core', 'db'));
  });

  it('resolveDataPath should join with cwd', async () => {
    const { resolveDataPath } = await import('../paths');
    const result = resolveDataPath('data');
    expect(result).toBe(path.join(process.cwd(), 'data'));
  });

  it('getMigrationsPath should resolve correctly', async () => {
    const { getMigrationsPath } = await import('../paths');
    expect(getMigrationsPath()).toBe(path.join(process.cwd(), 'core', 'db', 'migrations'));
  });

  it('getBuiltinKnowledgePath should resolve correctly', async () => {
    const { getBuiltinKnowledgePath } = await import('../paths');
    expect(getBuiltinKnowledgePath()).toBe(path.join(process.cwd(), 'knowledge', 'builtin'));
  });

  it('getDataDirPath with absolute APP_DATA_DIR', async () => {
    process.env.APP_DATA_DIR = '/custom/data';
    const { getDataDirPath } = await import('../paths');
    expect(getDataDirPath()).toBe('/custom/data');
  });

  it('getDataDirPath with relative APP_DATA_DIR', async () => {
    process.env.APP_DATA_DIR = 'my-data';
    const { getDataDirPath } = await import('../paths');
    expect(getDataDirPath()).toBe(path.join(process.cwd(), 'my-data'));
  });

  it('getDataDirPath without APP_DATA_DIR', async () => {
    delete process.env.APP_DATA_DIR;
    const { getDataDirPath } = await import('../paths');
    expect(getDataDirPath()).toBe(path.join(process.cwd(), 'data'));
  });

  it('getConfigPath should resolve correctly', async () => {
    const { getConfigPath } = await import('../paths');
    expect(getConfigPath()).toBe(path.join(process.cwd(), 'config', '.env'));
  });

  it('getLogsDirPath should resolve correctly', async () => {
    const { getLogsDirPath } = await import('../paths');
    expect(getLogsDirPath()).toBe(path.join(process.cwd(), 'logs'));
  });

  it('getModelDirPath should return ./model in dev', async () => {
    const { getModelDirPath } = await import('../paths');
    expect(getModelDirPath()).toBe(path.join(process.cwd(), 'model'));
  });

  it('resolveModelDirPath should use exe-dir model/ when present in packaged mode', async () => {
    const fsModule = await import('fs');
    const fsDefault = (fsModule as unknown as { default?: typeof fsModule }).default ?? fsModule;
    const existsSpy = vi.spyOn(fsDefault, 'existsSync').mockReturnValue(true);
    const { resolveModelDirPath } = await import('../paths');

    const result = resolveModelDirPath(true, 'C:/app/GMPilot.exe', 'C:/app/resources');
    expect(result).toBe(path.join('C:/app', 'model'));

    existsSpy.mockRestore();
  });

  it('resolveModelDirPath should fall back to resources/model when exe-dir model missing', async () => {
    const fsModule = await import('fs');
    const fsDefault = (fsModule as unknown as { default?: typeof fsModule }).default ?? fsModule;
    const existsSpy = vi.spyOn(fsDefault, 'existsSync').mockReturnValue(false);
    const { resolveModelDirPath } = await import('../paths');

    const result = resolveModelDirPath(true, 'C:/app/GMPilot.exe', 'C:/app/resources');
    expect(result).toBe(path.join('C:/app/resources', 'model'));

    existsSpy.mockRestore();
  });

  it('resolveModelDirPath should use cwd model/ in dev mode', async () => {
    const { resolveModelDirPath } = await import('../paths');
    expect(resolveModelDirPath(false, 'C:/electron.exe', 'C:/resources')).toBe(path.join(process.cwd(), 'model'));
  });
});
