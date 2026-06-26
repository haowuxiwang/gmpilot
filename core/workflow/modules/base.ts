/**
 * Base module generator.
 * Provides common functionality for all report section generators.
 */

import { getTemplate, type ParsedTemplate } from '../../template';
import { callLLMWithRetry } from '../../llm/caller';
import { createLogger } from '../../utils/logger';
import type { ClueAnalysis, Factor5M1E, RegulationMatch, Finding } from '../types';

const log = createLogger('Module');

/**
 * Context for module generation.
 */
export interface ModuleContext {
  /** Deviation ID */
  deviationId: string;
  /** Clue analysis from step 2 */
  analysis: ClueAnalysis;
  /** 5M1E factors from step 3 */
  factors: Factor5M1E;
  /** Matched regulations from step 4 */
  regulations: RegulationMatch[];
  /** Derived findings from step 3 */
  findings: Finding[];
  /** Regulation context from RAG */
  regulationContext?: string;
  /** Previously generated modules (for dependencies) */
  previousResults?: Record<string, unknown>;
}

/**
 * Base class for module generators.
 */
export abstract class BaseModuleGenerator {
  protected templateId: string;
  protected template: ParsedTemplate | null = null;

  constructor(templateId: string) {
    this.templateId = templateId;
  }

  /**
   * Get the template for this module.
   */
  protected getTemplate(): ParsedTemplate | null {
    if (!this.template) {
      this.template = getTemplate(this.templateId);
    }
    return this.template;
  }

  /**
   * Generate the module content.
   * Subclasses must implement this method.
   */
  abstract generate(context: ModuleContext): Promise<unknown>;

  /**
   * Build the prompt for LLM generation.
   * Subclasses can override for custom prompt building.
   */
  protected buildPrompt(context: ModuleContext): string {
    const template = this.getTemplate();
    if (!template) {
      throw new Error(`Template not found: ${this.templateId}`);
    }

    let prompt = template.prompt || '';

    // Replace placeholders
    prompt = prompt.replace(/\{deviationId\}/g, context.deviationId);
    prompt = prompt.replace(/\{analysis\.summary\}/g, context.analysis.summary);
    prompt = prompt.replace(/\{factors\}/g, JSON.stringify(context.factors, null, 2));
    prompt = prompt.replace(/\{regulations\}/g, JSON.stringify(context.regulations, null, 2));
    prompt = prompt.replace(/\{findings\}/g, JSON.stringify(context.findings, null, 2));

    // Add template description
    if (template.description) {
      prompt = `## 章节说明\n${template.description}\n\n${prompt}`;
    }

    // Add output format
    if (template.outputFormat) {
      prompt = `${prompt}\n\n## 输出格式\n${template.outputFormat}`;
    }

    return prompt;
  }

  /**
   * Call LLM to generate content.
   */
  protected async callLLM(prompt: string, schema: unknown): Promise<unknown> {
    log.info(`Generating ${this.templateId}`, { promptLength: prompt.length });

    try {
      const result = await callLLMWithRetry(
        async (signal?: AbortSignal) => {
          // Use generateObject for structured output
          const { generateObject } = await import('ai');
          const { createLLMModel } = await import('../../llm/provider');
          const model = createLLMModel();

          return generateObject({
            model,
            prompt,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            schema: schema as any,
            abortSignal: signal,
          });
        },
        { node: this.templateId }
      );

      log.info(`Generated ${this.templateId}`, { success: true });
      return result;
    } catch (error) {
      log.error(`Failed to generate ${this.templateId}`, { error: String(error) });
      throw error;
    }
  }

  /**
   * Validate generated content against template fields.
   */
  protected validateOutput(output: Record<string, unknown>): boolean {
    const template = this.getTemplate();
    if (!template) return true;

    // Check required fields
    for (const field of template.fields) {
      if (field.required && !(field.name in output)) {
        log.warn(`Missing required field: ${field.name}`, { templateId: this.templateId });
        return false;
      }
    }

    return true;
  }

  /**
   * Get module ID.
   */
  getModuleId(): string {
    return this.templateId;
  }
}
