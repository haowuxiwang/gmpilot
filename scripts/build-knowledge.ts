/**
 * Knowledge Base Pre-build Script
 * 
 * Reads all PDF/text files from GMP/ directory, extracts text,
 * chunks, embeds (via SiliconFlow cloud API), and stores in SQLite.
 * 
 * Usage: npx tsx scripts/build-knowledge.ts
 * 
 * Environment:
 *   LLM_API_KEY - SiliconFlow API key for embedding
 *   LLM_BASE_URL - API base URL (default: https://api.siliconflow.cn/v1)
 */

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

// ============================================================================
// Configuration
// ============================================================================

const PROJECT_ROOT = path.resolve(__dirname, '..');
const GMP_DIR = path.join(PROJECT_ROOT, 'GMP');
const DEVIATION_DIR = path.join(PROJECT_ROOT, 'docs', '偏差处理');
const DB_PATH = path.join(PROJECT_ROOT, 'data', 'gmpilot.db');
const EMBEDDING_API_KEY = process.env.LLM_API_KEY || 'sk-fkmixpwmmelmteznqxxfspyjmlusjthkmntfmzacifuocgke';
const EMBEDDING_BASE_URL = process.env.LLM_BASE_URL || 'https://api.siliconflow.cn/v1';
const EMBEDDING_MODEL = 'BAAI/bge-large-zh-v1.5';
const EMBEDDING_DIMENSIONS = 1024;
const CHUNK_MAX_CHARS = 8000;
const EMBED_BATCH_SIZE = 2;
const MAX_EMBED_CHARS = 500; // bge-large-zh has 512 token limit, 500 chars safe
const EMBED_DELAY_MS = 1000; // Delay between batches to avoid rate limit

// ============================================================================
// Chunker (inline to avoid import issues)
// ============================================================================

interface Chunk {
  content: string;
  index: number;
  sectionPath: string;
  charCount: number;
}

const SECTION_PATTERNS = [
  /^第[一二三四五六七八九十百千]+[章节条款]\s*.*/,
  /^[一二三四五六七八九十]+[、.]\s*.*/,
  /^#{1,4}\s+.*/,
  /^\d+[、.]\s+.*/,
  /^[（(]\d+[)）]\s+.*/,
];

function isSectionHeading(line: string): boolean {
  return SECTION_PATTERNS.some((p) => p.test(line.trim()));
}

