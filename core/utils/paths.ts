/**
 * Path resolution utility for Electron apps.
 * Correctly resolves paths in both development and packaged (production) environments.
 *
 * Development: uses process.cwd() as project root
 * Packaged: uses process.resourcesPath for static assets,
 *           app.getPath('userData') for user-writable data
 */

import path from 'path';
import fs from 'fs';

// Lazy import to avoid circular deps and allow usage outside Electron
let electronApp: typeof import('electron').app | null = null;
try {
// 防御：electron 二进制缺失时 require('electron') 会触发阻塞式下载
// （electron/index.js 的 getElectronPath → downloadElectron → spawnSync），
// 在测试/纯 Node 环境中必须先检测二进制是否存在。
const electronResolved = require.resolve('electron');
  const electronPkgDir = path.dirname(electronResolved);
  const binaryReady = fs.existsSync(path.join(electronPkgDir, 'dist')) ||
    fs.existsSync(path.join(electronPkgDir, 'path.txt'));
  if (binaryReady) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    electronApp = require('electron').app;
  }
} catch {
  // Not in Electron main process (e.g., tests)
}

/** Whether the app is running in packaged (production) mode */
export function isPackaged(): boolean {
  return electronApp?.isPackaged ?? false;
}

/**
 * Get the base directory for static read-only resources
 * (migrations, knowledge/builtin, templates, etc.)
 *
 * - Dev: process.cwd()
 * - Packaged: process.resourcesPath (extraResources output)
 */
export function getResourcesDir(): string {
  if (isPackaged()) {
    return process.resourcesPath;
  }
  return process.cwd();
}

/**
 * Get the base directory for user-writable data (database, logs, config).
 *
 * - Dev: process.cwd()
 * - Packaged: app.getPath('userData')  (e.g., %APPDATA%/GMPilot)
 */
export function getUserDataDir(): string {
  if (isPackaged() && electronApp) {
    return electronApp.getPath('userData');
  }
  return process.cwd();
}

/**
 * Resolve a path relative to the resources directory.
 * Use for: migrations, knowledge/builtin, templates, fonts, icons
 */
export function resolveResourcePath(...segments: string[]): string {
  return path.join(getResourcesDir(), ...segments);
}

/**
 * Resolve a path relative to the user data directory.
 * Use for: database, logs, user-uploaded knowledge, config/.env
 */
export function resolveDataPath(...segments: string[]): string {
  return path.join(getUserDataDir(), ...segments);
}

/**
 * Get the migrations directory path.
 */
export function getMigrationsPath(): string {
  return resolveResourcePath('core', 'db', 'migrations');
}

/**
 * Get the builtin knowledge directory path.
 */
export function getBuiltinKnowledgePath(): string {
  return resolveResourcePath('knowledge', 'builtin');
}

/**
 * Get the data directory path (for SQLite database).
 */
export function getDataDirPath(): string {
  // Respect APP_DATA_DIR env var if set (for custom deployments)
  if (process.env.APP_DATA_DIR) {
    const envDir = process.env.APP_DATA_DIR;
    // If absolute path, use directly; otherwise resolve relative to userData
    if (path.isAbsolute(envDir)) {
      return envDir;
    }
    return path.join(getUserDataDir(), envDir);
  }
  return resolveDataPath('data');
}

/**
 * Get the config directory path (for .env file).
 */
export function getConfigPath(): string {
  return resolveDataPath('config', '.env');
}

/**
 * Get the logs directory path.
 */
export function getLogsDirPath(): string {
  return resolveDataPath('logs');
}

/**
 * Get the embedding model directory path.
 *
 * 本地模型（BAAI/bge-large-zh-v1.5）已打包进 extraResources，
 * 运行期通过 resourcesPath/model/ 自动加载，无需用户手动放置。
 *
 * - Dev: 项目根目录 ./model
 * - Packaged: exe 所在目录的 model/（优先，便于更新模型）；
 *             其次 resources/model/（extraResources 打包位置）
 *
 * 用户可通过 EMBEDDING_MODEL_PATH（设置页/环境变量）显式覆盖。
 */
export function getModelDirPath(): string {
  return resolveModelDirPath(isPackaged(), process.execPath, process.resourcesPath);
}

/**
 * Pure model path resolution (testable without Electron).
 * @param packaged Whether running in packaged mode
 * @param execPath Path of the executable (process.execPath)
 * @param resourcesPath Electron resources path (process.resourcesPath)
 */
export function resolveModelDirPath(packaged: boolean, execPath: string, resourcesPath: string): string {
  if (!packaged) {
    return path.join(process.cwd(), 'model');
  }

  // exe 旁 model/（安装目录相对路径，推荐布局）
  const exeDirModel = path.join(path.dirname(execPath), 'model');
  if (fs.existsSync(exeDirModel)) {
    return exeDirModel;
  }

  // 向后兼容：旧版打包把模型打进 resources/
  return path.join(resourcesPath, 'model');
}
