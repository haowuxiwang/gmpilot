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
  /** Targeted revision instruction (定向修订要求) */
  revisionContext?: string;
  /** 关键事件列表（分析阶段的完整事件流，调查正文的核心素材） */
  keyEvents?: string[];
  /** 原始线索全文（工厂报告正文 = 线索原文的扩写，必须完整注入） */
  clueText?: string;
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
   * Template-based fallback when LLM generation fails.
   * Produces a valid (possibly placeholder) output WITHOUT calling the LLM,
   * so a single module failure never fails the whole report.
   * Subclasses must implement this method.
   */
  abstract generateFallback(context: ModuleContext): Promise<unknown>;

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

    // Replace placeholders (use callback form to avoid `$` being treated as replacement pattern)
    const rep = (re: RegExp, value: unknown): string =>
      prompt.replace(re, () => (value === undefined || value === null ? '' : String(value)));
    prompt = rep(/\{deviationId\}/g, context.deviationId);
    prompt = rep(/\{analysis\.summary\}/g, context.analysis.summary);
    prompt = rep(/\{analysis\.keyEvents\}/g, (context.keyEvents ?? []).join('\n'));
    prompt = rep(/\{analysis\.involvedParties\}/g, context.analysis.involvedParties.join('\n'));
    prompt = rep(/\{clueText\}/g, context.clueText ?? '');
    prompt = rep(/\{regulationContext\}/g, context.regulationContext ?? '（无）');
    prompt = rep(/\{factors\}/g, JSON.stringify(context.factors, null, 2));
    prompt = rep(/\{regulations\}/g, JSON.stringify(context.regulations, null, 2));
    prompt = rep(/\{findings\}/g, JSON.stringify(context.findings, null, 2));

    // 注入上一步模块结果占位符（conclusion / investigation / rootCause / riskAssessment），
    // 使派生模块（riskAssessment/capa 等）的 LLM 能拿到真实结论而非占位文本
    const prev = context.previousResults ?? {};
    prompt = rep(/\{conclusion\}/g, JSON.stringify(prev.conclusion ?? '', null, 2));
    prompt = rep(/\{investigation\}/g, JSON.stringify(prev.investigation ?? '', null, 2));
    prompt = rep(/\{riskAssessment\}/g, JSON.stringify(prev.riskAssessment ?? '', null, 2));
    const investigation = prev.investigation as { rootCause?: { conclusion?: string } } | undefined;
    prompt = rep(/\{rootCause\}/g, investigation?.rootCause?.conclusion || '');

    // 定向修订要求（修订模式下追加，确保修订指令真正生效）
    if (context.revisionContext && context.revisionContext.trim()) {
      prompt = `${prompt}\n\n## 修订要求\n${context.revisionContext.trim()}\n（注意：在保留原报告合理内容的前提下，根据修订要求调整本模块输出；若修订要求与本模块无关，保持原内容）`;
    }

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
   * Uses generateText + JSON extraction (same as workflow nodes) for robustness
   * with providers like SiliconFlow that may not support generateObject well.
   */
  protected async callLLM(prompt: string, schema: unknown): Promise<unknown> {
    log.info(`Generating ${this.templateId}`, { promptLength: prompt.length });

    try {
      const result = await callLLMWithRetry(
        async (signal?: AbortSignal) => {
          const { generateText } = await import('ai');
          const { createLLMModel } = await import('../../llm/provider');
          const { extractJsonFromText } = await import('../../llm/caller');
          const model = createLLMModel();

          const genResult = await generateText({
            model,
            prompt: `${prompt}\n\nIMPORTANT: Respond ONLY with valid JSON. Do NOT wrap in markdown code blocks. Do NOT add any explanation.`,
            abortSignal: signal,
          });

          const jsonStr = extractJsonFromText(genResult.text);
          let parsed: unknown;
          try {
            parsed = JSON.parse(jsonStr);
          } catch (parseError) {
            log.warn(`${this.templateId} JSON parse failed`, { textPreview: genResult.text.slice(0, 200) });
            throw new Error(`LLM 返回的内容不是有效 JSON: ${String(parseError).slice(0, 100)}`);
          }

          // Validate with Zod schema if provided
          if (schema && typeof schema === 'object' && 'parse' in schema) {
            try {
              parsed = (schema as { parse: (v: unknown) => unknown }).parse(parsed);
            } catch (zodError) {
              log.warn(`${this.templateId} schema validation failed`, { error: String(zodError) });
              throw new Error(`LLM 返回的内容不匹配预期格式: ${String(zodError).slice(0, 100)}`);
            }
          }

          return { object: parsed, usage: genResult.usage };
        },
        { node: this.templateId }
      );

      log.info(`Generated ${this.templateId}`, { success: true });
      return (result as { object: unknown }).object;
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
