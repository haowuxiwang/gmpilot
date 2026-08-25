/**
 * Attachments module generator.
 * Generates attachment list (LLM-based, from investigation narrative)
 * and version history (deterministic, factory standard).
 * 附件清单由 LLM 依据调查叙述生成（对齐工厂写法：调查报告-附件N + 名称 + 页数待补充），
 * 版本历史保持确定性输出（00/见首页/新订/新订）。
 */

import { z } from 'zod';
import { BaseModuleGenerator, type ModuleContext } from './base';
import { createLogger } from '../../utils/logger';

const log = createLogger('Module');

/** Attachment record — no 为纯数字，模板自动拼「调查报告-附件」前缀；页数为文本（如「15页」或「待补充」） */
export interface Attachment {
  no: string;
  name: string;
  pages: string;
}

/** Version history record */
export interface VersionHistory {
  version: string;
  executionDate: string;
  revisionReason: string;
  mainChanges: string;
}

/** Attachments section output */
export interface AttachmentsOutput {
  attachments: Attachment[];
  versionHistory: VersionHistory[];
}

/** Attachments schema */
const attachmentsSchema = z.object({
  attachments: z.array(z.object({
    no: z.string().describe('附件编号（纯数字，从1开始）'),
    name: z.string().describe('附件名称（调查叙述中实际提及的支撑文档名称）'),
    pages: z.string().describe('总页数，一律填「待补充」'),
  })).describe('调查报告引用的支撑文档清单'),
});

/** Attachments module generator.
 * Runs AFTER investigation (depends on root cause narrative).
 */
export class AttachmentsGenerator extends BaseModuleGenerator {
  constructor() {
    super('attachments');
  }

  async generate(context: ModuleContext): Promise<AttachmentsOutput> {
    log.info('Generating attachments', { deviationId: context.deviationId });

    const investigation = context.previousResults?.investigation as
      | { rootCause?: { preliminaryAnalysis?: string; conclusion?: string; factors?: Record<string, string> } }
      | undefined;

    const rootCauseText = [
      investigation?.rootCause?.preliminaryAnalysis,
      ...Object.values(investigation?.rootCause?.factors ?? {}),
      investigation?.rootCause?.conclusion,
    ].filter(Boolean).join('\n');

    // 无调查叙述时直接走确定性 fallback
    if (!rootCauseText.trim()) {
      return this.generateFallback(context);
    }

    const template = this.getTemplate();
    if (!template) {
      return this.generateFallback(context);
    }

    // 走 buildPrompt 统一占位符注入（{investigation} {clueText} {findings}），
    // 保证调查正文与附件清单的「详见调查报告-附件N」引用一致
    const prompt = `${this.buildPrompt(context)}

只输出JSON，不要有其他文字。`;

    try {
      const result = await this.callLLM(prompt, attachmentsSchema) as { attachments: Attachment[] };
      const attachments = (result.attachments ?? [])
        .map((a, i) => ({
          no: String(i + 1),
          name: a.name || '偏差调查报告',
          pages: '待补充',
        }));
      // LLM 空输出时默认至少附件1（无正文引用时保持原行为）
      const defaulted = attachments.length > 0 ? attachments : [{ no: '1', name: '偏差调查报告', pages: '待补充' }];
      return {
        // 硬校验：附件清单必须与调查正文中的「详见调查报告-附件N」引用一致
        // （正文引用的必须列出、未引用的剔除），避免 LLM 多列/少列
        attachments: alignWithReferences(defaulted, rootCauseText),
        versionHistory: defaultVersionHistory(),
      };
    } catch (error) {
      log.warn('Attachments LLM generation failed, using fallback', { error: String(error) });
      return this.generateFallback(context);
    }
  }

  /**
   * Deterministic fallback: 附件按调查正文引用生成（无引用时默认附件1 偏差调查报告），页数待补充。
   */
  async generateFallback(context: ModuleContext): Promise<AttachmentsOutput> {
    const investigation = context.previousResults?.investigation as
      | { rootCause?: { preliminaryAnalysis?: string; conclusion?: string; factors?: Record<string, string> } }
      | undefined;

    const rootCauseText = [
      investigation?.rootCause?.preliminaryAnalysis,
      ...Object.values(investigation?.rootCause?.factors ?? {}),
      investigation?.rootCause?.conclusion,
    ].filter(Boolean).join('\n');

    const referencedNos = extractReferencedAttachmentNos(rootCauseText);
    const attachments = referencedNos.length > 0
      ? referencedNos.map((n) => ({ no: String(n), name: '偏差调查报告', pages: '待补充' }))
      : [{ no: '1', name: '偏差调查报告', pages: '待补充' }];

    return {
      attachments,
      versionHistory: defaultVersionHistory(),
    };
  }
}

/** 从调查叙述中提取「详见调查报告-附件N」的编号集合（去重、升序） */
export function extractReferencedAttachmentNos(narrative: string): number[] {
  const nums = new Set<number>();
  const re = /(?:详见|参见)?调查报告?-?附件\s*(\d+)/g;
  for (const m of narrative.matchAll(re)) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > 0) nums.add(n);
  }
  return [...nums].sort((a, b) => a - b);
}

/** 附件清单与正文引用对齐：正文引用的必须列出（名称缺失补默认），未引用的剔除，按编号升序 */
export function alignWithReferences(
  attachments: Attachment[],
  narrative: string,
): Attachment[] {
  const referencedNos = extractReferencedAttachmentNos(narrative);
  if (referencedNos.length === 0) {
    // 正文未引用任何附件：收敛为默认附件1（避免 LLM 凭空猜测多项，工厂惯例清单与正文引用一致）
    return attachments.length > 0
      ? [{ no: '1', name: attachments[0].name || '偏差调查报告', pages: '待补充' }]
      : [{ no: '1', name: '偏差调查报告', pages: '待补充' }];
  }
  const byNo = new Map(attachments.map((a) => [Number(a.no), a]));
  const aligned: Attachment[] = [];
  for (const n of referencedNos) {
    const existing = byNo.get(n);
    aligned.push(existing ?? { no: String(n), name: '偏差调查报告', pages: '待补充' });
  }
  // 剩余未引用但 LLM 输出的项剔除（正文未引用的附件不列出）
  return aligned;
}

/** 版本历史固定值 — 对齐工厂模板：「00 / 见首页 / 新订 / 新订」 */
function defaultVersionHistory(): VersionHistory[] {
  return [
    {
      version: '00',
      executionDate: '见首页',
      revisionReason: '新订',
      mainChanges: '新订',
    },
  ];
}
