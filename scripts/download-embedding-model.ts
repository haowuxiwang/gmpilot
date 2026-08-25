#!/usr/bin/env node
/**
 * Embedding Model Download Script
 * Downloads BAAI/bge-large-zh-v1.5 (ONNX) for local embedding to model/BAAI/bge-large-zh-v1.5/
 *
 * 最佳实践：模型不打包进安装包，外置到 exe 旁 model/（或 EMBEDDING_MODEL_PATH 指定路径）。
 * 运行: npx tsx scripts/download-embedding-model.ts [--dir <target>] [--mirror <hf|hf-mirror>]
 */

import { config } from 'dotenv';
import { resolve, join, dirname } from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../config/.env') });

// Model files (transformers.js local format, fp32)
const FILES: Record<string, number> = {
  'config.json': 0,
  'tokenizer.json': 0,
  'tokenizer_config.json': 0,
  'vocab.txt': 0,
  'special_tokens_map.json': 0,
  'onnx/model.onnx': 1300294737, // ~1.24GB (fp32)
};

const HF_HOSTS = {
  'hf': 'https://huggingface.co',
  'hf-mirror': 'https://hf-mirror.com',
} as const;

function parseArgs(): { dir: string; mirror: keyof typeof HF_HOSTS } {
  const args = process.argv.slice(2);
  let dir = resolve(__dirname, '../model/BAAI/bge-large-zh-v1.5');
  let mirror: keyof typeof HF_HOSTS = 'hf';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir') dir = resolve(process.cwd(), args[++i]);
    if (args[i] === '--mirror') mirror = (args[++i] as keyof typeof HF_HOSTS) || 'hf';
  }
  return { dir, mirror };
}

async function downloadFile(url: string, dest: string, expectedSize: number): Promise<void> {
  fs.mkdirSync(dirname(dest), { recursive: true });

  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  const total = expectedSize || Number(response.headers.get('content-length')) || 0;
  const writer = fs.createWriteStream(dest);
  const reader = response.body.getReader();
  let received = 0;
  let lastPct = -1;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      writer.write(Buffer.from(value));
      received += value.length;
      if (total > 0) {
        const pct = Math.floor((received / total) * 100);
        if (pct !== lastPct) {
          process.stdout.write(`\r  ${pct}% (${(received / 1048576).toFixed(1)}MB)`);
          lastPct = pct;
        }
      }
    }
    writer.end();
    await new Promise((res, rej) => writer.on('finish', res).on('error', rej));
    process.stdout.write('\n');
  } finally {
    writer.destroy();
  }
}

async function main(): Promise<void> {
  const { dir, mirror } = parseArgs();
  const baseUrl = `${HF_HOSTS[mirror]}/Xenova/bge-large-zh-v1.5/resolve/main`;

  console.log(`=== Embedding Model Download ===`);
  console.log(`Target dir: ${dir}`);
  console.log(`Mirror: ${HF_HOSTS[mirror]}\n`);

  for (const [relPath] of Object.entries(FILES)) {
    const dest = join(dir, relPath);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      console.log(`[skip] ${relPath} (already exists)`);
      continue;
    }
    console.log(`[download] ${relPath}`);
    await downloadFile(`${baseUrl}/${relPath}`, dest, FILES[relPath]);
  }

  console.log('\n=== Done ===');
  console.log(`Model ready at: ${dir}`);
  console.log('部署：将整个 model/BAAI 目录放到 GMPilot.exe 同级的 model/ 下（或设置页配置 EMBEDDING_MODEL_PATH）');
}

main().catch((error) => {
  console.error('\n下载失败:', String(error));
  process.exit(1);
});
