import { app, BrowserWindow } from 'electron';
import path from 'path';
import dotenv from 'dotenv';
import { configureLogger, createLogger, type LogLevel } from '../core/utils/logger';
import { registerDatabaseIPC } from './ipc/database';
import { registerLLMIPC } from './ipc/llm';
import { registerKnowledgeIPC } from './ipc/knowledge';
import { registerFileIPC } from './ipc/file';
import { registerWorkflowIPC } from './ipc/workflow';
import { registerAuditBeeIPC } from './ipc/auditbee';
import { registerTemplateIPC } from './ipc/template';
import { getDatabase, initSchema, closeDatabase } from '../core/db/connection';
import { initRetriever } from '../core/rag/index';
import { getKnowledgeDocs, createKnowledgeDoc, updateKnowledgeDocIndex } from '../core/db/schema';
import fs from 'fs';

// Load environment variables from config/.env
dotenv.config({ path: path.join(process.cwd(), 'config', '.env') });

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
  logDir: isDev
    ? path.join(process.cwd(), 'logs')
    : path.join(app.getPath('userData'), 'logs'),
});

const log = createLogger('Main');

log.info('GMPilot starting', {
  dev: isDev,
  platform: process.platform,
  version: app.getVersion(),
});

// ============================================================================
// Window Management
// ============================================================================

let mainWindow: BrowserWindow | null = null;

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

  // Set Content-Security-Policy
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self'; " +
          "style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data: blob:; " +
          "font-src 'self' data:; " +
          "base-uri 'self'; " +
          "frame-ancestors 'none'; " +
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
          'http://localhost:11434 ' +
          // AuditBee (local)
          'http://localhost:8000 ' +
          'http://127.0.0.1:8000'
        ],
      },
    });
  });

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
registerAuditBeeIPC();
registerTemplateIPC();

log.info('All IPC handlers registered');

// ============================================================================
// Global Error Handlers
// ============================================================================

process.on('uncaughtException', (error) => {
  log.error('Uncaught exception', {
    message: error.message,
    stack: error.stack,
  }, error);

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
    const retriever = await initRetriever(db);

    // Auto-load builtin knowledge if not already loaded
    const existingDocs = getKnowledgeDocs(db, 'builtin');
    if (existingDocs.length === 0) {
      const builtinDir = path.join(process.cwd(), 'knowledge', 'builtin');
      if (fs.existsSync(builtinDir)) {
        const files = fs.readdirSync(builtinDir).filter((f: string) => f.endsWith('.txt'));
        log.info(`Loading ${files.length} builtin knowledge files`);
        for (const filename of files) {
          const content = fs.readFileSync(path.join(builtinDir, filename), 'utf-8');
          const docId = createKnowledgeDoc(db, { filename, source: 'builtin', content });
          const chunkCount = await retriever.indexDocument(docId, content);
          updateKnowledgeDocIndex(db, docId, chunkCount);
        }
        log.info(`Builtin knowledge loaded: ${files.length} files`);
      }
    } else {
      log.info(`Builtin knowledge already loaded: ${existingDocs.length} docs`);
    }

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

  // 优化4: 预加载知识库（后台执行，不阻塞窗口创建）
  preloadKnowledgeBase();

  createWindow();

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

app.on('before-quit', () => {
  log.info('App quitting');
  closeDatabase();
});
