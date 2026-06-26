/**
 * Background module generator.
 * Generates the background section from clue analysis.
 */

import { z } from 'zod';
import { BaseModuleGenerator, type ModuleContext } from './base';
import { createLogger } from '../../utils/logger';
import type { ClueAnalysis, Factor5M1E } from '../types';

const log = createLogger('Module');

/** Background section schema */
const backgroundSchema = z.object({
  product: z.string().describe('涉及产品名称'),
  batch: z.string().describe('批次号'),
  occurrenceTime: z.string().describe('偏差发生时间 (YYYY-MM-DD HH:mm)'),
  location: z.string().describe('偏差发生地点'),
  description: z.string().describe('偏差事件详细描述'),
  photos: z.array(z.string()).default([]).describe('照片路径数组'),
});

export type BackgroundOutput = z.infer<typeof backgroundSchema>;

/**
 * Background module generator.
 * Extracts background information from clue analysis.
 */
export class BackgroundGenerator extends BaseModuleGenerator {
  constructor() {
    super('background');
  }

  async generate(context: ModuleContext): Promise<BackgroundOutput> {
    log.info('Generating background', { deviationId: context.deviationId });

    // Try to extract from analysis first
    const extracted = this.extractFromAnalysis(context);
    if (extracted) {
      log.info('Background extracted from analysis', { product: extracted.product });
      return extracted;
    }

    // Fall back to LLM generation
    const prompt = this.buildPrompt(context);
    const result = await this.callLLM(prompt, backgroundSchema);
    return result as BackgroundOutput;
  }

  /**
   * Try to extract background from analysis without LLM.
   */
  private extractFromAnalysis(context: ModuleContext): BackgroundOutput | null {
    const { analysis, factors } = context;

    // Extract product name from analysis or factors
    const product = this.extractProduct(analysis, factors);
    if (!product) return null;

    return {
      product,
      batch: this.extractBatch(analysis) || '待补充',
      occurrenceTime: this.extractTime(analysis) || new Date().toISOString().slice(0, 16),
      location: this.extractLocation(analysis) || '待补充',
      description: analysis.summary,
      photos: [],
    };
  }

  private extractProduct(analysis: ClueAnalysis, factors: Factor5M1E): string | null {
    // Try to find product name in key events
    for (const event of analysis.keyEvents) {
      const match = event.match(/产品[：:]\s*(.+?)[\s,，]/);
      if (match) return match[1].trim();
    }

    // Try material factors
    if (factors.material?.length > 0) {
      return factors.material[0];
    }

    return null;
  }

  private extractBatch(analysis: ClueAnalysis): string | null {
    for (const event of analysis.keyEvents) {
      const match = event.match(/批[号次][：:]\s*(.+?)[\s,，]/);
      if (match) return match[1].trim();
    }
    return null;
  }

  private extractTime(analysis: ClueAnalysis): string | null {
    for (const event of analysis.keyEvents) {
      const match = event.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2}[\sT]\d{1,2}:\d{2})/);
      if (match) return match[1].replace(/\//g, '-');
    }
    return null;
  }

  private extractLocation(analysis: ClueAnalysis): string | null {
    for (const event of analysis.keyEvents) {
      const match = event.match(/[发生在地点区域][：:]\s*(.+?)[\s,，]/);
      if (match) return match[1].trim();
    }
    return null;
  }
}
