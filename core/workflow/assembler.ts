/**
 * Report assembler.
 * Assembles generated modules into a complete deviation report.
 */

import { createLogger } from '../utils/logger';
import type { DeviationReport, ReportMetadata, WorkflowContext } from './types';
import type { BackgroundOutput } from './modules/background';
import type { InvestigationOutput } from './modules/investigation';
import type { ConclusionOutput } from './modules/conclusion';
import type { RiskAssessmentOutput } from './modules/risk-assessment';
import type { CAPAOutput } from './modules/capa';
import type { CoverOutput } from './modules/cover';
import type { AttachmentsOutput } from './modules/attachments';
import { BackgroundGenerator } from './modules/background';
import { InvestigationGenerator } from './modules/investigation';
import { ConclusionGenerator } from './modules/conclusion';
import { RiskAssessmentGenerator } from './modules/risk-assessment';
import { CAPAGenerator } from './modules/capa';
import { CoverGenerator } from './modules/cover';
import { AttachmentsGenerator } from './modules/attachments';
import { calculateRiskScore } from './nodes/report-generate';
import type { Finding, TaskType } from './types';

// Re-export from lightweight shared module (renderer-safe)
export { mapFindingsToModules, type RevisableModule } from './module-utils';
import type { RevisableModule } from './module-utils';
import type { ModuleContext } from './modules/base';

const log = createLogger('Assembler');

/**
 * Modules result from parallel generation.
 */
export interface ModulesResult {
  cover: CoverOutput;
  background: BackgroundOutput;
  investigation: InvestigationOutput;
  conclusion: ConclusionOutput;
  riskAssessment: RiskAssessmentOutput;
  capa: CAPAOutput;
  attachments: AttachmentsOutput;
  /** Modules that fell back to template generation (LLM failed) */
  fallbackModules?: string[];
}

/** Which modules fell back to template generation (LLM failed) */
export interface GenerationInfo {
  fallbackModules: string[];
}

/**
 * Run a module generator with template fallback.
 * Never throws: if the generator fails, generateFallback() is used instead
 * and the module name is recorded in fallbackModules.
 */
async function runModule<T>(
  name: string,
  generate: () => Promise<T>,
  fallback: () => Promise<T>,
  fallbackModules: string[],
): Promise<T> {
  try {
    return await generate();
  } catch (error) {
    log.error(`Module ${name} generation failed, using template fallback`, { error: String(error) });
    fallbackModules.push(name);
    return fallback();
  }
}

/**
 * 附件编号联动校验：调查正文中的「详见调查报告-附件N」引用 vs 附件清单。
 * 对齐工厂实际报告——正文引用的附件序号必须与清单一一对应。
 */
export function reconcileAttachmentReferences(modules: ModulesResult): {
  referencedNos: number[];
  listedNos: number[];
  missingInList: number[];
  orphanedInList: number[];
} {
  const inv = modules.investigation;
  const texts: (string | undefined)[] = [
    inv?.investigationIntro,
    inv?.rootCause?.preliminaryAnalysis,
    ...Object.values(inv?.rootCause?.factors ?? {}),
    inv?.rootCause?.conclusion,
    inv?.repeatDeviations?.analysis,
    inv?.repeatDeviations?.conclusion,
    inv?.otherProducts?.analysis,
    inv?.otherProducts?.conclusion,
  ];
  const all = texts.filter(Boolean).join('\n');

  const referencedNos = [...new Set(
    [...all.matchAll(/附件(\d+)/g)].map(m => Number(m[1])).filter(n => !Number.isNaN(n)),
  )];
  const listedNos = (modules.attachments?.attachments ?? [])
    .map(a => Number(a.no))
    .filter(n => !Number.isNaN(n));

  const missingInList = referencedNos.filter(n => !listedNos.includes(n));
  // 仅当清单非「单附件兜底」时才算多余（fallback 固定为「1 偏差调查报告」，正文可能未引用）
  const isFallbackList = modules.attachments?.attachments?.length === 1;
  const orphanedInList = isFallbackList ? [] : listedNos.filter(n => !referencedNos.includes(n));

  if (missingInList.length > 0 || orphanedInList.length > 0) {
    log.warn('Attachment reference mismatch', {
      referencedNos,
      listedNos,
      missingInList,
      orphanedInList,
    });
  }

  return { referencedNos, listedNos, missingInList, orphanedInList };
}

