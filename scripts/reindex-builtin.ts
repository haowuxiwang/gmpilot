/**
 * 重建 builtin 知识库索引：用修复后的 chunker + 新 API key
 * 直接复用应用的 loadBuiltinKnowledge 逻辑（跳过已索引、重试 chunk_count=0）
 */
import { initRetriever } from '../core/rag/index';
import { getDatabase, initSchema } from '../core/db/connection';
import { getKnowledgeDocs, createKnowledgeDoc, updateKnowledgeDocIndex } from '../core/db/schema';
import { getBuiltinKnowledgePath } from '../core/utils/paths';
import fs from 'fs';
import path from 'path';

async function main() {
  const db = getDatabase();
  await initSchema(db);
  const ret = await initRetriever(db);

  const builtinDir = getBuiltinKnowledgePath();
  const files = fs.readdirSync(builtinDir).filter((f) => f.endsWith('.txt'));
  console.log('builtin txt files:', files.length);

  let ok = 0, skip = 0, fail = 0;
  for (const filename of files) {
    try {
      const existing = getKnowledgeDocs(db, 'builtin').find((d) => d.filename === filename);
      if (existing && existing.chunk_count > 0) { skip++; continue; }

      const content = fs.readFileSync(path.join(builtinDir, filename), 'utf-8');
      const docId = existing ? existing.id : createKnowledgeDoc(db, { filename, source: 'builtin', content });
      const chunkCount = await ret.indexDocument(docId, content);
      updateKnowledgeDocIndex(db, docId, chunkCount);
      ok++;
      console.log(`indexed: ${filename} (${chunkCount} chunks)`);
    } catch (err) {
      fail++;
      console.log(`FAILED: ${filename} — ${String(err).slice(0, 120)}`);
    }
  }
  console.log(`\nDone: indexed=${ok} skipped(already)=${skip} failed=${fail}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