function chunkText(text: string, maxChars = CHUNK_MAX_CHARS): Chunk[] {
  if (!text || text.trim().length === 0) return [];

  const lines = text.split('\n');
  const sections: { title: string; content: string }[] = [];
  let currentTitle = '文档开头';
  let currentLines: string[] = [];

  for (const line of lines) {
    if (isSectionHeading(line) && currentLines.length > 0) {
      sections.push({ title: currentTitle, content: currentLines.join('\n') });
      currentTitle = line.trim();
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }
  if (currentLines.length > 0) {
    sections.push({ title: currentTitle, content: currentLines.join('\n') });
  }

  const chunks: Chunk[] = [];
  let index = 0;

  for (const section of sections) {
    const content = section.content.trim();
    if (!content) continue;

    if (content.length <= maxChars) {
      chunks.push({ content, index: index++, sectionPath: section.title, charCount: content.length });
    } else {
      // Split large sections by paragraphs
      const paragraphs = content.split(/\n\n+/);
      let buffer = '';
      for (const para of paragraphs) {
        if (buffer.length + para.length > maxChars && buffer.length > 0) {
          chunks.push({ content: buffer.trim(), index: index++, sectionPath: section.title, charCount: buffer.length });
          buffer = para;
        } else {
          buffer += (buffer ? '\n\n' : '') + para;
        }
      }
      if (buffer.trim()) {
        chunks.push({ content: buffer.trim(), index: index++, sectionPath: section.title, charCount: buffer.length });
      }
    }
  }

  return chunks;
}

// ============================================================================
// Embedding (SiliconFlow API)
// ============================================================================

async function embedBatch(texts: string[], retries = 3): Promise<number[][]> {
  // Truncate texts to avoid token limit (512 tokens per input)
  const truncated = texts.map(t => {
    const clean = t.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ').trim();
    return clean.length > MAX_EMBED_CHARS ? clean.substring(0, MAX_EMBED_CHARS) : (clean || ' ');
  });

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${EMBEDDING_BASE_URL}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${EMBEDDING_API_KEY}`,
        },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: truncated }),
      });

      if (!response.ok) {
        const err = await response.text();
        if (response.status === 429 || (response.status === 400 && attempt < retries)) {
          // Rate limit or transient error - retry with backoff
          const delay = EMBED_DELAY_MS * (attempt + 1) * 2;
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw new Error(`Embedding API error ${response.status}: ${err}`);
      }

      const data = await response.json() as { data: { embedding: number[] }[] };
      return data.data.map((item) => item.embedding);
    } catch (error) {
      if (attempt === retries) throw error;
      await new Promise((r) => setTimeout(r, EMBED_DELAY_MS * (attempt + 1)));
    }
  }
  throw new Error('Embedding failed after retries');
}

async function embedAll(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const embeddings = await embedBatch(batch);
    results.push(...embeddings);
    if (i + EMBED_BATCH_SIZE < texts.length) {
      process.stdout.write(`  Embedding: ${Math.min(i + EMBED_BATCH_SIZE, texts.length)}/${texts.length}\r`);
      await new Promise((r) => setTimeout(r, EMBED_DELAY_MS));
    }
  }
  return results;
}

// ============================================================================
// PDF Text Extraction
// ============================================================================

async function extractPdfText(filePath: string): Promise<string> {
  const pdfParse = await import('pdf-parse');
  const PDFParse = (pdfParse as any).PDFParse || (pdfParse as any).default;
  
  if (typeof PDFParse === 'function' && PDFParse.prototype?.getText) {
    // New API: class-based
    const buffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return result.text || '';
  } else {
    // Legacy API: function-based
    const buffer = fs.readFileSync(filePath);
    const result = await PDFParse(buffer);
    return result.text || '';
  }
}

// ============================================================================
// File Discovery
// ============================================================================

function discoverFiles(dir: string): { filePath: string; relativePath: string }[] {
  const files: { filePath: string; relativePath: string }[] = [];
  const supportedExts = ['.pdf', '.txt', '.md', '.docx'];

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (supportedExts.includes(ext)) {
          files.push({
            filePath: fullPath,
            relativePath: path.relative(dir, fullPath),
          });
        }
      }
    }
  }

  walk(dir);
  return files;
}

// ============================================================================
// Database Setup
// ============================================================================

function setupDatabase(): Database.Database {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');

  // Load sqlite-vec WASM extension (same as app's RAG store)
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sqliteVec = require('sqlite-vec');
    sqliteVec.load(db);
    console.log('  sqlite-vec extension loaded');
  } catch (e) {
    console.log('  WARN: sqlite-vec not available, will use fallback table');
  }

  // Ensure tables exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_docs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      source TEXT NOT NULL,
      category TEXT DEFAULT '',
      content TEXT NOT NULL,
      chunk_count INTEGER DEFAULT 0,
      indexed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create vector table (same schema as app's RAG store: document_embeddings)
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS document_embeddings USING vec0(
        doc_id INTEGER,
        chunk_index INTEGER,
        content TEXT,
        section_path TEXT,
        embedding float[${EMBEDDING_DIMENSIONS}]
      );
    `);
  } catch {
    // sqlite-vec not available, use fallback table
    db.exec(`
      CREATE TABLE IF NOT EXISTS document_embeddings_fallback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id INTEGER NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        section_path TEXT DEFAULT '',
        embedding BLOB NOT NULL
      );
    `);
  }

  return db;
}

