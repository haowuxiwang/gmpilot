import { app, BrowserWindow, dialog, Menu } from 'electron';
import path from 'path';
import dotenv from 'dotenv';
import { configureLogger, createLogger, type LogLevel } from '../core/utils/logger';
import { registerDatabaseIPC } from './ipc/database';
import { registerLLMIPC } from './ipc/llm';
import { registerKnowledgeIPC, loadBuiltinKnowledge } from './ipc/knowledge';
import { registerFileIPC } from './ipc/file';
import { registerWorkflowIPC, getWorkflowRunning } from './ipc/workflow';
import { registerTemplateIPC } from './ipc/template';
import { registerNotificationIPC } from './ipc/notification';
import { registerLoggerIPC } from './ipc/logger';
import { initAutoUpdater } from './updater';
import { initCrashReporter } from './crash-reporter';
import { getDatabase, initSchema, closeDatabase } from '../core/db/connection';
import { initRetriever } from '../core/rag/index';
import { getConfigPath, getLogsDirPath } from '../core/utils/paths';
import fs from 'fs';

// Load environment variables from config/.env (respects packaged path)
dotenv.config({ path: getConfigPath() });

// ============================================================================
// Initialize Logger
// ============================================================================

const isDev = !app.isPackaged;

// 安全的 LOG_LEVEL 类型验证
const logLevel = process.env.LOG_LEVEL?.toLowerCase();
const validLevels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
const configuredLevel: LogLevel = validLevels.includes(logLevel as LogLevel)
  ? (logLevel as LogLevel)
  : 'info';

configureLogger({
  level: configuredLevel,
  logDir: getLogsDirPath(),
});

const log = createLogger('Main');

log.info('GMPilot starting', {
  dev: isDev,
  platform: process.platform,
  version: app.getVersion(),
});

// ============================================================================
// Single Instance Lock
// ============================================================================

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  log.warn('Another instance is already running, quitting');
  app.quit();
} else {
  app.on('second-instance', () => {
    log.info('Second instance detected, focusing main window');
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ============================================================================
// Window Management
// ============================================================================

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 320,
    height: 360,
    frame: false,
    transparent: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    show: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  const splashPath = isDev
    ? path.join(__dirname, '../electron/splash.html')
    : path.join(__dirname, '../../electron/splash.html');

  // Fallback: try relative to resources
  const splashFile = fs.existsSync(splashPath)
    ? splashPath
    : path.join(process.resourcesPath || __dirname, 'electron/splash.html');

  splashWindow.loadFile(splashFile).catch(() => {
    // If splash fails to load, just skip it
    splashWindow?.close();
    splashWindow = null;
  });

  splashWindow.on('closed', () => { splashWindow = null; });
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

function createWindow() {
  log.info('Creating main window');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    title: 'GMPilot',
    icon: path.join(__dirname, '../../resources/icons/icon.svg'),
  });

  // Set Content-Security-Policy (skip in dev — Vite injects inline module scripts)
  if (!isDev) {
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; " +
            "script-src 'self'; " + // No 'unsafe-eval' - scripts must be bundled
            "style-src 'self' 'unsafe-inline'; " + // 'unsafe-inline' required for Tailwind CSS dynamic styles
            "img-src 'self' data: blob:; " +
            "font-src 'self' data: file:; " +
            "base-uri 'self'; " +
            "frame-ancestors 'none'; " + // Prevent framing attacks
            "connect-src 'self' " +
            // SiliconFlow
            'https://api.siliconflow.cn ' +
            // DeepSeek
            'https://api.deepseek.com ' +
            // Qwen (通义千问)
            'https://dashscope.aliyuncs.com ' +
            // GLM (智谱)
            'https://open.bigmodel.cn ' +
            // OpenAI
            'https://api.openai.com ' +
            // Anthropic
            'https://api.anthropic.com ' +
            // OpenRouter
            'https://openrouter.ai ' +
            // Mimo
            'https://api.xiaomimimo.com ' +
            // Ollama (local)
            'http://localhost:11434'
          ],
        },
      });
    });
  }

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));

    // Disable DevTools in production
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow?.webContents.closeDevTools();
    });

    // Disable keyboard shortcuts for DevTools
    mainWindow.webContents.on('before-input-event', (_event, input) => {
      if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
        _event.preventDefault();
      }
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    log.info('Main window closed');
  });

  log.info('Main window created');
}

// ============================================================================
// IPC Registration
// ============================================================================

log.info('Registering IPC handlers');

registerDatabaseIPC();
registerLLMIPC();
registerKnowledgeIPC();
registerFileIPC();
registerWorkflowIPC();
registerTemplateIPC();
registerNotificationIPC();
registerLoggerIPC();

