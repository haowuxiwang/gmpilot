/**
 * Factor Identify node — Step 3 of deviation workflow.
 * Identifies 5M1E factors from clue analysis.
 */

import { identifyFactors } from '../../llm/caller';
import { createLogger } from '../../utils/logger';
import type { ClueAnalysis, Factor5M1E, Finding, FindingType, SeverityLevel } from '../types';

const log = createLogger('Workflow');

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
  ];

  for (const [key, label, findingType] of factorMap) {
    for (const factor of factors[key]) {
      if (factor.trim()) {
        findings.push({
          finding_type: findingType,
          severity: 'medium' as SeverityLevel,
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
