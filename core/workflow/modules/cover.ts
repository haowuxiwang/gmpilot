/**
 * Cover module generator.
 * Generates dynamic title and signature information.
 * 标题为动态生成（对齐工厂模板：「XX偏差调查和风险评估报告」），
 * 部门/起草人/审核人信息来自用户输入或线索分析，缺失时标记「待补充」。
 */

import { z } from 'zod';
import { BaseModuleGenerator, type ModuleContext } from './base';
import { createLogger } from '../../utils/logger';

const log = createLogger('Module');

/** Cover section output */
export interface CoverOutput {
  title: string;
  titleEn: string;
  department: string;
  preparedBy: {
    department: string;
    name: string;
    signatureDate: string;
  };
  reviewedBy: {
    department: string;
    name: string;
    signatureDate: string;
  };
}

const coverSchema = z.object({
  title: z.string().describe('动态报告标题，格式：<偏差对象>偏差调查和风险评估报告，如「RT探头（编号：NBQ6）偏差调查和风险评估报告」'),
  titleEn: z.string().describe('英文标题，格式：Deviation Investigation and Risk Assessment Report for <Object>'),
  department: z.string().describe('偏差发生部门（如验证部、生产部）'),
  preparedBy: z.object({
    department: z.string().describe('起草人所在部门'),
    name: z.string().describe('起草人姓名'),
  }).describe('起草人（偏差发生部门主管）'),
  reviewedBy: z.object({
    department: z.string().describe('审核人所在部门'),
    name: z.string().describe('审核人姓名'),
  }).describe('审核人（偏差发生部门负责人）'),
});

/**
 * Cover module generator.
 * Uses template filling instead of LLM generation.
 */
export class CoverGenerator extends BaseModuleGenerator {
  constructor() {
    super('cover');
  }

  async generate(context: ModuleContext): Promise<CoverOutput> {
    log.info('Generating cover', { deviationId: context.deviationId });

    try {
      const prompt = `根据以下偏差线索分析，生成报告封面信息：

## 偏差线索摘要
${context.analysis.summary}

## 线索事件
${context.analysis.keyEvents.join('\n')}

## 涉及人员
${context.analysis.involvedParties.join('\n') || '（无）'}

要求：
1. title：中文动态标题，格式「<偏差对象>偏差调查和风险评估报告」，标题必须以「偏差调查和风险评估报告」结尾；偏差对象是**出现异常的具体部件/设备**（含编号），如「验证探头（编号：NBT2）」「RT探头（编号：NBQ6）」「种子罐（编号：110102-108-0019）」。工厂实例：灭菌器验证偏差的标题是「验证探头（编号：NBT2）偏差调查和风险评估报告」——对象是异常的探头而不是灭菌器本身。如无法确定对象，用「偏差调查和风险评估报告」
2. titleEn：对应英文标题，必须完整翻译为英文（工厂实例：Deviation Investigation and Risk Assessment Report for Validation Probe (No.NBT2)），禁止混入中文
3. department：偏差发生部门（如验证部）；不确定填「待补充」
4. preparedBy/reviewedBy：从涉及人员推断起草人（主管）与审核人（负责人）；姓名不确定填空字符串
5. 所有字段用中文填写（titleEn 除外）
6. 输出**单个 JSON 对象**（不是数组、不是列表），只有一份封面信息

只输出JSON，不要有其他文字。`;

      const result = await this.callLLM(prompt, coverSchema);
      const parsed = result as {
        title: string;
        titleEn: string;
        department: string;
        preparedBy: { department: string; name: string };
        reviewedBy: { department: string; name: string };
      };
      return this.normalizeCover(parsed, context);
    } catch (error) {
      log.warn('Cover LLM generation failed, using rule-based fallback', { error: String(error) });
      return this.generateFallback(context);
    }
  }

  /**
   * Rule-based fallback: derive title from analysis summary.
   */
  async generateFallback(context: ModuleContext): Promise<CoverOutput> {
    const summary = context.analysis.summary || '';
    const extracted = this.extractSubject(summary);
    const title = extracted ? `${extracted}偏差调查和风险评估报告` : '偏差调查和风险评估报告';
    const no = this.extractNo(extracted ?? '');
    const titleEn = extracted
      ? no
        ? extracted.includes('探头')
          ? `Deviation Investigation and Risk Assessment Report for Validation Probe (No.${no})`
          : `Deviation Investigation and Risk Assessment Report for the above Object (No.${no})`
        : 'Deviation Investigation and Risk Assessment Report'
      : 'Deviation Investigation and Risk Assessment Report';
    return {
      title,
      titleEn,
      // involvedParties 是人员名单，无法规则推断部门，统一「待补充」
      department: '待补充',
      preparedBy: {
        department: '待补充',
        name: '',
        signatureDate: '',
      },
      reviewedBy: {
        department: '待补充',
        name: '',
        signatureDate: '',
      },
    };
  }

