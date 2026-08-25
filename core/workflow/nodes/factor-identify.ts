/**
 * Factor Identify node — Step 3 of deviation workflow.
 * Identifies 5M1E factors from clue analysis.
 */

import { identifyFactors } from '../../llm/caller';
import { createLogger } from '../../utils/logger';
import type { ClueAnalysis, Factor5M1E, Finding, FindingType, SeverityLevel } from '../types';

const log = createLogger('Workflow');

/**
 * 启发式判定因素严重度（对齐 audit-report prompt 的 severity 标准）：
 * - high = 影响产品质量/患者安全/合规性直接违反（校准过期、超限、污染、失效等）
 * - medium = 合规性缺陷（培训不足、SOP 不明确、记录缺失等）
 * - low = 文档质量不足（笔误、格式等）
 * 修复原实现所有因素恒为 medium，导致 calculateRiskScore 永远达不到 high 的问题。
 */
const HIGH_SEVERITY_KEYWORDS = [
  '校准', '过期', '超限', '超标', '污染', '失效', '报废', '停产', '泄漏', '混批',
  '放行', '投诉', '不良反应', '产品安全', '灭菌失败', '无菌',
];
const LOW_SEVERITY_KEYWORDS = ['笔误', '表述不清', '排版', '格式', '错别字'];

function estimateSeverity(factor: string): SeverityLevel {
  if (HIGH_SEVERITY_KEYWORDS.some((k) => factor.includes(k))) return 'high';
  if (LOW_SEVERITY_KEYWORDS.some((k) => factor.includes(k))) return 'low';
  return 'medium';
}

/**
 * Map 5M1E factors to AuditBee Finding format.
 */
function factorsToFindings(factors: Factor5M1E): Finding[] {
  const findings: Finding[] = [];

  const factorMap: [keyof Factor5M1E, string, FindingType][] = [
    ['man', '人', 'compliance_risk'],
    ['machine', '机', 'compliance_risk'],
    ['material', '料', 'compliance_risk'],
    ['method', '法', 'logic_flaw'],
    ['environment', '环', 'compliance_risk'],
    ['measurement', '测', 'compliance_risk'],
  ];

  for (const [key, label, findingType] of factorMap) {
    for (const factor of factors[key]) {
      if (factor.trim()) {
        findings.push({
          finding_type: findingType,
          severity: estimateSeverity(factor),
          title: `${label} — ${factor}`,
          description: factor,
        });
      }
    }
  }

  return findings;
}

/**
 * Identify 5M1E factors from clue text and analysis.
 * @param clueText Original clue text
 * @param analysis Clue analysis result from step 2
 * @returns Factors and derived findings
 */
export async function identifyFactorsNode(
  clueText: string,
  analysis: ClueAnalysis,
): Promise<{ factors: Factor5M1E; findings: Finding[] }> {
  log.info('Starting factor-identify');
  const factors = await identifyFactors(clueText, analysis);
  const findings = factorsToFindings(factors);
  log.info('Factor-identify completed', { factors: Object.values(factors).flat().length, findings: findings.length });
  return { factors, findings };
}