/**
 * Assemble all modules into a complete DeviationReport.
 * @param documentType 分析任务类型（来源：ClueAnalysis.documentType），默认 deviation_analysis
 */
export function assembleReport(
  deviationId: string,
  modules: ModulesResult,
  factors: unknown,
  regulations: unknown[],
  findings: Finding[],
  documentType: TaskType = 'deviation_analysis',
): DeviationReport {
  log.info('Assembling report', { deviationId });

  // 附件编号联动校验（正文引用 vs 清单，不一致仅告警，不阻断生成）
  reconcileAttachmentReferences(modules);

  // Calculate risk score from findings
  const { score, level } = calculateRiskScore(findings);

  // Build report metadata
  const metadata: ReportMetadata = {
    findings_count: findings.length,
    // 与旧路径 report-generate.ts 对齐：task_type 取分析类型而非硬编码
    task_type: documentType,
    report_source: 'gmpilot_generate',
    deviation_id: deviationId,
    risk_score: score,
    risk_level: level,
  };

  // Assemble complete report
  const report: DeviationReport = {
    // AuditBee compatible fields
    report_type: 'full_report',
    // 优先使用封面生成的动态标题（如「RT探头（编号：NBQ6）偏差调查和风险评估报告」），
    // 供导出文件名 / 数据库 / 飞书通知使用；兜底用占位标题
    title: modules.cover.title && modules.cover.title !== '待补充'
      ? modules.cover.title
      : `偏差报告 - ${deviationId}`,
    report_metadata: metadata,

    // Structured content from modules
    cover: modules.cover,
    background: modules.background,
    investigation: modules.investigation,
    conclusion: modules.conclusion,
    riskAssessment: modules.riskAssessment,
    capa: modules.capa,
    attachments: modules.attachments.attachments,
    versionHistory: modules.attachments.versionHistory,

    // Computed fields
    deviationId,
    riskScore: score,
    riskLevel: level,

    // Original data for audit
    factors: factors as unknown as DeviationReport['factors'],
    regulations: regulations as DeviationReport['regulations'],
    findings,
  };

  log.info('Report assembled', {
    deviationId,
    riskScore: score,
    riskLevel: level,
    sections: Object.keys(modules).length,
  });

  return report;
}

/**
 * Build a module context from workflow input (single source of truth).
 * 统一由工作流中间产物构建模块上下文，避免多实现漂移。
 */
export function buildModuleContext(
  input: {
    analysis?: WorkflowContext['analysis'];
    factors?: WorkflowContext['factors'];
    regulations?: WorkflowContext['regulations'];
    findings?: WorkflowContext['findings'];
    regulationContext?: string;
    clueText?: string;
    revisionContext?: string;
  },
  deviationId: string,
): ModuleContext {
  return {
    deviationId,
    analysis: input.analysis ?? { summary: '', keyEvents: [], involvedParties: [], documentType: 'deviation_analysis' },
    factors: input.factors ?? { man: [], machine: [], material: [], method: [], environment: [], measurement: [] },
    regulations: input.regulations ?? [],
    findings: input.findings ?? [],
    regulationContext: input.regulationContext,
    // 关键事件与原始线索全文：调查/背景模块的核心素材（工厂报告正文 = 线索扩写）
    keyEvents: input.analysis?.keyEvents ?? [],
    clueText: input.clueText,
    // 修订上下文（REVISE 全量/REVISE_TARGETED 定向）：模块 prompt 据此调整输出
    revisionContext: input.revisionContext,
  };
}

/** Generator shape required by generateModules (must support template fallback) */
export interface ModuleGenerators {
  cover: { generate: (ctx: ModuleContext) => Promise<CoverOutput>; generateFallback: (ctx: ModuleContext) => Promise<CoverOutput> };
  background: { generate: (ctx: ModuleContext) => Promise<BackgroundOutput>; generateFallback: (ctx: ModuleContext) => Promise<BackgroundOutput> };
  investigation: { generate: (ctx: ModuleContext) => Promise<InvestigationOutput>; generateFallback: (ctx: ModuleContext) => Promise<InvestigationOutput> };
  conclusion: { generate: (ctx: ModuleContext) => Promise<ConclusionOutput>; generateFallback: (ctx: ModuleContext) => Promise<ConclusionOutput> };
  riskAssessment: { generate: (ctx: ModuleContext) => Promise<RiskAssessmentOutput>; generateFallback: (ctx: ModuleContext) => Promise<RiskAssessmentOutput> };
  capa: { generate: (ctx: ModuleContext) => Promise<CAPAOutput>; generateFallback: (ctx: ModuleContext) => Promise<CAPAOutput> };
  attachments: { generate: (ctx: ModuleContext) => Promise<AttachmentsOutput>; generateFallback: (ctx: ModuleContext) => Promise<AttachmentsOutput> };
}

