/**
 * Pre-process EU GMP PDF files into plain text for builtin knowledge base.
 * Usage: npx tsx scripts/preprocess-gmp-pdfs.ts
 *
 * Reads all PDFs from GMP/ directory (recursively), extracts text,
 * and saves as .txt files in knowledge/builtin/ with sanitized names.
 */

import fs from 'fs';
import path from 'path';

const GMP_DIR = path.resolve(__dirname, '../GMP');
const OUTPUT_DIR = path.resolve(__dirname, '../knowledge/builtin');

// Category mapping based on directory structure
const CATEGORY_MAP: Record<string, string> = {
  '第一部分': 'eu_gmp_part1',
  '第二部分': 'eu_gmp_part2',
  '第三部分': 'eu_gmp_part3',
  '附件': 'eu_gmp_annex',
};

function sanitizeFilename(pdfPath: string): string {
  const relative = path.relative(GMP_DIR, pdfPath);
  const dir = path.dirname(relative);
  const basename = path.basename(pdfPath, '.pdf');

  // Get category prefix
  const topDir = dir.split(path.sep)[0];
  const prefix = CATEGORY_MAP[topDir] || 'eu_gmp';

  // Sanitize: lowercase, replace spaces/special chars with underscore
  const clean = basename
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  return `${prefix}_${clean}.txt`;
}

async function extractPdfText(pdfPath: string): Promise<string> {
  const { PDFParse } = await import('pdf-parse');
  const buffer = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();
  return result.text || '';
}

function findPdfFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findPdfFiles(fullPath));
    } else if (entry.name.toLowerCase().endsWith('.pdf')) {
      results.push(fullPath);
    }
  }

  return results;
}

async function main() {
  console.log('=== EU GMP PDF Preprocessor ===');
  console.log(`Source: ${GMP_DIR}`);
  console.log(`Output: ${OUTPUT_DIR}`);

  if (!fs.existsSync(GMP_DIR)) {
    console.error(`ERROR: GMP directory not found: ${GMP_DIR}`);
    process.exit(1);
  }

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const pdfFiles = findPdfFiles(GMP_DIR);
  console.log(`Found ${pdfFiles.length} PDF files\n`);

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const pdfPath of pdfFiles) {
    const outName = sanitizeFilename(pdfPath);
    const outPath = path.join(OUTPUT_DIR, outName);

    // Skip if already processed
    if (fs.existsSync(outPath)) {
      const existing = fs.readFileSync(outPath, 'utf-8');
      if (existing.trim().length > 100) {
        console.log(`  SKIP (exists): ${outName}`);
        skipped++;
        continue;
      }
    }

    try {
      const text = await extractPdfText(pdfPath);

      if (!text || text.trim().length < 50) {
        console.log(`  WARN (empty): ${path.basename(pdfPath)} → skipped`);
        failed++;
        continue;
      }

      // Add metadata header
      const relative = path.relative(GMP_DIR, pdfPath);
      const header = `[Source: ${relative}]\n[Format: EU GMP Regulation]\n\n`;
      const content = header + text;

      fs.writeFileSync(outPath, content, 'utf-8');
      const sizeKb = (Buffer.byteLength(content) / 1024).toFixed(1);
      console.log(`  OK: ${outName} (${sizeKb}KB, ${text.length} chars)`);
      success++;
    } catch (error) {
      console.error(`  FAIL: ${path.basename(pdfPath)} → ${error}`);
      failed++;
    }
  }

  console.log(`\n=== Done: ${success} processed, ${skipped} skipped, ${failed} failed ===`);
}

main().catch(console.error);
