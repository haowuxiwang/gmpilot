/**
 * Knowledge base IPC handlers for Electron main process.
 */

import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { getDatabase, initSchema } from '../../core/db/connection';
import { getKnowledgeDocs, createKnowledgeDoc, updateKnowledgeDocIndex, deleteKnowledgeDoc } from '../../core/db/schema';
import { initRetriever } from '../../core/rag/index';
import { createLogger } from '../../core/utils/logger';
import { readFileContent, getFileFilters } from '../../core/utils/file-reader';

const log = createLogger('Knowledge');
import type { Retriever } from '../../core/rag/retriever';

async function ensureInitialized(): Promise<Retriever> {
  const db = getDatabase();
  await initSchema(db);
  return initRetriever(db);
}

/**
 * Load builtin regulation files from knowledge/builtin/ directory.
 */
async function loadBuiltinKnowledge(): Promise<void> {
  const db = getDatabase();
  const builtinDir = path.join(process.cwd(), 'knowledge', 'builtin');

  if (!fs.existsSync(builtinDir)) return;

  const files = fs.readdirSync(builtinDir).filter((f) => f.endsWith('.txt'));

  for (const filename of files) {
    // Skip if already loaded
    const existing = getKnowledgeDocs(db, 'builtin').find((d) => d.filename === filename);
    if (existing) continue;

    const content = fs.readFileSync(path.join(builtinDir, filename), 'utf-8');
    const docId = createKnowledgeDoc(db, { filename, source: 'builtin', content });

    // Index the document
    const ret = await ensureInitialized();
    const chunkCount = await ret.indexDocument(docId, content);
    updateKnowledgeDocIndex(db, docId, chunkCount);
  }
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

      // Auto-load builtin files on first access
      await loadBuiltinKnowledge();

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
      };
    } catch (error) {
      log.error('stats failed', { error: String(error) });
      return { docCount: 0, chunkCount: 0, isAvailable: false };
    }
  });

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
  ipcMain.handle('knowledge:pickAndAdd', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: '选择法规文件',
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

      const docId = createKnowledgeDoc(db, { filename, source: 'user', content });

      const ret = await ensureInitialized();
      const chunkCount = await ret.indexDocument(docId, content);
      updateKnowledgeDocIndex(db, docId, chunkCount);

      return { success: true, docId, chunkCount, filename };
    } catch (error) {
      log.error('pickAndAdd failed', { error: String(error) });
      return { success: false, error: error instanceof Error ? error.message : '文档上传失败' };
    }
  });
}
