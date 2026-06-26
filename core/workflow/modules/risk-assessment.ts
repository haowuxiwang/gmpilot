/**
 * Risk Assessment module generator.
 * Generates the risk analysis and impact assessment section.
 */

import { z } from 'zod';
import { BaseModuleGenerator, type ModuleContext } from './base';
import { createLogger } from '../../utils/logger';

const log = createLogger('Module');

/** Risk assessment schema */
const riskAssessmentSchema = z.object({
  qualityImpact: z.string().describe('对产品质量的潜在影响'),
  stabilityImpact: z.string().describe('对产品稳定性的潜在影响'),
  registrationImpact: z.string().describe('对注册文件的影响'),
  customerImpact: z.string().describe('对客户的影响'),
  validationImpact: z.string().describe('对验证有效性的影响'),
});

export type RiskAssessmentOutput = z.infer<typeof riskAssessmentSchema>;

/**
 * Risk Assessment module generator.
 * Evaluates impact across multiple dimensions.
 */
export class RiskAssessmentGenerator extends BaseModuleGenerator {
  constructor() {
    super('risk-assessment');
  }

  async generate(context: ModuleContext): Promise<RiskAssessmentOutput> {
    log.info('Generating risk assessment', { deviationId: context.deviationId });

    // Build prompt with conclusion context
    const conclusion = context.previousResults?.conclusion as { rootCause?: string } | undefined;
    const enrichedContext = {
      ...context,
      previousResults: {
        ...context.previousResults,
        conclusion: conclusion?.rootCause || '未确定',
      },
    };

    const prompt = this.buildPrompt(enrichedContext);
    const result = await this.callLLM(prompt, riskAssessmentSchema);
    return result as RiskAssessmentOutput;
  }
}
