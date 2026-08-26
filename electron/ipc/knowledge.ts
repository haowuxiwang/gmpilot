/**
 * Knowledge base IPC handlers for Electron main process.
 */

import { ipcMain, dialog, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { getDatabase, initSchema } from '../../core/db/connection';
import { getKnowledgeDocs, createKnowledgeDoc, updateKnowledgeDocIndex, deleteKnowledgeDoc } from '../../core/db/schema';
import { initRetriever } from '../../core/rag/index';
import { createLogger } from '../../core/utils/logger';
import { readFileContent, getFileFilters } from '../../core/utils/file-reader';
import { getBuiltinKnowledgePath } from '../../core/utils/paths';

const log = createLogger('Knowledge');
import type { Retriever } from '../../core/rag/retriever';

async function ensureInitialized(): Promise<Retriever> {
  const db = getDatabase();
  await initSchema(db);
  return initRetriever(db);
}

/**
 * Load builtin regulation files from knowledge/builtin/ directory.
 * Exported for retry from workflow IPC if startup preload failed.
 *
 * Singleton: concurrent callers (startup preload, knowledge:listDocuments,
 * workflow start) share one in-flight indexing promise. This prevents
 * duplicate indexing of the same 55 files — local ONNX embedding is
 * synchronous WASM compute on the main process thread, so double indexing
 * saturates the process and starves IPC/CDP.
 */
let builtinIndexing: Promise<void> | null = null;

// 索引进度（跨路由可查询 + webContents 实时推送）
export interface IndexProgress {
  indexing: boolean;
  total: number;
  done: number;
  currentFile: string | null;
}
const indexProgress: IndexProgress = { indexing: false, total: 0, done: 0, currentFile: null };

function updateIndexProgress(patch: Partial<IndexProgress>): void {
  Object.assign(indexProgress, patch);
  // 推送给所有渲染进程（知识库页实时显示进度条）
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('knowledge:indexing-progress', { ...indexProgress });
    }
  }
  log.info('Index progress', { ...indexProgress });
}

export function getIndexProgress(): IndexProgress {
  return { ...indexProgress };
}

export async function loadBuiltinKnowledge(): Promise<void> {
  if (builtinIndexing) return builtinIndexing;

  builtinIndexing = (async () => {
    const db = getDatabase();
    const builtinDir = getBuiltinKnowledgePath();

    if (!fs.existsSync(builtinDir)) return;

    const files = fs.readdirSync(builtinDir).filter((f) => f.endsWith('.txt'));

    // 统计待索引数（已索引的跳过）
    let pending = 0;
    const docs = getKnowledgeDocs(db, 'builtin');
    for (const filename of files) {
      const existing = docs.find((d) => d.filename === filename);
      if (!(existing && existing.chunk_count > 0)) pending++;
    }
    updateIndexProgress({ indexing: true, total: pending, done: 0, currentFile: null });

    let done = 0;
    for (const filename of files) {
      try {
        const existing = docs.find((d) => d.filename === filename);

        // Skip if already loaded AND indexed (chunk_count > 0)
        if (existing && existing.chunk_count > 0) continue;

        updateIndexProgress({ currentFile: filename });

        const content = fs.readFileSync(path.join(builtinDir, filename), 'utf-8');

        let docId: number;
        if (existing) {
          // Document registered but not indexed (chunk_count=0) — re-index
          docId = existing.id;
        } else {
          docId = createKnowledgeDoc(db, { filename, source: 'builtin', content });
        }

        // Index the document
        const ret = await ensureInitialized();
        const chunkCount = await ret.indexDocument(docId, content);
        updateKnowledgeDocIndex(db, docId, chunkCount);
        done++;
        updateIndexProgress({ done });
      } catch (err) {
        log.warn(`Failed to index builtin file: ${filename}`, { error: String(err) });
        done++;
        updateIndexProgress({ done });
        // Continue with next file — one failure should not block all
      }
    }
    updateIndexProgress({ indexing: false, currentFile: null });
    log.info('Builtin knowledge indexing finished', { total: files.length, processed: done });
  })().finally(() => {
    builtinIndexing = null;
  });

  return builtinIndexing;
}

