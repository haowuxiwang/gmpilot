/**
 * 端到端验证：知识库语义检索（英文 EU GMP + 中文查询）
 */
import { initRetriever } from '../core/rag/index';
import { getDatabase, initSchema } from '../core/db/connection';

async function main() {
  const db = getDatabase();
  await initSchema(db);
  const ret = await initRetriever(db);

  const stats = await ret.getStats();
  console.log('向量总数:', stats.totalChunks, '| retriever available:', stats.isAvailable);
  console.log('');

  // 英文法规检索
  const q1 = 'premises design requirement to prevent contamination';
  const r1 = await ret.retrieve(q1, { topK: 3 });
  console.log(`[英文查询] ${q1}`);
  for (const r of r1) {
    console.log(`  sim=${r.similarity.toFixed(3)} [${r.sectionPath.slice(0, 40)}] ${r.content.slice(0, 60).replace(/\n/g, ' ')}...`);
  }

  console.log('');
  // 中文偏差场景检索（模拟工作流真实用法）
  const q2 = '洁净区温湿度超出标准范围 设备故障 偏差处理';
  const r2 = await ret.retrieve(q2, { topK: 3 });
  console.log(`[中文查询] ${q2}`);
  for (const r of r2) {
    console.log(`  sim=${r.similarity.toFixed(3)} [${r.sectionPath.slice(0, 40)}] ${r.content.slice(0, 60).replace(/\n/g, ' ')}...`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
