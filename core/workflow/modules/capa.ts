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
  expectedDate: z.string().describe('预期完成日期 (YYYY-MM-DD)'),
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

    // Add CAPA numbers if missing
    const output = result as CAPAOutput;
    output.corrections = this.ensureCAPANumbers(output.corrections || [], 'C');
    output.preventions = this.ensureCAPANumbers(output.preventions || [], 'P');

    return output;
  }

  /**
   * Ensure CAPA records have numbers.
   */
  private ensureCAPANumbers(records: z.infer<typeof capaRecordSchema>[], prefix: string): z.infer<typeof capaRecordSchema>[] {
    if (!Array.isArray(records)) return [];
    return records.map((record, index) => ({
      ...record,
      capaNo: record.capaNo || `CAPA-${prefix}-${String(index + 1).padStart(3, '0')}`,
    }));
  }
}
