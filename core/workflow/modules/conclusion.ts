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

    // 注入完整调查结果（根本原因 + 重复偏差 + 其他产品），让 LLM 综合生成结论。
    // 依赖 {investigation} 占位符替换（见 base.ts buildPrompt）。
    const enrichedContext = {
      ...context,
      previousResults: {
        ...context.previousResults,
        investigation: context.previousResults?.investigation ?? '',
      },
    };

    const prompt = this.buildPrompt(enrichedContext);
    const result = await this.callLLM(prompt, conclusionSchema);
    return result as ConclusionOutput;
  }

  /**
   * Template fallback: reuse investigation conclusion or placeholder.
   */
  async generateFallback(context: ModuleContext): Promise<ConclusionOutput> {
    const investigation = context.previousResults?.investigation as {
      rootCause?: { conclusion?: string };
    } | undefined;

    if (investigation?.rootCause?.conclusion) {
      return {
        rootCause: investigation.rootCause.conclusion,
        mostLikelyCause: undefined,
      };
    }

    const factorText = Object.values(context.factors)
      .flat()
      .filter(Boolean)
      .join('、') || '待补充';

    log.warn('Conclusion generated from fallback', { deviationId: context.deviationId });
    return {
      rootCause: '待补充',
      mostLikelyCause: `可能与以下因素相关：${factorText}，需进一步调查确认。`,
    };
  }
}
