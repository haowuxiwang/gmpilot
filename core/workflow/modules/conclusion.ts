/**
 * Conclusion module generator.
 * Generates the investigation conclusion section.
 */

import { z } from 'zod';
import { BaseModuleGenerator, type ModuleContext } from './base';
import { createLogger } from '../../utils/logger';

const log = createLogger('Module');

/** Conclusion section schema */
const conclusionSchema = z.object({
  rootCause: z.string().describe('最终确定的根本原因'),
  mostLikelyCause: z.string().optional().describe('如无法确定根本原因，列出最有可能的原因'),
});

export type ConclusionOutput = z.infer<typeof conclusionSchema>;

/**
 * Conclusion module generator.
 * Synthesizes investigation results into a conclusion.
 */
export class ConclusionGenerator extends BaseModuleGenerator {
  constructor() {
    super('conclusion');
  }

  async generate(context: ModuleContext): Promise<ConclusionOutput> {
    log.info('Generating conclusion', { deviationId: context.deviationId });

    // Check if investigation results are available
    const investigation = context.previousResults?.investigation as {
      rootCause?: { conclusion?: string };
    } | undefined;

    // If we have investigation results, use them to build conclusion
    if (investigation?.rootCause?.conclusion) {
      return {
        rootCause: investigation.rootCause.conclusion,
        mostLikelyCause: undefined,
      };
    }

    // Fall back to LLM generation
    const prompt = this.buildPrompt(context);
    const result = await this.callLLM(prompt, conclusionSchema);
    return result as ConclusionOutput;
  }
}
