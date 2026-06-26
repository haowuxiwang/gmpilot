/**
 * Investigation module generator.
 * Generates all investigation sub-sections in a single LLM call.
 */

import { z } from 'zod';
import { BaseModuleGenerator, type ModuleContext } from './base';
import { createLogger } from '../../utils/logger';

const log = createLogger('Module');

/** Complete investigation schema - all sections in one call */
export const investigationSchema = z.object({
  rootCause: z.object({
    interviews: z.string().describe('人员面谈记录'),
    sopReview: z.string().describe('SOP核查结果'),
    historicalData: z.string().describe('历史数据回顾'),
    relatedBatches: z.string().describe('关联批次调查'),
    batchRecords: z.string().describe('批记录复核'),
    samplesReview: z.string().describe('留样审查'),
    stabilityStudy: z.string().describe('稳定性考察'),
    supplierReview: z.string().describe('供应商核查'),
    methods: z.object({
      flowchart: z.boolean().default(false).describe('是否使用事件流程图'),
      fishbone: z.boolean().default(true).describe('是否使用鱼骨图'),
      brainstorm: z.boolean().default(false).describe('是否使用头脑风暴'),
      photos: z.array(z.string()).default([]).describe('分析工具图片路径'),
    }).describe('调查分析方法'),
    conclusion: z.string().describe('根本原因调查结论'),
  }),
  repeatDeviations: z.object({
    records: z.array(z.object({
      time: z.string().describe('发生时间'),
      deviationNo: z.string().describe('偏差编号'),
      description: z.string().describe('偏差描述'),
      rootCause: z.string().describe('根本原因'),
      capa: z.string().describe('CAPA措施'),
    })).describe('历史偏差记录'),
    analysis: z.string().describe('重复偏差分析'),
    conclusion: z.string().describe('重复偏差结论'),
  }),
  otherProducts: z.object({
    records: z.array(z.object({
      productName: z.string().describe('产品名称'),
      batchNo: z.string().describe('批次号'),
      currentStatus: z.string().describe('当前状态'),
    })).describe('受影响产品/批次'),
    analysis: z.string().describe('影响分析'),
    conclusion: z.string().describe('影响结论'),
  }),
});

export type InvestigationOutput = z.infer<typeof investigationSchema>;

/**
 * Investigation module generator.
 * Generates root cause, repeat deviation, and other products investigation in a single call.
 */
export class InvestigationGenerator extends BaseModuleGenerator {
  constructor() {
    super('investigation-root-cause');
  }

  async generate(context: ModuleContext): Promise<InvestigationOutput> {
    log.info('Generating investigation', { deviationId: context.deviationId });

    const template = this.getTemplate();
    if (!template) {
      throw new Error('Investigation template not found');
    }

    // Build a simplified prompt for single-call generation
    const prompt = this.buildPrompt(context);

    // Add specific instructions for all sections
    const fullPrompt = `${prompt}

请同时生成以下三个部分：

1. 根本原因调查 (rootCause)：
   - 人员面谈记录 (interviews)
   - SOP核查结果 (sopReview)
   - 历史数据回顾 (historicalData)
   - 关联批次调查 (relatedBatches)
   - 批记录复核 (batchRecords)
   - 留样审查 (samplesReview)
   - 稳定性考察 (stabilityStudy)
   - 供应商核查 (supplierReview)
   - 调查结论 (conclusion)

2. 重复偏差调查 (repeatDeviations)：
   - 是否有重复偏差记录 (hasRecords)
   - 重复偏差分析 (analysis)
   - 重复偏差结论 (conclusion)

3. 其他产品影响 (otherProducts)：
   - 是否影响其他产品 (hasImpact)
   - 影响分析 (analysis)
   - 影响结论 (conclusion)

请用中文填写所有内容。`;

    const result = await this.callLLM(fullPrompt, investigationSchema);
    return result as InvestigationOutput;
  }
}
