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
  investigationIntro: z.string().optional().describe('偏差调查引导句：叙述偏差调查的组织与启动过程，如「发生偏差后，验证部验证人员XX立即上报验证主管并通知分管QA，QA组织和协调偏差涉及相关部门对偏差进行根源调查，调查过程如下：」'),
  rootCause: z.object({
    preliminaryAnalysis: z.string().optional().describe('初步分析：调查前的初步分析与风险点识别（如适用）'),
    investigationScope: z.array(z.object({
      category: z.string().describe('调查范围'),
      details: z.string().describe('调查内容'),
      ruledInOut: z.string().describe('识别的风险点 Ruled In/Out'),
    })).optional().describe('调查范围排查表（如适用）'),
    factors: z.object({
      man: z.string().describe('人员调查结果'),
      machine: z.string().describe('设备调查结果'),
      material: z.string().describe('物料调查结果'),
      method: z.string().describe('方法调查结果'),
      environment: z.string().describe('环境调查结果'),
      measurement: z.string().describe('测量调查结果'),
    }).describe('人、机、料、法、环、测六方面全面调查结果'),
    methods: z.object({
      flowchart: z.boolean().default(false).describe('是否使用事件流程图'),
      fishbone: z.boolean().default(true).describe('是否使用鱼骨图'),
      brainstorm: z.boolean().default(false).describe('是否使用头脑风暴'),
      photos: z.array(z.string()).default([]).describe('分析工具图片路径'),
    }).describe('调查分析方法'),
    conclusion: z.string().describe('全面调查结论'),
  }),
  repeatDeviations: z.object({
    records: z.array(z.object({
      no: z.string().describe('序号'),
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
      no: z.string().describe('序号'),
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

请同时生成以下三个部分，严格按要求输出JSON：

0. 偏差调查引导句 (investigationIntro, 顶层，可选)：
   叙述偏差调查的组织与启动过程（对齐工厂实际报告写法），人员姓名从「涉及人员」中选取（如「发生偏差后，验证部验证人员吴思潭立即上报验证主管并通知分管QA，QA组织和协调偏差涉及相关部门对偏差进行根源调查，调查过程如下：」）

1. 根本原因调查 (rootCause)：
   调查过程应叙述调查的完整过程（如偏差发现经过、调查步骤、相关方案与记录），
   并从人、机、料、法、环、测六个方面逐项进行全面调查（参考GMP偏差调查实践）。
   如调查叙述中引用了支撑文档（校准报告、验证数据报告等），请在正文中标注「详见调查报告-附件N」（N为附件序号，从1开始，对齐工厂实际报告写法）：
   - preliminaryAnalysis: string（可选）, 初步分析：叙述式风险点排查（如「物理外壳存在机械损坏导致进蒸汽 / 检查发现…结构完整性良好」），不适用可省略
   - investigationScope: [{category: string, details: string, ruledInOut: string}]（可选）, 仅当确有排查表格时输出，通常省略
   - factors: {
       man: string,      人员因素调查（操作人员、培训、责任心、操作过程等）
       machine: string,  设备因素调查（设备状态、仪表、维护、供应商检测等）
       material: string, 物料因素调查（原辅料、装载物等）
       method: string,   方法因素调查（SOP、工艺规程、操作方法等）
       environment: string, 环境因素调查（温度、湿度、洁净级别等）
       measurement: string, 测量因素调查（校验有效期、测量系统、校准等）
     }
   - methods: {flowchart: boolean, fishbone: boolean, brainstorm: boolean, photos: string[]}
   - conclusion: string, 全面调查得出的结论（明确根本原因或最有可能原因，并注明属于哪类原因，如「属于文件及设备原因」）

2. 重复偏差调查 (repeatDeviations)：
   - records: [{no: string, time: string, deviationNo: string, description: string, rootCause: string, capa: string}]
   - analysis: string, 重复偏差分析（对齐工厂写法：「查看XX近2年无类似现象的偏差」）
   - conclusion: string, 重复偏差结论

3. 其他产品影响 (otherProducts)：
   - records: [{no: string, productName: string, batchNo: string, currentStatus: string}]
   - analysis: string, 影响分析
   - conclusion: string, 影响结论

JSON示例格式（内容必须依据上方「偏差线索全文/关键事件/涉及人员/5M1E因素」等输入数据填写，不得使用占位符XXX，不得编造线索中不存在的事实）：
{"investigationIntro":"发生偏差后，验证部验证人员吴思潭立即上报验证主管并通知分管QA，QA组织和协调偏差涉及相关部门对偏差进行根源调查，调查过程如下：","rootCause":{"preliminaryAnalysis":"初步分析内容","investigationScope":[],"factors":{"man":"验证人员于YYYY.MM.DD接受过《XX操作规程》的培训，具有验证资格。偏差发生时按规程进行操作，排除人为误操作风险。","machine":"设备调查内容","material":"本次偏差发生在验证阶段，使用模拟物料，未涉及实际产品生产。","method":"现行规程缺乏针对XX的强制更换周期及维护标准。","environment":"设备运行正常，未出现系统性环境异常，排除环境因素。","measurement":"XX于YYYY.MM.DD~YYYY.MM.DD处于校准有效期内。"},"methods":{"flowchart":false,"fishbone":true,"brainstorm":false,"photos":[]},"conclusion":"经全面调查，本次偏差的根本原因为：…属于XX原因。"},"repeatDeviations":{"records":[],"analysis":"查看验证部近2年无类似现象的偏差。","conclusion":"无类似偏差。"},"otherProducts":{"records":[],"analysis":"本次偏差发生于验证阶段，使用模拟物料，未涉及实际生产，不影响此前验证结论的有效性。","conclusion":"不涉及其他产品或批次。"}}

请用中文填写所有内容。只输出JSON，不要有其他文字。`;

    const result = await this.callLLM(fullPrompt, investigationSchema);
    return result as InvestigationOutput;
  }

  /**
   * Template fallback: placeholder investigation based on available context.
   */
  async generateFallback(context: ModuleContext): Promise<InvestigationOutput> {
    const summary = context.analysis.summary || '待补充';
    const factorText = Object.values(context.factors)
      .flat()
      .filter(Boolean)
      .join('、') || '待补充';

    const placeholder: InvestigationOutput = {
      investigationIntro: '',
      rootCause: {
        factors: {
          man: '待补充',
          machine: '待补充',
          material: '待补充',
          method: '待补充',
          environment: '待补充',
          measurement: '待补充',
        },
        methods: { flowchart: false, fishbone: true, brainstorm: false, photos: [] },
        conclusion: `基于现有信息初步判断，相关因素包括：${factorText}。具体根本原因待补充调查后确认。`,
      },
      repeatDeviations: {
        records: [],
        analysis: '待补充',
        conclusion: '待补充',
      },
      otherProducts: {
        records: [],
        analysis: '待补充',
        conclusion: '待补充',
      },
    };

    log.warn('Investigation generated from fallback', {
      deviationId: context.deviationId,
      summaryPreview: summary.slice(0, 50),
    });
    return placeholder;
  }
}