  /**
   * 提取偏差对象（含编号），如「验证探头（编号：NBT2）」。
   * 匹配顺序：
   * 1. <设备/部件>（编号：XXX）完整形式（如「RT探头（编号：NBQ6）」）
   * 2. 「验证探头NBT2」类：部件名紧跟编号（任意位置，如「发现验证探头NBT2（NBT2-A和NBT2-B）」→「验证探头（编号：NBT2）」）
   * 3. 「NBT2探头」类：编号在部件名前（如「NBT2探头出现异常」→「探头（编号：NBT2）」）
   * 4. 第一个标点前的词（弱兜底）
   */
  private extractSubject(summary: string): string {
    const withNo = summary.match(/^(.{2,20}?（编号[^）]*）)/);
    if (withNo) return withNo[1].trim();
    const probeWithNo = summary.match(/(验证探头|温度探头|RT探头|探头)([A-Za-z0-9-]{2,12})/);
    if (probeWithNo) return `${probeWithNo[1]}（编号：${probeWithNo[2]}）`;
    const noWithProbe = summary.match(/([A-Za-z0-9-]{2,12})(验证探头|温度探头|RT探头)/);
    if (noWithProbe) return `${noWithProbe[2]}（编号：${noWithProbe[1]}）`;
    const plain = summary.match(/^(.{2,20}?)(?:（|\(|：|:|，)/);
    return plain ? plain[1].trim() : '';
  }

  /** 从「XXX（编号：YYY）」提取编号 YYY */
  private extractNo(subject: string): string | null {
    const m = subject.match(/（编号[：:]?\s*([^）]+)）/);
    return m ? m[1].trim() : null;
  }

  /**
   * Normalize LLM output:
   * - title 必须以「偏差调查和风险评估报告」结尾（工厂标题格式），否则从摘要重新提取对象
   * - titleEn 必须为纯英文，混入中文时按工厂格式重建
   */
  private normalizeCover(
    parsed: { title: string; titleEn: string; department: string; preparedBy: { department: string; name: string }; reviewedBy: { department: string; name: string } },
    context: ModuleContext,
  ): CoverOutput {
    const hasCjk = (s: string): boolean => /[\u4e00-\u9fff]/.test(s);
    let title = (parsed.title || '').trim();
    let titleEn = (parsed.titleEn || '').trim();

    const objectPart = (t: string): string => t.slice(0, t.indexOf('偏差调查和风险评估报告'));
    // 对象部分是叙述短语（含动作/过程词）而非部件名 → 视为 LLM 识别错误，从摘要重提取
    const isBadObject = (t: string): boolean => {
      const part = objectPart(t);
      if (!part) return false;
      if (/（编号[^）]*）/.test(part)) return false;
      return /(在验证|验证过程中|过程中|查看|发现|检查|出现|显示|停止|导致|报告)/.test(part);
    };
    const rebuildFromSummary = (): string => {
      const extracted = this.extractSubject(context.analysis.summary || '');
      return extracted ? `${extracted}偏差调查和风险评估报告` : '偏差调查和风险评估报告';
    };

    if (!title.endsWith('偏差调查和风险评估报告') || isBadObject(title)) {
      title = rebuildFromSummary();
      log.warn('Cover title not in factory format, rebuilt from summary', { original: parsed.title, rebuilt: title });
    }

    if (hasCjk(titleEn) || !titleEn.startsWith('Deviation Investigation and Risk Assessment Report')) {
      const no = this.extractNo(title);
      titleEn = no
        ? title.includes('探头')
          ? `Deviation Investigation and Risk Assessment Report for Validation Probe (No.${no})`
          : `Deviation Investigation and Risk Assessment Report for the above Object (No.${no})`
        : 'Deviation Investigation and Risk Assessment Report';
      log.warn('Cover titleEn contained CJK or bad format, rebuilt', { original: parsed.titleEn, rebuilt: titleEn });
    }

    return {
      title,
      titleEn,
      department: parsed.department || '待补充',
      preparedBy: {
        department: parsed.preparedBy?.department || parsed.department || '待补充',
        name: parsed.preparedBy?.name || '',
        signatureDate: '',
      },
      reviewedBy: {
        department: parsed.reviewedBy?.department || parsed.department || '待补充',
        name: parsed.reviewedBy?.name || '',
        signatureDate: '',
      },
    };
  }
}
