/**
 * 端到端：真实 LLM 生成报告 → 用 filler 导出 docx → verify-word-export 校验
 * 证明"按偏差模板完整输出偏差文档"这条护城河链路。
 */
import { createDeviationMachine } from '../core/workflow/deviation-machine';
import { createActor } from 'xstate';
import { exportDocxToFile } from '../core/word/filler';
import type { DeviationReport } from '../core/workflow/types';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// 加载 config/.env（与 electron/main.ts 一致）
dotenv.config({ path: path.resolve('config/.env') });

const CLUE = `片剂生产车间3号压片机出现片重差异超限，部分片剂超出目标片重±5%范围。
时间：2026-08-26 08:30；操作员已隔离相关批次（批号 26082601）。
初步排查：压片机中模磨损，物料粒度分布偏宽。请调查根本原因并生成偏差调查报告。`;

async function main() {
  console.log('=== 启动工作流 ===');
  const machine = createDeviationMachine();
  const actor = createActor(machine);
  actor.start();
  actor.send({ type: 'SUBMIT', clueText: CLUE, files: [] });

  const result = await new Promise<{ success: boolean; report?: unknown; error?: string }>((resolve) => {
    actor.subscribe((snapshot) => {
      const v = String(snapshot.value);
      if (v === 'review') {
        resolve({ success: true, report: snapshot.context.report });
      } else if (v.startsWith('error_') || v === 'error_timeout') {
        resolve({ success: false, error: snapshot.context.error || v });
      }
    });
    setTimeout(() => resolve({ success: false, error: '总超时' }), 9.5 * 60 * 1000);
  });

  if (!result.success || !result.report) {
    console.error('FAILED:', result.error);
    process.exit(1);
  }

  const report = result.report as DeviationReport;
  const outPath = path.resolve('dev-output/e2e-report.docx');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  exportDocxToFile(report, outPath);
  console.log('docx exported:', outPath);

  // 用一致性脚本校验导出物
  console.log('\n=== 模板一致性校验 ===');
  const output = execSync(`npx tsx scripts/verify-word-export.ts "${outPath}"`, { encoding: 'utf8', stdio: 'pipe' });
  console.log(output);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
