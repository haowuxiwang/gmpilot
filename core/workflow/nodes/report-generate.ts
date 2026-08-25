/**
 * Report Generate node — Step 5 of deviation workflow.
 * Generates the final deviation report as structured JSON.
 */

import { generateReport as generateReportLLM, streamReport as streamReportLLM } from '../../llm/caller';
import { createLogger } from '../../utils/logger';
import type {
  ClueAnalysis,
  Factor5M1E,
  RegulationMatch,
  Finding,
  DeviationReport,
  ReportMetadata,
} from '../types';

const log = createLogger('Workflow');

// Risk score weights per severity level (aligned with AuditBee)
const RISK_WEIGHTS: Record<string, number> = { high: 60, medium: 30, low: 10, info: 5 };
const RISK_THRESHOLD_HIGH = 60;
const RISK_THRESHOLD_MEDIUM = 30;

/**
 * Calculate risk score from findings.
 * Aligned with AuditBee's calculate_risk_score() pattern.
 * Score = 主导严重级别权重 + 数量递减修正，封顶 100。
 * 数量修正每多 1 条 +5、封顶 +20，避免候选因素堆叠导致分数虚高。
 * Level: >=60 high, >=30 medium, else low.
 */
export function calculateRiskScore(findings: Finding[]): { score: number; level: 'high' | 'medium' | 'low' | 'info' } {
  if (findings.length === 0) return { score: 0, level: 'low' };

  // 主导严重级别决定基础分
  let base = 0;
  for (const f of findings) {
    base = Math.max(base, RISK_WEIGHTS[f.severity] || 10);
  }

  // 数量修正：多条同级别发现小幅累加，封顶 +20
  const extra = Math.min((findings.length - 1) * 5, 20);
  const score = Math.min(base + extra, 100);

  if (score >= RISK_THRESHOLD_HIGH) return { score, level: 'high' };
  if (score >= RISK_THRESHOLD_MEDIUM) return { score, level: 'medium' };
  return { score, level: 'low' };
}

/**
 * Generate deviation report.
 * @param deviationId Auto-generated deviation ID
 * @param analysis Clue analysis from step 2
 * @param factors 5M1E factors from step 3
 * @param regulations Matched regulations from step 4
 * @param findings Derived findings from step 3
 * @returns Complete deviation report with structured content
 */
export async function generateReportNode(
  deviationId: string,
  analysis: ClueAnalysis,
  factors: Factor5M1E,
  regulations: RegulationMatch[],
  findings: Finding[],
  onPartial?: (partial: Partial<DeviationReport>) => void,
): Promise<DeviationReport> {
  log.info('Starting report-generate', { deviationId, findings: findings.length, regulations: regulations.length });

  // 优化2: 使用流式生成，实时推送部分结果
  const llmReport = onPartial
    ? await streamReportLLM(
        deviationId,
        analysis.summary,
        factors,
        regulations,
        findings,
        onPartial,
      )
    : await generateReportLLM(
    deviationId,
    analysis.summary,
    factors,
    regulations,
    findings,
  );

  // Validate LLM output has required fields
  if (!llmReport || typeof llmReport !== 'object') {
    throw new Error('Invalid report output: LLM returned empty or non-object result');
  }
  if (!llmReport.cover && !llmReport.background && !llmReport.investigation) {
    log.warn('Report output missing major sections', { deviationId });
  }

  // Calculate risk score
  const { score, level } = calculateRiskScore(findings);
  log.info('Report generated', { deviationId, riskScore: score, riskLevel: level });

  // Build report metadata (aligned with AuditBee)
  const metadata: ReportMetadata = {
    findings_count: findings.length,
    task_type: analysis.documentType,
    report_source: 'gmpilot_generate',
    deviation_id: deviationId,
    risk_score: score,
    risk_level: level,
  };

  // Merge LLM output with computed fields
  return {
    // AuditBee 兼容字段
    report_type: 'full_report',
    title: `偏差报告 - ${deviationId}`,
    report_metadata: metadata,

    // 结构化内容（来自 LLM）
    cover: llmReport.cover,
    background: llmReport.background,
    investigation: llmReport.investigation,
    conclusion: llmReport.conclusion,
    riskAssessment: llmReport.riskAssessment,
    capa: llmReport.capa,
    attachments: llmReport.attachments,
    versionHistory: llmReport.versionHistory,

    // 计算字段
    deviationId,
    riskScore: score,
    riskLevel: level,

    // 保留原始数据用于审计
    factors,
    regulations,
    findings,
  };
}
