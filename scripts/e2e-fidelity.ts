/**
 * F2: End-to-end fidelity verification.
 * 以工厂真实偏差 26003R（验证探头 NBT2 无数值/UPREFLVL）为线索，
 * 跑完整流水线（分析→5M1E→RAG 法规→7 模块 LLM→组装→Word），
 * 输出 Word 报告并打印逐章关键内容，供与 26003R 对照。
 *
 * Usage: npx tsx scripts/e2e-fidelity.ts
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../config/.env') });

const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'data', 'e2e-fidelity');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const CLUE = `2026.03.23 10:48，验证部人员吴思潭在Y10车间二楼207灭菌室1查看快冷式脉动真空灭菌器（设备编号：152903-109-0008）液体20分钟最大装载灭菌验证的实时数据时，发现验证探头NBT2（NBT2-A和NBT2-B）在10:40:30开始无数值（此时已灭菌8min），显示为"UPREFLVL"。其余10个温度探头数据均正常。该再确认方案为H3-VD-26684-RQ/08版，2026.02.26批准，内容含关键仪表校验、热穿透、微生物挑战等。当天已先完成液体30分钟最小装载模式，运行正常。发现偏差后立即停止灭菌程序。供应商初步回复"UPREFLVL"提示A/D转换器参考电压异常，通常由电路仓内短路或信号过载引起。属设备验证偏差，需调查根本原因。`;

async function main() {
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║   GMPilot End-to-End Fidelity Test (260603)   ║');
  console.log('╚═══════════════════════════════════════════════╝\n');

  console.log(`Model: ${process.env.LLM_MODEL || '(env)'}`);
  console.log(`Output: ${OUTPUT_DIR}\n`);

  const { getDatabase, initSchema } = await import('../core/db/connection');
  const { initRetriever } = await import('../core/rag/index');
  const db = getDatabase();
  await initSchema(db);
  let regulationContext = '';
  try {
    await initRetriever(db);
    console.log('  RAG ready\n');
  } catch (e) {
    console.log(`  RAG skip: ${String(e)}\n`);
  }

  const { analyzeClueNode } = await import('../core/workflow/nodes/clue-analysis');
  const { identifyFactorsNode } = await import('../core/workflow/nodes/factor-identify');
  const { matchRegulationsNode } = await import('../core/workflow/nodes/regulation-match');
  const { generateModules, assembleReport } = await import('../core/workflow/assembler');
  const { BackgroundGenerator } = await import('../core/workflow/modules/background');
  const { InvestigationGenerator } = await import('../core/workflow/modules/investigation');
  const { ConclusionGenerator } = await import('../core/workflow/modules/conclusion');
  const { RiskAssessmentGenerator } = await import('../core/workflow/modules/risk-assessment');
  const { CAPAGenerator } = await import('../core/workflow/modules/capa');
  const { CoverGenerator } = await import('../core/workflow/modules/cover');
  const { AttachmentsGenerator } = await import('../core/workflow/modules/attachments');
  const { renderTemplate } = await import('../core/word/filler');
  const { buildDocxData } = await import('../core/word/filler');

  const t0 = Date.now();

  // Step 2: 分析
  console.log('── Step 2: 偏差分析 ──');
  const analysis = await analyzeClueNode(CLUE);
  console.log(`  summary: ${String(analysis.summary).slice(0, 150)}...\n`);

  // Step 3: 5M1E
  console.log('── Step 3: 因素识别 ──');
  const identified = await identifyFactorsNode(analysis);
  const factors = identified.factors;
  const findings = identified.findings;
  console.log(`  因素: ${Object.keys(factors).join('、')}, findings=${findings.length}\n`);

  // Step 4: 法规匹配（RAG 失败降级）
  console.log('── Step 4: 法规匹配 ──');
  let regulations: unknown[] = [];
  try {
    regulations = await matchRegulationsNode(analysis.summary, factors, regulationContext);
    regulationContext = `匹配 ${regulations.length} 条法规。${JSON.stringify(regulations.slice(0, 2))}`;
  } catch (e) {
    console.log(`  法规匹配降级: ${String(e)}`);
  }
  console.log(`  命中 ${regulations.length} 条\n`);

  // Step 5: 模块生成
  console.log('── Step 5: 模块生成（真实 LLM）──');
  const deviationId = `DEV-${Date.now().toString(36).toUpperCase()}`;
  const moduleContext = {
    deviationId,
    analysis,
    factors,
    regulations: regulations as never[],
    findings,
    regulationContext,
  };
  const modules = await generateModules(
    {
      cover: new CoverGenerator(),
      background: new BackgroundGenerator(),
      investigation: new InvestigationGenerator(),
      conclusion: new ConclusionGenerator(),
      riskAssessment: new RiskAssessmentGenerator(),
      capa: new CAPAGenerator(),
      attachments: new AttachmentsGenerator(),
    },
    moduleContext,
    (phase, mod) => console.log(`    ${phase}: ${mod}`),
  );
  console.log(`  fallbacks: ${(modules.fallbackModules || []).join(', ') || '无'}\n`);

  // Step 6: 组装
  console.log('── Step 6: 组装 ──');
  const report = assembleReport(deviationId, modules, factors, regulations as unknown[], findings);
  console.log(`  标题: ${report.title}`);
  console.log(`  风险: ${report.riskScore} / ${report.riskLevel}`);
  console.log(`  第3章结论: ${String(report.conclusion?.rootCause || '').slice(0, 120)}`);
  console.log(`  第4章小结: ${String(report.riskAssessment?.summary || '').slice(0, 120)}`);
  console.log(`  CAPA: ${(report.capa?.corrections || []).length} 纠正 + ${(report.capa?.preventions || []).length} 预防\n`);

  // Step 7: Word
  console.log('── Step 7: Word 导出 ──');
  const docxData = buildDocxData(report);
  const outPath = path.join(OUTPUT_DIR, `${deviationId}.docx`);
  const buf = renderTemplate(docxData);
  fs.writeFileSync(outPath, buf);
  fs.writeFileSync(path.join(OUTPUT_DIR, `${deviationId}.docx.json`), JSON.stringify(docxData, null, 2));
  console.log(`  Word: ${outPath} (${buf.length} bytes)`);
  console.log(`  数据: ${path.join(OUTPUT_DIR, `${deviationId}.docx.json`)}`);

  console.log(`\n── Done in ${((Date.now() - t0) / 1000).toFixed(1)}s ──`);
}

main().catch((e) => {
  console.error('F2 e2e failed:', e);
  process.exit(1);
});