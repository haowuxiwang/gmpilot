/**
 * Regulation Match node — Step 4 of deviation workflow.
 * Searches RAG knowledge base and matches regulations.
 */

import { matchRegulations } from '../../llm/caller';
import { createLogger } from '../../utils/logger';
import type { Factor5M1E, RegulationMatch } from '../types';

const log = createLogger('Workflow');

/** Default regulation when no specific match is found */
const DEFAULT_REGULATION: RegulationMatch = {
  regulation: 'GMP 通则',
  chapter: '第一章',
  article: '总则',
  title: '药品生产质量管理规范',
  content: '药品生产企业应当建立药品质量管理体系，确保药品质量符合预定用途和注册要求。',
  relevance: '通用 GMP 要求，适用于所有偏差情况',
};

/**
 * Match regulations against clue and factors.
 * @param clueText Original clue text
 * @param factors 5M1E factors from step 3
 * @param regulationContext Retrieved regulation context from RAG
 * @returns Matched regulations (at least one)
 */
export async function matchRegulationsNode(
  clueText: string,
  factors: Factor5M1E,
  regulationContext: string,
): Promise<RegulationMatch[]> {
  log.info('Starting regulation-match', { hasContext: regulationContext.length > 0 });
  const result = await matchRegulations(clueText, factors, regulationContext);

  if (result.length === 0) {
    log.warn('No regulations matched, using default');
    return [DEFAULT_REGULATION];
  }

  log.info('Regulation-match completed', { regulations: result.length });
  return result;
}