/** True while the builtin knowledge indexing is running (exposed via IPC). */
export function isBuiltinIndexing(): boolean {
  return builtinIndexing !== null;
}

export function registerKnowledgeIPC(): void {
  // Query knowledge base
  ipcMain.handle('knowledge:query', async (_event, query: string) => {
    try {
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return [];
      }
      const ret = await ensureInitialized();
      return ret.retrieve(query);
    } catch (error) {
      log.error('query failed', { error: String(error) });
      return [];
    }
  });

  // C-2 fix: Removed knowledge:addDocument — arbitrary file read vulnerability.
  // Use knowledge:pickAndAdd (dialog-based) instead for safe file selection.

  // List documents
  ipcMain.handle('knowledge:listDocuments', async () => {
    try {
      await ensureInitialized();
      const db = getDatabase();

      // 触发内置文件后台索引（不等待完成）：全量索引需要数分钟，
      // 阻塞会导致知识库页面长时间无响应。文件注册在索引循环内逐个
      // 完成，页面会随索引进度逐步显示文件。
      try {
        void loadBuiltinKnowledge().catch(() => {});
      } catch (e) {
        log.warn('loadBuiltinKnowledge partial failure', { error: String(e) });
      }

      return getKnowledgeDocs(db);
    } catch (error) {
      log.error('listDocuments failed', { error: String(error) });
      return [];
    }
  });

  // Get regulation context for LLM
  ipcMain.handle('knowledge:getContext', async (_event, query: string) => {
    try {
      const ret = await ensureInitialized();
      return ret.getRegulationContext(query);
    } catch (error) {
      log.error('getContext failed', { error: String(error) });
      return '（获取法规上下文失败）';
    }
  });

  // Get index stats
  ipcMain.handle('knowledge:stats', async () => {
    try {
      const db = getDatabase();
      const ret = await ensureInitialized();
      const stats = await ret.getStats();
      const docs = getKnowledgeDocs(db);
      return {
        docCount: docs.length,
        chunkCount: stats.totalChunks,
        isAvailable: stats.isAvailable,
        indexing: isBuiltinIndexing(),
        progress: getIndexProgress(),
      };
    } catch (error) {
      log.error('stats failed', { error: String(error) });
      return { docCount: 0, chunkCount: 0, isAvailable: false, indexing: false };
    }
  });

  // Index progress poll (renderer also receives knowledge:indexing-progress push)
  ipcMain.handle('knowledge:indexProgress', () => getIndexProgress());

  // Delete document
  ipcMain.handle('knowledge:deleteDocument', async (_event, docId: number) => {
    try {
      if (!Number.isInteger(docId) || docId <= 0) {
        return { success: false, error: '无效的文档 ID' };
      }
      const db = getDatabase();
      const ret = await ensureInitialized();

      // Delete vectors first
      await ret.deleteDocument(docId);

      // Delete from database
      deleteKnowledgeDoc(db, docId);

      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error('deleteDocument failed', { error: msg });
      return { success: false, error: msg };
    }
  });

  // Show file picker dialog and add document
  ipcMain.handle('knowledge:pickAndAdd', async (_event, category?: string) => {
    try {
      const categoryTitles: Record<string, string> = {
        sop: '选择SOP文件',
        deviation: '选择历史偏差文件',
        regulation: '选择法规文件',
      };
      const title = categoryTitles[category || ''] || '选择知识库文件';

      const result = await dialog.showOpenDialog({
        title,
        filters: getFileFilters(),
        properties: ['openFile'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: '用户取消选择' };
      }

      const filePath = result.filePaths[0];
      const db = getDatabase();
      const filename = path.basename(filePath);
      const ext = path.extname(filename).toLowerCase();

      const content = await readFileContent(filePath, ext);

      const docId = createKnowledgeDoc(db, { filename, source: 'user', content, category: category || 'regulation' });

      const ret = await ensureInitialized();
      const chunkCount = await ret.indexDocument(docId, content);
      updateKnowledgeDocIndex(db, docId, chunkCount);

      return { success: true, docId, chunkCount, filename, category: category || 'regulation' };
    } catch (error) {
      log.error('pickAndAdd failed', { error: String(error) });
      return { success: false, error: error instanceof Error ? error.message : '文档上传失败' };
    }
  });
}
