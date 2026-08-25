/**
 * CAPA module generator.
 * Generates corrective and preventive actions.
 */

import { z } from 'zod';
import { BaseModuleGenerator, type ModuleContext } from './base';
import { createLogger } from '../../utils/logger';

const log = createLogger('Module');

/** CAPA record schema */
const capaRecordSchema = z.object({
  capaNo: z.string().describe('CAPA编号'),
  content: z.string().describe('措施内容'),
  executor: z.string().describe('执行人'),
  expectedDate: z.string().describe('预期完成日期，点分格式（如 2026.04.30；已完成用「已完成 2026.03.31」）'),
  signatureDate: z.string().default('').describe('执行人签字/日期'),
});

/** CAPA section schema */
const capaSchema = z.object({
  corrections: z.array(capaRecordSchema).describe('纠正措施'),
  preventions: z.array(capaRecordSchema).describe('预防措施'),
});

export type CAPAOutput = z.infer<typeof capaSchema>;

/**
 * CAPA module generator.
 * Generates corrective and preventive actions based on investigation conclusion.
 */
export class CAPAGenerator extends BaseModuleGenerator {
  constructor() {
    super('capa');
  }

  async generate(context: ModuleContext): Promise<CAPAOutput> {
    log.info('Generating CAPA', { deviationId: context.deviationId });

    // Build prompt with conclusion and risk assessment context
    const conclusion = context.previousResults?.conclusion as { rootCause?: string } | undefined;
    const riskAssessment = context.previousResults?.riskAssessment as Record<string, string> | undefined;

    const enrichedContext = {
      ...context,
      previousResults: {
        ...context.previousResults,
        rootCause: conclusion?.rootCause || '未确定',
        riskAssessment: riskAssessment || {},
      },
    };

    const prompt = this.buildPrompt(enrichedContext);
    const result = await this.callLLM(prompt, capaSchema);

    // Add CAPA numbers if missing (工厂格式：CP-TZ-API-${deviationId}-${serial}）
    const output = result as CAPAOutput;
    const correctionCount = output.corrections?.length || 0;
    output.corrections = this.ensureCAPANumbers(output.corrections || [], context.deviationId, 0);
    output.preventions = this.ensureCAPANumbers(output.preventions || [], context.deviationId, correctionCount);

    return output;
  }

  /**
   * Ensure CAPA records have numbers matching factory format:
   * CP-TZ-API-${deviationId}-${serial}, serial 从 26001 起连续递增
   * （纠正措施 26001, 26002...；预防措施接着纠正措施继续编号）。
   */
  private ensureCAPANumbers(
    records: z.infer<typeof capaRecordSchema>[],
    deviationId: string,
    offset: number,
  ): z.infer<typeof capaRecordSchema>[] {
    if (!Array.isArray(records)) return [];
    const factoryPattern = new RegExp(`^CP-[A-Z0-9-]*${deviationId}-\\d{5}$`);
    return records.map((record, index) => {
      if (record.capaNo && factoryPattern.test(record.capaNo)) {
        return record;
      }
      const serial = 26001 + offset + index;
      return {
        ...record,
        capaNo: `CP-TZ-API-${deviationId}-${serial}`,
      };
    });
  }

  /**
   * Template fallback: generic corrective/preventive action placeholders.
   */
  async generateFallback(context: ModuleContext): Promise<CAPAOutput> {
    const conclusion = context.previousResults?.conclusion as { rootCause?: string } | undefined;
    const rootCause = conclusion?.rootCause || '待补充';

    log.warn('CAPA generated from fallback', { deviationId: context.deviationId });
    const record: z.infer<typeof capaRecordSchema> = {
      capaNo: '',
      content: '',
      executor: '待补充',
      expectedDate: '待补充',
      signatureDate: '',
    };

    return {
      corrections: [
        {
          ...record,
          capaNo: `CP-TZ-API-${context.deviationId}-26001`,
          content: `针对"${rootCause}"制定纠正措施，具体措施待调查完成后补充。`,
        },
      ],
      preventions: [
        {
          ...record,
          capaNo: `CP-TZ-API-${context.deviationId}-26002`,
          content: '预防措施待评估后补充，建议结合风险管理原则制定。',
        },
      ],
    };
  }
}