log.info('All IPC handlers registered');

// ============================================================================
// Global Error Handlers
// ============================================================================

process.on('uncaughtException', (error) => {
  log.error('Uncaught exception', {
    message: error.message,
    stack: error.stack,
  }, error);

  // Write structured error report
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { writeErrorReport } = require('./crash-reporter');
    writeErrorReport(error, 'uncaughtException');
  } catch { /* non-critical */ }

  // Notify all windows
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send('app:fatal-error', {
        message: error.message,
        type: 'uncaughtException',
      });
    }
  });

  // 使用 app.quit() 而非 app.exit(1)，触发正常的清理流程
  setTimeout(() => {
    log.info('Exiting due to uncaught exception');
    process.exitCode = 1;
    app.quit();
  }, 1000);
});

process.on('unhandledRejection', (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  log.error('Unhandled rejection', {
    message: error.message,
    stack: error.stack,
  }, error);

  // Write structured error report
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { writeErrorReport } = require('./crash-reporter');
    writeErrorReport(error, 'unhandledRejection');
  } catch { /* non-critical */ }

  // Notify all windows
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send('app:fatal-error', {
        message: error.message,
        type: 'unhandledRejection',
      });
    }
  });

  // 不退出进程，但记录到日志
  // unhandledRejection 不应导致应用崩溃
});

// ============================================================================
// App Lifecycle
// ============================================================================

/**
 * 优化4: 预加载知识库 — 在应用启动时完成，不在工作流中阻塞。
 * 初始化 DB + RAG + 加载 builtin 法规文档。
 * 使用锁机制防止重复加载。
 */
let knowledgeBaseLoading = false;
let knowledgeBaseLoaded = false;

async function preloadKnowledgeBase(): Promise<void> {
  // Prevent concurrent loading
  if (knowledgeBaseLoading) {
    log.info('Knowledge base already loading, skipping...');
    return;
  }

  if (knowledgeBaseLoaded) {
    log.info('Knowledge base already loaded, skipping...');
    return;
  }

  knowledgeBaseLoading = true;

  try {
    log.info('Preloading knowledge base...');
    const db = getDatabase();
    await initSchema(db);
    await initRetriever(db);

    // Auto-load builtin knowledge — 单例：与 knowledge IPC 的加载共用
    // 同一 in-flight Promise，避免并发重复索引 55 个文件
    // （本地 ONNX embedding 为主进程同步 WASM 计算，双路索引会占满主进程）
    await loadBuiltinKnowledge();

    knowledgeBaseLoaded = true;
  } catch (error) {
    log.warn('Failed to preload knowledge base (will retry on first workflow)', {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    knowledgeBaseLoading = false;
  }
}

app.whenReady().then(async () => {
  log.info('App ready, creating window');

  // Remove default Electron menu bar (File, Edit, View, etc.)
  Menu.setApplicationMenu(null);

  // Show splash screen during initialization
  createSplashWindow();

  // Initialize crash reporter (local error reporting)
  initCrashReporter();

  // Initialize auto-updater (checks for updates after 5s)
  initAutoUpdater();

  // 优化4: 预加载知识库（后台执行，不阻塞窗口创建）
  preloadKnowledgeBase();

  createWindow();

  // Close splash once main window is ready
  if (mainWindow) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(closeSplash, 300);
    });
    // Fallback: close splash after 5s regardless
    setTimeout(closeSplash, 5000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      log.info('Activating app, creating new window');
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  log.info('All windows closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

let isQuitting = false;

app.on('before-quit', (event) => {
  // If workflow is running, ask user for confirmation
  if (getWorkflowRunning() && !isQuitting) {
    event.preventDefault();

    try {
      const choice = dialog.showMessageBoxSync({
        type: 'warning',
        buttons: ['等待完成', '强制退出'],
        defaultId: 0,
        cancelId: 0,
        title: 'GMPilot',
        message: '工作流正在运行中',
        detail: '偏差报告正在生成，强制退出可能导致报告丢失。\n建议等待工作流完成后再退出。',
      });

      if (choice === 0) {
        // User chose to wait — do nothing, keep app open
        return;
      }
      // User chose force quit
      log.warn('User chose to force quit during workflow execution');
    } catch (dialogError) {
      // Dialog may fail if window is already destroyed (e.g., task manager close)
      log.warn('Quit confirmation dialog failed, allowing quit', { error: String(dialogError) });
    }
  }

  isQuitting = true;
});

app.on('will-quit', () => {
  log.info('App will quit, cleaning up resources');
  try {
    closeDatabase();
    log.info('Database closed successfully');
  } catch (error) {
    log.error('Error closing database during shutdown', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