/**
 * Generate modules in parallel with dependency ordering.
 *
 * Phase 1 (parallel): background, investigation, cover
 * Phase 2 (depends on Phase 1 investigation): conclusion, attachments
 * Phase 3 (depends on Phase 2): riskAssessment, capa
 *
 * Optimization: cover doesn't depend on other modules,
 * so it can run in parallel with Phase 1 to reduce total time.
 *
 * Fault tolerance: each module is wrapped with template fallback, so a
 * single LLM failure never fails the whole report.
 */
export function createDefaultGenerators(): ModuleGenerators {
  return {
    cover: new CoverGenerator(),
    background: new BackgroundGenerator(),
    investigation: new InvestigationGenerator(),
    conclusion: new ConclusionGenerator(),
    riskAssessment: new RiskAssessmentGenerator(),
    capa: new CAPAGenerator(),
    attachments: new AttachmentsGenerator(),
  };
}

export async function generateModules(
  generators: ModuleGenerators,
  context: ModuleContext,
  onProgress?: (phase: string, module: string) => void,
): Promise<ModulesResult> {
  log.info('Starting module generation', { deviationId: context.deviationId });

  const results: Partial<ModulesResult> = {};
  const fallbackModules: string[] = [];

  // Phase 1: parallel generation (background + investigation + cover)
  // cover doesn't depend on other modules, so it can run in parallel
  onProgress?.('phase1', 'background');
  onProgress?.('phase1', 'investigation');
  onProgress?.('phase1', 'cover');

  const [background, investigation, cover] = await Promise.all([
    runModule('background', () => generators.background.generate(context), () => generators.background.generateFallback(context), fallbackModules),
    runModule('investigation', () => generators.investigation.generate(context), () => generators.investigation.generateFallback(context), fallbackModules),
    runModule('cover', () => generators.cover.generate(context), () => generators.cover.generateFallback(context), fallbackModules),
  ]);

  results.background = background;
  results.investigation = investigation;
  results.cover = cover;

  // Phase 2: conclusion + attachments (both depend on investigation)
  onProgress?.('phase2', 'conclusion');
  onProgress?.('phase2', 'attachments');

  const investigationContext = {
    ...context,
    previousResults: { investigation },
  };
  const [conclusion, attachments] = await Promise.all([
    runModule('conclusion', () => generators.conclusion.generate(investigationContext), () => generators.conclusion.generateFallback(investigationContext), fallbackModules),
    runModule('attachments', () => generators.attachments.generate(investigationContext), () => generators.attachments.generateFallback(investigationContext), fallbackModules),
  ]);
  results.conclusion = conclusion;
  results.attachments = attachments;

  // Phase 3: risk assessment and CAPA (depends on conclusion)
  onProgress?.('phase3', 'riskAssessment');
  onProgress?.('phase3', 'capa');

  const riskContext = {
    ...context,
    previousResults: { investigation, conclusion: results.conclusion },
  };

  const [riskAssessment, capa] = await Promise.all([
    runModule('riskAssessment', () => generators.riskAssessment.generate(riskContext), () => generators.riskAssessment.generateFallback(riskContext), fallbackModules),
    runModule('capa', () => generators.capa.generate(riskContext), () => generators.capa.generateFallback(riskContext), fallbackModules),
  ]);

  results.riskAssessment = riskAssessment;
  results.capa = capa;

  if (fallbackModules.length > 0) {
    log.warn('Module generation completed with fallbacks', {
      deviationId: context.deviationId,
      fallbackModules,
    });
  }
  log.info('Module generation complete', { deviationId: context.deviationId });

  return {
    ...(results as ModulesResult),
    fallbackModules,
  };
}

// mapFindingsToModules and RevisableModule are now in ./module-utils.ts
// (re-exported above for backward compatibility)

/**
 * Targeted revision: regenerate only specific modules while preserving others.
 * Respects module dependency order. Each regenerated module is wrapped with
 * template fallback so a failed revision never fails the whole revision.
 */
