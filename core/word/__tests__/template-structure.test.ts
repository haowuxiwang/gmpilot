/**
 * Template structure fidelity tests — 对齐工厂完成版（D-TZ-API-EG-26003R）标题级结构。
 * 防止模板还原回归（页眉 tag、初步分析/全面调查标题缺失、章节顺序漂移等）。
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import { renderTemplate, buildDocxData } from '../filler';
import type { DeviationReport } from '../../workflow/types';

const FILLABLE = path.resolve('resources/templates/deviation-report-fillable.docx');

// ============================================================================
// 工厂 26003R 完成版章节顺序（标题级结构基准）
// 目录 7 章节 + 根本原因调查下的 3 个小节标题
// ============================================================================
const FACTORY_CHAPTER_ORDER = [
  '背景 Background',
  '偏差调查Deviation Investigation',
  '根本原因调查Root Cause Investigation',
  '初步分析 Preliminary Analysis',
  '全面调查Complete investigation',
  '重复偏差调查Repeat Deviation investigation',
  '其他产品或批次调查 Investigation of other product or batch',
  '调查结论 Investigation Conclusion',
  '风险分析及影响评估Risks Analysis and Impact Assessment',
  '纠正预防措施 CAPA',
  '附件清单Attachment List',
  '版本修订历史Version Revision History',
];

function fillableFlow(): string {
  const zip = new PizZip(fs.readFileSync(FILLABLE));
  const xml = zip.file('word/document.xml')!.asText();
  return [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
}

describe('template structure (对齐工厂 26003R)', () => {
  it('should contain factory chapter titles in order', () => {
    const flow = fillableFlow();
    let pos = -1;
    for (const title of FACTORY_CHAPTER_ORDER) {
      const idx = flow.indexOf(title, pos);
      expect(idx, `标题「${title}」应在后续位置出现`).toBeGreaterThan(pos);
      pos = idx;
    }
  });

  it('should NOT contain placeholder-only chapter titles (章节标题不存在于正文) in rendered output', () => {
    // 渲染后不应残留任何 {...} 标签（正文 + 页眉）
    const report = {
      report_type: 'full_report',
      title: '验证探头（编号：NBT2）偏差调查和风险评估报告',
      report_metadata: { findings_count: 0, task_type: 'deviation_analysis', report_source: 'gmpilot_generate', deviation_id: 'D-TZ-API-EG-26003', risk_score: 0, risk_level: 'low' },
      deviationId: 'D-TZ-API-EG-26003',
      riskScore: 0,
      riskLevel: 'low',
      factors: { man: [], machine: [], material: [], method: [], environment: [], measurement: [] },
      regulations: [],
      findings: [],
      cover: {
        title: '验证探头（编号：NBT2）偏差调查和风险评估报告',
        titleEn: 'Deviation Investigation and Risk Assessment Report for Validation Probe (No.NBT2)',
        department: '验证部',
        preparedBy: { department: '验证部', name: '吴思潭', signatureDate: '' },
        reviewedBy: { department: '验证部', name: '陈小彬', signatureDate: '' },
      },
      background: {
        product: '灭菌柜再确认', batch: '', occurrenceTime: '', location: '',
        description: '2026.03.23 验证部人员吴思潭在 Y21 车间进行灭菌柜（设备编号152903-108-0001）灭菌验证时发现探头 NBT2 显示温度异常。',
        photos: [],
      },
      investigation: {
        investigationIntro: '发生偏差后，验证部验证人员吴思潭立即上报验证主管并通知分管QA，QA组织和协调偏差涉及相关部门对偏差进行根源调查，调查过程如下：',
        rootCause: {
          preliminaryAnalysis: '物理外壳存在机械损坏导致进蒸汽：检查探头外壳，未发现划痕、裂纹，结构完整性良好，排除外壳损坏。\n探头密封失效导致进蒸汽：拆卸后检查O型密封圈，发现密封圈变形及破损。',
          factors: { man: '人员因素叙述', machine: '设备因素叙述', material: '', method: '', environment: '', measurement: '' },
          methods: { flowchart: false, fishbone: false, brainstorm: false, photos: [] },
          conclusion: '属于文件及设备原因。',
        },
        repeatDeviations: { records: [], analysis: '查看验证部近2年无类似现象的偏差。', conclusion: '无重复偏差。' },
        otherProducts: { records: [], analysis: '不涉及。', conclusion: '不涉及。' },
      },
      conclusion: { rootCause: '属于文件及设备原因。' },
      riskAssessment: { description: '风险叙述', summary: '小结：风险可控。' },
      capa: {
        corrections: [{ capaNo: 'CP-TZ-API-D-TZ-API-EG-26003-26001', content: '起草再确认方案', executor: '吴思潭', expectedDate: '2026.05.30', signatureDate: '' }],
        preventions: [{ capaNo: 'CP-TZ-API-D-TZ-API-EG-26003-26003', content: '设置密封圈更换周期', executor: '应雨希', expectedDate: '2026.07.30', signatureDate: '' }],
      },
      attachments: [{ no: '1', name: '仪器显示信息', pages: '待补充' }],
      versionHistory: [{ version: '00', executionDate: '见首页', revisionReason: '新订', mainChanges: '新订' }],
    } as DeviationReport;

    const data = buildDocxData(report);
    const buffer = renderTemplate(data);
    const zip = new PizZip(buffer);
    const bodyFlow = [...zip.file('word/document.xml')!.asText().matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
    const headerFlow = [...zip.file('word/header1.xml')!.asText().matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
    expect(bodyFlow + headerFlow).not.toMatch(/\{[#/a-zA-Z]/);
  });

  it('should render 初步分析/全面调查 headings and header with fileNo (对齐 26003R 页眉)', () => {
    const report = {
      report_type: 'full_report',
      title: '验证探头（编号：NBT2）偏差调查和风险评估报告',
      report_metadata: { findings_count: 0, task_type: 'deviation_analysis', report_source: 'gmpilot_generate', deviation_id: 'D-TZ-API-EG-26003', risk_score: 0, risk_level: 'low' },
      deviationId: 'D-TZ-API-EG-26003',
      riskScore: 0,
      riskLevel: 'low',
      factors: { man: [], machine: [], material: [], method: [], environment: [], measurement: [] },
      regulations: [],
      findings: [],
      cover: { title: '验证探头（编号：NBT2）偏差调查和风险评估报告', titleEn: 'Deviation Investigation and Risk Assessment Report for Validation Probe (No.NBT2)', department: '验证部', preparedBy: { department: '验证部', name: '吴思潭', signatureDate: '' }, reviewedBy: { department: '验证部', name: '陈小彬', signatureDate: '' } },
      background: { product: '', batch: '', occurrenceTime: '', location: '', description: '描述', photos: [] },
      investigation: {
        investigationIntro: '',
        rootCause: {
          preliminaryAnalysis: '物理外壳存在机械损坏导致进蒸汽：检查外壳正常。\n探头密封失效导致进蒸汽：发现密封圈变形及破损。',
          factors: { man: '人', machine: '机', material: '料', method: '法', environment: '环', measurement: '测' },
          methods: { flowchart: false, fishbone: false, brainstorm: false, photos: [] },
          conclusion: '属于文件及设备原因。',
        },
        repeatDeviations: { records: [], analysis: '', conclusion: '' },
        otherProducts: { records: [], analysis: '', conclusion: '' },
      },
      conclusion: { rootCause: '属于文件及设备原因。' },
      riskAssessment: { description: '风险叙述', summary: '小结：风险可控。' },
      capa: { corrections: [], preventions: [] },
      attachments: [],
      versionHistory: [{ version: '00', executionDate: '见首页', revisionReason: '新订', mainChanges: '新订' }],
    } as DeviationReport;

    const data = buildDocxData(report);
    const buffer = renderTemplate(data);
    const zip = new PizZip(buffer);
    const bodyFlow = [...zip.file('word/document.xml')!.asText().matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
    const headerFlow = [...zip.file('word/header1.xml')!.asText().matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');

    // 标题（正文）
    expect(bodyFlow).toContain('初步分析 Preliminary Analysis');
    expect(bodyFlow).toContain('全面调查Complete investigation');
    // 页眉（对齐工厂 26003R）：标题 + 文件编号 D-TZ-API-EG-26003-R + 版本号 00
    expect(headerFlow).toContain('验证探头（编号：NBT2）偏差调查和风险评估');
    expect(headerFlow).toContain('Deviation Investigation and Risk Assessment Report for Validation Probe (No.NBT2)');
    expect(headerFlow).toContain('文件编号：D-TZ-API-EG-26003-R');
    expect(headerFlow).toContain('版本号：00');
    // 页码保留（模板原样，无域）
    expect(headerFlow).toContain('页码：');
  });

  it('should style 初步分析/全面调查 as bold numbered level-2 headings (numId=5/ilvl=2)', () => {
    const zip = new PizZip(fs.readFileSync(FILLABLE));
    const xml = zip.file('word/document.xml')!.asText();
    for (const title of ['初步分析 Preliminary Analysis', '全面调查Complete investigation']) {
      const i = xml.indexOf(title);
      expect(i, `${title} 应存在`).toBeGreaterThan(-1);
      const s = xml.slice(xml.lastIndexOf('<w:p', i), xml.indexOf('</w:p>', i) + 6);
      expect(s).toContain('<w:numPr><w:ilvl w:val="2"/><w:numId w:val="5"/></w:numPr>');
      expect(s).toContain('<w:b/>');
    }
  });
});