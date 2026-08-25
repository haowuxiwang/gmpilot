/**
 * Risk Assessment module generator.
 * Generates the risk analysis and impact assessment section.
 * 对齐工厂写法（26002/26006）：多段叙述性分析 + 小结（「小结：1）...；2）...」），
 * 而非按维度拆分的 5 个字段。
 */

import { z } from 'zod';
import { BaseModuleGenerator, type ModuleContext } from './base';
import { createLogger } from '../../utils/logger';

const log = createLogger('Module');

/** Risk assessment schema */
const riskAssessmentSchema = z.object({
  description: z.string().describe('风险分析叙述：对产品质量、稳定性、上市许可/注册文件、客户、验证有效性等方面的潜在影响进行整体叙述（参照工厂写法，如「本次验证为灭菌柜再确认，验证探头过期并不影响灭菌柜自身性能。...」），多段内容用 \n 分隔'),
  summary: z.string().optional().describe('小结（参照工厂写法，如「小结：1）...；2）...」）'),
});

export type RiskAssessmentOutput = z.infer<typeof riskAssessmentSchema>;

/**
 * Risk Assessment module generator.
 * Evaluates impact and produces narrative paragraphs + summary.
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

  /**
   * Template fallback: conservative placeholder impact assessment.
   */
  async generateFallback(context: ModuleContext): Promise<RiskAssessmentOutput> {
    const conclusion = context.previousResults?.conclusion as { rootCause?: string } | undefined;
    const rootCause = conclusion?.rootCause || '待补充';

    log.warn('Risk assessment generated from fallback', { deviationId: context.deviationId });
    return {
      description: `本次偏差需结合调查结论评估对产品质量、稳定性、注册文件、客户及验证有效性的潜在影响。可能原因：${rootCause}。具体影响待确认后补充。`,
      summary: '小结：需结合调查结果进一步评估偏差影响范围，并制定相应控制措施。',
    };
  }
}
