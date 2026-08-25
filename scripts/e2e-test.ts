/**
 * End-to-End Test Script
 * 
 * Runs the full deviation workflow pipeline:
 * 1. Clue analysis (LLM)
 * 2. 5M1E factor identification (LLM)
 * 3. Regulation matching (LLM + RAG knowledge base)
 * 4. Modular report generation (LLM)
 * 5. Report assembly
 * 6. PDF export
 * 
 * Usage: npx tsx scripts/e2e-test.ts
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment
dotenv.config({ path: path.resolve(__dirname, '../config/.env') });

const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'data', 'e2e-output');

// Ensure output directory
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// ============================================================================
// Test Clues
// ============================================================================

const TEST_CLUES = [
  {
    id: 'test-1',
    name: '片剂重量差异超标',
    clue: '2026年7月15日，在片剂生产车间B区，压片机（设备编号：YP-203）生产阿莫西林分散片（批号：B20260715）过程中，操作人员发现片剂重量差异超出±5%的内控标准。经初步检查，压片机冲头磨损可能是导致片重差异的原因之一。当班操作员立即停机并报告QA部门。涉及产品数量约2000片，需要评估对产品质量的影响并确定后续处理方案。',
  },
  {
    id: 'test-2',
    name: '原料纯度超标(OOS)',
    clue: '2026年7月18日，QC实验室对进厂原辅料进行检验时发现，供应商XX化工提供的微晶纤维素（批号：MCC-2026-0892，入库编号：RM-2026-1205）纯度检测结果为96.2%，低于药典规定的97.0%标准。该批原料已入库但尚未投入生产。需要评估该批原料是否可以使用，以及对已生产产品的影响。检验方法为HPLC法，检验员为李明。',
  },
  {
    id: 'test-3',
    name: '清洁验证残留超标',
    clue: '2026年7月20日，在固体制剂车间进行的清洁验证（方案编号：CV-2026-015）第三轮执行中，对混合机（设备编号：HH-101）进行清洁后取样检测，发现活性成分残留量为15.8μg/cm²，超出可接受标准（≤10μg/cm²）。前一批次产品为布洛芬片（批号：BLF-2026-0456）。清洁方法为湿法清洁，使用纯化水冲洗3次。需要调查根本原因并评估对后续产品的影响。',
  },
];

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║       GMPilot End-to-End Test Suite                 ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  console.log(`API Base: ${process.env.LLM_BASE_URL || 'https://api.siliconflow.cn/v1'}`);
  console.log(`Model: ${process.env.LLM_MODEL || 'deepseek-ai/DeepSeek-V3.2'}`);
  console.log(`Output: ${OUTPUT_DIR}\n`);

  // Initialize database and RAG
  console.log('── Initializing Database & RAG ──');
  const { getDatabase, initSchema } = await import('../core/db/connection');
  const { initRetriever, getRetriever } = await import('../core/rag/index');

  const db = getDatabase();
  await initSchema(db);
  const retriever = await initRetriever(db);
  const stats = await retriever.getStats();
  console.log(`  RAG initialized: ${stats.totalChunks} chunks available\n`);

  // Import workflow modules
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
  const { generatePdfToFile } = await import('../core/pdf/generator');

  const results: { id: string; name: string; success: boolean; error?: string; pdfPath?: string; hasRegulations?: boolean; duration?: number }[] = [];

  for (const test of TEST_CLUES) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  TEST: ${test.name}`);
    console.log(`${'═'.repeat(60)}\n`);

    const startTime = Date.now();

    try {
      // Step 1: Clue Analysis
      console.log('  [1/5] 线索分析...');
      const analysis = await analyzeClueNode(test.clue);
      console.log(`        ✓ 摘要: ${analysis.summary.slice(0, 60)}...`);
      console.log(`        ✓ 关键事件: ${analysis.keyEvents.length} 个`);

      // Step 2: Factor Identification
      console.log('  [2/5] 5M1E 因素识别...');
      const { factors, findings } = await identifyFactorsNode(test.clue, analysis);
      const factorCount = Object.values(factors).reduce((sum: number, arr: string[]) => sum + arr.length, 0);
      console.log(`        ✓ 识别因素: ${factorCount} 个`);
      console.log(`        ✓ 发现: ${findings.length} 个`);

      // Step 3: Regulation Matching (with RAG)
      console.log('  [3/5] 法规匹配 (含知识库检索)...');
      const regulationContext = await retriever.getRegulationContext(test.clue);
      const regulations = await matchRegulationsNode(test.clue, factors, regulationContext);
      console.log(`        ✓ 匹配法规: ${regulations.length} 条`);
      console.log(`        ✓ RAG上下文: ${regulationContext.length} 字符`);
      if (regulationContext.length > 0) {
        console.log(`        ✓ 知识库引用片段: "${regulationContext.slice(0, 80)}..."`);
      }

      // Step 4: Module Generation
      console.log('  [4/5] 模块化报告生成...');
      const deviationId = `DEV-E2E-${test.id.toUpperCase()}`;
      const moduleContext = {
        deviationId,
        analysis,
        factors,
        regulations,
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
        (phase, module) => {
          console.log(`        → 生成中: ${module} (${phase})`);
        },
      );

      // Assemble report
      const report = assembleReport(deviationId, modules, factors, regulations, findings);
      console.log(`        ✓ 报告组装完成: ${report.deviationId}`);
      console.log(`        ✓ 风险等级: ${report.riskLevel} (评分: ${report.riskScore})`);

      // Step 5: PDF Export
      console.log('  [5/5] PDF 导出...');
      const pdfPath = path.join(OUTPUT_DIR, `${test.id}-${test.name}.pdf`);
      await generatePdfToFile({ report }, pdfPath);
      const pdfSize = fs.statSync(pdfPath).size;
      console.log(`        ✓ PDF 已导出: ${pdfPath}`);
      console.log(`        ✓ 文件大小: ${(pdfSize / 1024).toFixed(1)} KB`);

      // Save JSON report for inspection
      const jsonPath = path.join(OUTPUT_DIR, `${test.id}-report.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      const hasRegulations = regulations.length > 0 && regulationContext.length > 0;

      results.push({
        id: test.id,
        name: test.name,
        success: true,
        pdfPath,
        hasRegulations,
        duration: parseFloat(duration),
      });

      console.log(`\n  ✅ 测试通过 (${duration}s)`);
      console.log(`     法规引用: ${hasRegulations ? '✓ 有' : '✗ 无'}`);
      console.log(`     报告章节: cover, background, investigation, conclusion, riskAssessment, capa`);

    } catch (error) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      const errorMsg = error instanceof Error ? error.message : String(error);
      results.push({ id: test.id, name: test.name, success: false, error: errorMsg, duration: parseFloat(duration) });
      console.log(`\n  ❌ 测试失败 (${duration}s): ${errorMsg}`);
    }
  }

  // Summary
  console.log(`\n\n${'═'.repeat(60)}`);
  console.log('  SUMMARY');
  console.log(`${'═'.repeat(60)}\n`);

  const passed = results.filter(r => r.success).length;
  const withRegs = results.filter(r => r.hasRegulations).length;

  for (const r of results) {
    const status = r.success ? '✅' : '❌';
    const reg = r.hasRegulations ? '📚 法规引用' : '⚠️ 无法规';
    console.log(`  ${status} ${r.name} (${r.duration}s) ${r.success ? reg : r.error?.slice(0, 50) || ''}`);
  }

  console.log(`\n  总计: ${passed}/${results.length} 通过, ${withRegs}/${results.length} 含法规引用`);
  console.log(`  输出目录: ${OUTPUT_DIR}`);

  if (passed < results.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