// ============================================================================
// Vector Storage
// ============================================================================

function storeVectors(
  db: Database.Database,
  docId: number,
  chunks: Chunk[],
  embeddings: number[][],
): void {
  // Delete old vectors for this doc
  try {
    db.prepare('DELETE FROM document_embeddings WHERE doc_id = ?').run(docId);
  } catch {
    // Try fallback table
    try {
      db.prepare('DELETE FROM document_embeddings_fallback WHERE doc_id = ?').run(docId);
    } catch { /* table might not exist */ }
  }

  // Try sqlite-vec first
  let useVec0 = false;
  try {
    db.prepare('SELECT count(*) FROM document_embeddings').get();
    useVec0 = true;
  } catch {
    useVec0 = false;
  }

  const insertTransaction = db.transaction(() => {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];
      const floatBuf = Buffer.from(new Float32Array(embedding).buffer);

      if (useVec0) {
        // vec0 virtual table: use hex-encoded embedding
        const embeddingHex = floatBuf.toString('hex');
        const content = chunk.content.replace(/'/g, "''").substring(0, 50000);
        const sectionPath = chunk.sectionPath.replace(/'/g, "''").substring(0, 1000);
        db.exec(
          `INSERT INTO document_embeddings (doc_id, chunk_index, content, section_path, embedding) VALUES (${docId}, ${chunk.index}, '${content}', '${sectionPath}', X'${embeddingHex}')`
        );
      } else {
        // Fallback: store as blob
        db.prepare(
          'INSERT INTO document_embeddings_fallback (doc_id, chunk_index, content, section_path, embedding) VALUES (?, ?, ?, ?, ?)'
        ).run(docId, chunk.index, chunk.content, chunk.sectionPath, floatBuf);
      }
    }
  });

  insertTransaction();
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('=== GMPilot Knowledge Base Pre-build ===\n');
  console.log(`GMP directory: ${GMP_DIR}`);
  console.log(`Deviation directory: ${DEVIATION_DIR}`);
  console.log(`Database: ${DB_PATH}`);
  console.log(`Embedding: ${EMBEDDING_MODEL} via ${EMBEDDING_BASE_URL}\n`);

  // Discover files from both directories
  let files: { filePath: string; relativePath: string; source: string; category: string }[] = [];

  if (fs.existsSync(GMP_DIR)) {
    const gmpFiles = discoverFiles(GMP_DIR).map(f => ({
      ...f,
      source: 'gmp_regulation',
      category: getCategory(f.relativePath),
    }));
    files.push(...gmpFiles);
  } else {
    console.log(`WARN: GMP directory not found: ${GMP_DIR}`);
  }

  if (fs.existsSync(DEVIATION_DIR)) {
    const devFiles = discoverFiles(DEVIATION_DIR).map(f => ({
      ...f,
      source: 'builtin',
      category: getDeviationCategory(f.relativePath),
    }));
    files.push(...devFiles);
  } else {
    console.log(`WARN: Deviation directory not found: ${DEVIATION_DIR}`);
  }

  console.log(`Found ${files.length} files to index\n`);

  if (files.length === 0) {
    console.log('No files to process. Done.');
    return;
  }

  // Setup database
  const db = setupDatabase();

  let totalChunks = 0;
  let processedFiles = 0;
  let failedFiles = 0;

  for (const file of files) {
    const startTime = Date.now();
    process.stdout.write(`[${processedFiles + 1}/${files.length}] ${file.relativePath} ... `);

    try {
      // Extract text
      let text: string;
      const ext = path.extname(file.filePath).toLowerCase();
      if (ext === '.pdf') {
        text = await extractPdfText(file.filePath);
      } else {
        text = fs.readFileSync(file.filePath, 'utf-8');
      }

      if (!text || text.trim().length < 50) {
        console.log('SKIPPED (too short or empty)');
        processedFiles++;
        continue;
      }

      // Chunk
      const chunks = chunkText(text);
      if (chunks.length === 0) {
        console.log('SKIPPED (no chunks)');
        processedFiles++;
        continue;
      }

      // Check if already indexed
      const existing = db.prepare(
        'SELECT id, chunk_count FROM knowledge_docs WHERE filename = ? AND source = ?'
      ).get(file.relativePath, file.source) as { id: number; chunk_count: number } | undefined;

      let docId: number;
      if (existing && existing.chunk_count > 0) {
        console.log(`ALREADY INDEXED (${existing.chunk_count} chunks)`);
        processedFiles++;
        totalChunks += existing.chunk_count;
        continue;
      }

      if (existing) {
        docId = existing.id;
      } else {
        const result = db.prepare(
          'INSERT INTO knowledge_docs (filename, source, category, content, chunk_count) VALUES (?, ?, ?, ?, 0)'
        ).run(file.relativePath, file.source, file.category, text);
        docId = result.lastInsertRowid as number;
      }

      // Embed
      const chunkTexts = chunks.map((c) => c.content);
      const embeddings = await embedAll(chunkTexts);

      // Store
      storeVectors(db, docId, chunks, embeddings);

      // Update doc record
      db.prepare(
        'UPDATE knowledge_docs SET chunk_count = ?, indexed_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(chunks.length, docId);

      totalChunks += chunks.length;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`OK (${chunks.length} chunks, ${elapsed}s)`);
    } catch (error) {
      failedFiles++;
      console.log(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
    }

    processedFiles++;
  }

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Files processed: ${processedFiles}`);
  console.log(`Files failed: ${failedFiles}`);
  console.log(`Total chunks indexed: ${totalChunks}`);

  // Verify retrieval works
  console.log('\n=== Verification ===');
  try {
    const testQuery = 'GMP质量管理偏差处理';
    const queryEmbedding = await embedBatch([testQuery]);
    const floatBuf = Buffer.from(new Float32Array(queryEmbedding[0]).buffer);

    let results: unknown[];
    try {
      results = db.prepare(
        `SELECT content, section_path, distance
         FROM document_embeddings
         WHERE embedding MATCH ?
         ORDER BY distance
         LIMIT 3`
      ).all(floatBuf) as unknown[];
    } catch {
      // Fallback brute-force
      const allChunks = db.prepare('SELECT * FROM document_embeddings_fallback LIMIT 100').all() as { embedding: Buffer; content: string }[];
      const queryVec = new Float32Array(queryEmbedding[0]);
      results = allChunks
        .map((row) => {
          const vec = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.length / 4);
          let dot = 0;
          for (let i = 0; i < vec.length; i++) dot += vec[i] * queryVec[i];
          return { content: row.content.substring(0, 100), similarity: dot };
        })
        .sort((a, b) => (b as any).similarity - (a as any).similarity)
        .slice(0, 3);
    }

    console.log(`Test query: "${testQuery}"`);
    console.log(`Results: ${results.length} matches`);
    if (results.length > 0) {
      const first = results[0] as any;
      console.log(`Top match: ${(first.content || '').substring(0, 80)}...`);
    }
  } catch (error) {
    console.log(`Verification failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  db.close();
  console.log('\nDone!');
}

function getCategory(relativePath: string): string {
  if (relativePath.includes('第一部分')) return 'GMP第一部分';
  if (relativePath.includes('第二部分')) return 'GMP第二部分';
  if (relativePath.includes('第三部分')) return 'GMP第三部分';
  if (relativePath.includes('附件')) return 'GMP附件';
  return 'EU法规';
}

function getDeviationCategory(relativePath: string): string {
  const lower = relativePath.toLowerCase();
  if (lower.includes('sop') || lower.includes('模板') || lower.includes('细则')) return 'sop';
  return 'deviation';
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
