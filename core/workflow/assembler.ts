/**
 * Report assembler.
 * Assembles generated modules into a complete deviation report.
 */

import { createLogger } from '../utils/logger';
import type { DeviationReport, ReportMetadata } from './types';
import type { BackgroundOutput } from './modules/background';
import type { InvestigationOutput } from './modules/investigation';
import type { ConclusionOutput } from './modules/conclusion';
import type { RiskAssessmentOutput } from './modules/risk-assessment';
import type { CAPAOutput } from './modules/capa';
import type { CoverOutput } from './modules/cover';
import type { AttachmentsOutput } from './modules/attachments';
import { calculateRiskScore } from './nodes/report-generate';
import type { Finding } from './types';

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
}

/**
 * Assemble all modules into a complete DeviationReport.
 */
export function assembleReport(
  deviationId: string,
  modules: ModulesResult,
  factors: unknown,
  regulations: unknown[],
  findings: Finding[],
): DeviationReport {
  log.info('Assembling report', { deviationId });

  // Calculate risk score from findings
  const { score, level } = calculateRiskScore(findings);

  // Build report metadata
  const metadata: ReportMetadata = {
    findings_count: findings.length,
    task_type: 'deviation_analysis',
    report_source: 'gmpilot_generate',
    deviation_id: deviationId,
    risk_score: score,
    risk_level: level,
  };

  // Assemble complete report
  const report: DeviationReport = {
    // AuditBee compatible fields
    report_type: 'full_report',
    title: `偏差报告 - ${deviationId}`,
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
 * Generate modules in parallel with dependency ordering.
 *
 * Phase 1 (parallel): background, investigation
 * Phase 2 (depends on Phase 1): conclusion
 * Phase 3 (depends on Phase 2): riskAssessment, capa
 * Phase 4 (auto): cover, attachments
 */
export async function generateModules(
  generators: {
    cover: { generate: (ctx: unknown) => Promise<CoverOutput> };
    background: { generate: (ctx: unknown) => Promise<BackgroundOutput> };
    investigation: { generate: (ctx: unknown) => Promise<InvestigationOutput> };
    conclusion: { generate: (ctx: unknown) => Promise<ConclusionOutput> };
    riskAssessment: { generate: (ctx: unknown) => Promise<RiskAssessmentOutput> };
    capa: { generate: (ctx: unknown) => Promise<CAPAOutput> };
    attachments: { generate: (ctx: unknown) => Promise<AttachmentsOutput> };
  },
  context: {
    deviationId: string;
    analysis: unknown;
    factors: unknown;
    regulations: unknown;
    findings: unknown;
    regulationContext?: string;
  },
  onProgress?: (phase: string, module: string) => void,
): Promise<ModulesResult> {
  log.info('Starting module generation', { deviationId: context.deviationId });

  const results: Partial<ModulesResult> = {};

  // Phase 1: parallel generation
  onProgress?.('phase1', 'background');
  onProgress?.('phase1', 'investigation');

  const [background, investigation] = await Promise.all([
    generators.background.generate(context),
    generators.investigation.generate(context),
  ]);

  results.background = background;
  results.investigation = investigation;

  // Phase 2: conclusion (depends on investigation)
  onProgress?.('phase2', 'conclusion');

  const conclusionContext = {
    ...context,
    previousResults: { investigation },
  };
  results.conclusion = await generators.conclusion.generate(conclusionContext);

  // Phase 3: risk assessment and CAPA (depends on conclusion)
  onProgress?.('phase3', 'riskAssessment');
  onProgress?.('phase3', 'capa');

  const riskContext = {
    ...context,
    previousResults: { investigation, conclusion: results.conclusion },
  };

  const [riskAssessment, capa] = await Promise.all([
    generators.riskAssessment.generate(riskContext),
    generators.capa.generate(riskContext),
  ]);

  results.riskAssessment = riskAssessment;
  results.capa = capa;

  // Phase 4: auto-generated sections
  onProgress?.('phase4', 'cover');
  onProgress?.('phase4', 'attachments');

  const autoContext = {
    ...context,
    previousResults: {
      investigation,
      conclusion: results.conclusion,
      riskAssessment,
      capa,
    },
  };

  const [cover, attachments] = await Promise.all([
    generators.cover.generate(autoContext),
    generators.attachments.generate(autoContext),
  ]);

  results.cover = cover;
  results.attachments = attachments;

  log.info('Module generation complete', { deviationId: context.deviationId });

  return results as ModulesResult;
}
