/**
 * Clue Analysis node — Step 2 of deviation workflow.
 * Analyzes user input and extracts structured information.
 */

import { analyzeClue } from '../../llm/caller';
import { createLogger } from '../../utils/logger';
import type { ClueAnalysis } from '../types';

const log = createLogger('Workflow');

/**
 * Analyze clue text using LLM.
 * @param clueText User-provided clue text
 * @returns Structured analysis result
 */
export async function analyzeClueNode(clueText: string): Promise<ClueAnalysis> {
  if (!clueText.trim()) {
    throw new Error('线索内容不能为空');
  }

  log.info('Starting clue-analysis', { clueLength: clueText.length });
  const result = await analyzeClue(clueText);
  log.info('Clue analysis completed', { summary: result.summary.slice(0, 60), keyEvents: result.keyEvents.length });
  return result;
}
