/**
 * Lightweight module utilities shared between renderer and main process.
 * This file MUST NOT import any Node.js modules (fs, path, etc.)
 * or heavy dependencies (better-sqlite3, ai, etc.)
 * to keep it safe for renderer-side bundling.
 */

/**
 * Module name type for targeted revision.
 */
export type RevisableModule = 'background' | 'investigation' | 'conclusion' | 'riskAssessment' | 'capa';

/**
 * Map audit finding types to likely affected modules.
 */
export function mapFindingsToModules(
  findings: { finding_type: string; title: string; description?: string }[],
): RevisableModule[] {
  const modules = new Set<RevisableModule>();

  for (const f of findings) {
    const text = `${f.title} ${f.description || ''}`.toLowerCase();

    if (text.includes('背景') || text.includes('background') || text.includes('描述不完整')) {
      modules.add('background');
    }
    if (text.includes('调查') || text.includes('investigation') || text.includes('根本原因') || text.includes('root cause') || text.includes('5m1e')) {
      modules.add('investigation');
    }
    if (text.includes('结论') || text.includes('conclusion') || text.includes('逻辑')) {
      modules.add('conclusion');
    }
    if (text.includes('风险') || text.includes('risk') || text.includes('评分') || text.includes('等级')) {
      modules.add('riskAssessment');
    }
    if (text.includes('capa') || text.includes('纠正') || text.includes('预防') || text.includes('措施')) {
      modules.add('capa');
    }

    // Fallback: compliance/logic issues often affect investigation + conclusion
    if (f.finding_type === 'logic_flaw') {
      modules.add('investigation');
      modules.add('conclusion');
    }
    if (f.finding_type === 'compliance_risk') {
      modules.add('investigation');
    }
    if (f.finding_type === 'missing_info') {
      modules.add('background');
    }
  }

  // Default: if nothing matched, revise investigation (most common target)
  if (modules.size === 0) {
    modules.add('investigation');
  }

  return Array.from(modules);
}