export async function reviseModules(
  generators: {
    background: { generate: (ctx: ModuleContext) => Promise<BackgroundOutput>; generateFallback: (ctx: ModuleContext) => Promise<BackgroundOutput> };
    investigation: { generate: (ctx: ModuleContext) => Promise<InvestigationOutput>; generateFallback: (ctx: ModuleContext) => Promise<InvestigationOutput> };
    conclusion: { generate: (ctx: ModuleContext) => Promise<ConclusionOutput>; generateFallback: (ctx: ModuleContext) => Promise<ConclusionOutput> };
    riskAssessment: { generate: (ctx: ModuleContext) => Promise<RiskAssessmentOutput>; generateFallback: (ctx: ModuleContext) => Promise<RiskAssessmentOutput> };
    capa: { generate: (ctx: ModuleContext) => Promise<CAPAOutput>; generateFallback: (ctx: ModuleContext) => Promise<CAPAOutput> };
  },
  existing: ModulesResult,
  targetModules: RevisableModule[],
  context: ModuleContext & { revisionContext?: string },
  onProgress?: (module: string) => void,
): Promise<ModulesResult> {
  log.info('Starting targeted revision', {
    deviationId: context.deviationId,
    targets: targetModules,
  });

  const results: ModulesResult = { ...existing, fallbackModules: [] };
  const fallbackModules = results.fallbackModules || [];
  const revisionCtx = {
    ...context,
    revisionContext: context.revisionContext || '',
  };

  // Respect dependency order: background → investigation → conclusion → risk/capa
  // background/investigation 无依赖（investigation 的 prompt 不消费 {background}），可并行
  const backgroundTargeted = targetModules.includes('background');
  const investigationTargeted = targetModules.includes('investigation');
  if (backgroundTargeted || investigationTargeted) {
    if (backgroundTargeted) onProgress?.('background');
    if (investigationTargeted) onProgress?.('investigation');
    const [backgroundResult, investigationResult] = await Promise.all([
      backgroundTargeted
        ? runModule('background', () => generators.background.generate(revisionCtx), () => generators.background.generateFallback(revisionCtx), fallbackModules)
        : Promise.resolve(results.background),
      investigationTargeted
        ? runModule('investigation', () => generators.investigation.generate({
            ...revisionCtx,
            previousResults: { background: results.background },
          }), () => generators.investigation.generateFallback({
            ...revisionCtx,
            previousResults: { background: results.background },
          }), fallbackModules)
        : Promise.resolve(results.investigation),
    ]);
    results.background = backgroundResult;
    results.investigation = investigationResult;
  }

  if (targetModules.includes('conclusion')) {
    onProgress?.('conclusion');
    results.conclusion = await runModule('conclusion', () => generators.conclusion.generate({
      ...revisionCtx,
      previousResults: { investigation: results.investigation },
    }), () => generators.conclusion.generateFallback({
      ...revisionCtx,
      previousResults: { investigation: results.investigation },
    }), fallbackModules);
  }

  // Phase 3 modules can run in parallel
  const phase3Targets = targetModules.filter(m => m === 'riskAssessment' || m === 'capa');
  if (phase3Targets.length > 0) {
    const riskCtx = {
      ...revisionCtx,
      previousResults: { investigation: results.investigation, conclusion: results.conclusion },
    };

    const promises: Promise<void>[] = [];
    if (phase3Targets.includes('riskAssessment')) {
      onProgress?.('riskAssessment');
      promises.push(
        runModule('riskAssessment', () => generators.riskAssessment.generate(riskCtx), () => generators.riskAssessment.generateFallback(riskCtx), fallbackModules)
          .then(r => { results.riskAssessment = r; }),
      );
    }
    if (phase3Targets.includes('capa')) {
      onProgress?.('capa');
      promises.push(
        runModule('capa', () => generators.capa.generate(riskCtx), () => generators.capa.generateFallback(riskCtx), fallbackModules)
          .then(r => { results.capa = r; }),
      );
    }
    await Promise.all(promises);
  }

  if (fallbackModules.length > 0) {
    log.warn('Targeted revision completed with fallbacks', {
      deviationId: context.deviationId,
      fallbackModules,
    });
  }
  log.info('Targeted revision complete', {
    deviationId: context.deviationId,
    revised: targetModules,
  });

  return results;
}
