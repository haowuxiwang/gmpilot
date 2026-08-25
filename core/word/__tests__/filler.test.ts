/**
 * Tests for Word template filler (docx export).
 * 验证报告数据到 Word 模板标签数据的映射，以及 docx 渲染结果。
 */

import { describe, it, expect } from 'vitest';
import PizZip from 'pizzip';
import { buildDocxData, renderTemplate, defaultDocxFileName } from '../filler';
import type { DeviationReport } from '../../workflow/types';

function makeReport(overrides: Partial<DeviationReport> = {}): DeviationReport {
  return {
    report_type: 'full_report',
    title: '偏差报告 - DEV-TEST-001',
    report_metadata: {
      findings_count: 0,
      task_type: 'deviation_analysis',
      report_source: 'gmpilot_generate',
      deviation_id: 'DEV-TEST-001',
      risk_score: 0,
      risk_level: 'low',
    },
    deviationId: 'DEV-TEST-001',
    riskScore: 0,
    riskLevel: 'low',
    factors: { man: [], machine: [], material: [], method: [], environment: [], measurement: [] },
    regulations: [],
    findings: [],
    cover: {
      title: 'RT探头（编号：NBQ6）偏差调查和风险评估报告',
      titleEn: 'Deviation Investigation and Risk Assessment Report for RT Probe of No. NBQ6',
      department: '验证部',
      preparedBy: { department: '验证部', name: '缪一', signatureDate: '' },
      reviewedBy: { department: '验证部', name: '陈小彬', signatureDate: '' },
    },
    background: {
      product: '灭菌柜再确认',
      batch: '',
      occurrenceTime: '2026.02.28 12:30',
      location: 'Y21车间',
      description: '2026.02.28 12:30验证部人员缪一在Y21车间读取灭菌柜（设备编号152903-108-0001）器械模式最小装载灭菌数据时发现灭菌中使用的1个验证探头（探头型号ValProbe RT）编号NBQ6处于失效状态（有效期2025.02.26~2026.02.25）。',
      photos: [],
    },
    investigation: {
      investigationIntro: '发生偏差后，验证部验证人员缪一立即上报验证主管并通知分管QA，QA组织和协调偏差涉及相关部门对偏差进行根源调查，调查过程如下：',
      rootCause: {
        preliminaryAnalysis: '偏差发生后，验证部人员立即上报验证主管并通知分管QA。',
        investigationScope: [
          { category: '人员面谈', details: '与验证人员缪一面谈', ruledInOut: '排除操作违规' },
        ],
        factors: {
          man: '验证人员缪一，于2025.01.02接受过培训，具有验证资格。',
          machine: '本次使用的ValProbe RT验证探头能正常运行，不涉及。',
          material: '本次验证为灭菌柜再确认，所装载的物料对温度探头没有影响，不涉及。',
          method: 'H3-VD-26321-RQ/09版再确认方案内6.6测试项明确规定需核实测试设备已校验并在有效期内。',
          environment: '此次验证的设备仪器材质均耐高温高湿，不涉及环境问题。',
          measurement: '探头NBQ6有效日期为2025.02.26~2026.02.25验证时未处于校准有效期内。',
        },
        methods: { flowchart: false, fishbone: false, brainstorm: false, photos: [] },
        conclusion: '经全面调查得出，本次偏差为验证人员未逐个确认验证探头有效期及管理员未回收过期探头所导致，属于人为原因。',
      },
      repeatDeviations: {
        records: [
          { no: '1', time: '2024.01.01', deviationNo: 'DEV-001', description: '无类似偏差', rootCause: '-', capa: '-' },
        ],
        analysis: '查看验证部近2年无类似现象的偏差。',
        conclusion: '无重复偏差。',
      },
      otherProducts: {
        records: [],
        analysis: '本次偏差仅涉及灭菌柜再确认验证，不涉及其他产品批次。',
        conclusion: '不涉及。',
      },
    },
    conclusion: {
      rootCause: '验证人员未逐个确认验证探头有效期及管理员未回收过期探头，属于人为原因。',
    },
    riskAssessment: {
      description: '失效探头NBQ6使用期间的数据均符合验证要求，经校准之后，数据稳定。\n本次验证为灭菌柜再确认，探头过期不影响灭菌柜自身性能。',
      summary: '小结：1）对产品质量无影响；2）对验证有效性无影响。',
    },
    capa: {
      corrections: [
        { capaNo: 'CP-TZ-API-D-TZ-API-EG-26002-26001', content: '对验证部人员进行强调培训', executor: '陈小彬', expectedDate: '2026.03.31', signatureDate: '' },
      ],
      preventions: [
        { capaNo: 'CP-TZ-API-D-TZ-API-EG-26002-26003', content: '设置临近过期仪器存放区', executor: '陈诗雨', expectedDate: '2026.03.31', signatureDate: '' },
      ],
    },
    attachments: [
      { no: '1', name: '验证探头校准报告', pages: '15页' },
    ],
    versionHistory: [
      { version: '00', executionDate: '见首页', revisionReason: '新订', mainChanges: '新订' },
    ],
    ...overrides,
  };
}

describe('buildDocxData', () => {
  it('should strip title suffix for template placeholder', () => {
    const data = buildDocxData(makeReport());
    expect(data.title).toBe('RT探头（编号：NBQ6）');
  });

  it('should keep title empty when no object is present', () => {
    const report = makeReport();
    report.cover.title = '偏差调查和风险评估报告';
    const data = buildDocxData(report);
    expect(data.title).toBe('');
  });

  it('should map six 5M1E factors to factorItems', () => {
    const data = buildDocxData(makeReport());
    expect(data.factorItems).toHaveLength(6);
    expect(data.factorItems.map((f) => f.label)).toEqual(['人员', '设备', '方法', '物料', '环境', '测量']);
    expect(data.factorItems[0].content).toContain('验证人员缪一');
  });

  it('should map investigation scope and repeat records', () => {
    const data = buildDocxData(makeReport());
    expect(data.scopeItems).toHaveLength(1);
    expect(data.scopeItems[0].category).toBe('人员面谈');
    expect(data.repeatRecords).toHaveLength(1);
    expect(data.repeatRecords[0].deviationNo).toBe('DEV-001');
    expect(data.rootCauseConclusion).toContain('人为原因');
  });

  it('should default empty arrays and missing fields safely', () => {
    const report = makeReport();
    report.investigation = {
      investigationIntro: '',
      rootCause: {
        preliminaryAnalysis: '',
        factors: { man: '', machine: '', material: '', method: '', environment: '', measurement: '' },
        methods: { flowchart: false, fishbone: false, brainstorm: false, photos: [] },
        conclusion: '',
      },
      repeatDeviations: { records: [], analysis: '', conclusion: '' },
      otherProducts: { records: [], analysis: '', conclusion: '' },
    };
    report.attachments = [];
    report.versionHistory = [];
    report.capa = { corrections: [], preventions: [] };
    report.conclusion = { rootCause: '', mostLikelyCause: undefined };

    const data = buildDocxData(report);
    expect(data.factorItems).toHaveLength(6);
    expect(data.factorItems.every((f) => f.content === '')).toBe(true);
    expect(data.repeatRecords).toEqual([]);
    expect(data.otherRecords).toEqual([]);
    expect(data.attachments).toEqual([]);
    expect(data.versionHistory).toEqual([]);
    expect(data.rootCauseConclusion).toBe('待补充');
    expect(data.finalRootCause).toBe('待补充');
  });

  it('should split risk assessment description and summary into paragraphs', () => {
    const data = buildDocxData(makeReport());
    expect(data.riskParagraphs).toHaveLength(3);
    expect(data.riskParagraphs[0]).toContain('数据稳定');
    expect(data.riskParagraphs[2]).toContain('小结');
  });

  it('should use description for background and fall back to joined fields', () => {
    const data = buildDocxData(makeReport());
    expect(data.background).toContain('Y21车间');

    const report = makeReport();
    report.background.description = '';
    const data2 = buildDocxData(report);
    expect(data2.background).toContain('2026.02.28 12:30');
  });

  it('should map header fields (fileNo + version)', () => {
    const data = buildDocxData(makeReport());
    // 页眉文件编号 = 偏差编号 + -R（对齐工厂 26003R）
    expect(data.fileNo).toBe('DEV-TEST-001-R');
    // 页眉版本号 = 版本历史首条
    expect(data.version).toBe('00');
  });

  it('should map hasPreliminary from preliminary analysis or scope', () => {
    const data = buildDocxData(makeReport());
    expect(data.hasPreliminary).toBe(true);

    const report = makeReport();
    report.investigation.rootCause.preliminaryAnalysis = '';
    report.investigation.rootCause.investigationScope = [];
    const data2 = buildDocxData(report);
    expect(data2.hasPreliminary).toBe(false);
  });
});

describe('renderTemplate', () => {
  it('should render docx containing filled values and loop rows', () => {
    const data = buildDocxData(makeReport());
    const buffer = renderTemplate(data);
    expect(buffer.length).toBeGreaterThan(10000);

    const zip = new PizZip(buffer);
    const xml = zip.file('word/document.xml')!.asText();
    const texts = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
    const flow = texts.join('');

    // 标题（跨 run 拼接）
    expect(flow).toContain('RT探头（编号：NBQ6）偏差调查和风险评估报告');
    // 动态段落
    expect(flow).toContain('Y21车间');
    expect(flow).toContain('人员面谈');
    expect(flow).toContain('验证人员缪一');
    expect(flow).toContain('人为原因');
    // 表格循环行
    expect(flow).toContain('DEV-001');
    expect(flow).toContain('CP-TZ-API-D-TZ-API-EG-26002-26001');
    expect(flow).toContain('CP-TZ-API-D-TZ-API-EG-26002-26003');
    expect(flow).toContain('调查报告-附件1');
    expect(flow).toContain('15页');
    expect(flow).toContain('00');
    // 无残留标签
    expect(flow).not.toMatch(/\{[#/a-zA-Z]/);
  });

  it('should render header with title, fileNo and version (对齐工厂 26003R 页眉)', () => {
    const data = buildDocxData(makeReport());
    const buffer = renderTemplate(data);
    const zip = new PizZip(buffer);
    const xml = zip.file('word/header1.xml')!.asText();
    const flow = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
    expect(flow).toContain('RT探头（编号：NBQ6）偏差调查和风险评估报告');
    expect(flow).toContain('Deviation Investigation and Risk Assessment Report for RT Probe of No. NBQ6');
    expect(flow).toContain('文件编号：DEV-TEST-001-R');
    expect(flow).toContain('版本号：00');
    // 页码保持模板原样
    expect(flow).toContain('页码：');
    // 页眉无残留标签
    expect(flow).not.toMatch(/\{[#/a-zA-Z]/);
  });

  it('should render 初步分析/全面调查 headings (对齐工厂 26003R)', () => {
    const data = buildDocxData(makeReport());
    const buffer = renderTemplate(data);
    const zip = new PizZip(buffer);
    const xml = zip.file('word/document.xml')!.asText();
    const flow = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
    expect(flow).toContain('初步分析 Preliminary Analysis');
    expect(flow).toContain('全面调查Complete investigation');
    expect(flow).not.toMatch(/\{[#/a-zA-Z]/);
  });

  it('should hide 初步分析 heading when empty but keep 全面调查 (对齐工厂 26002 写法)', () => {
    const report = makeReport();
    report.investigation.rootCause.preliminaryAnalysis = '';
    report.investigation.rootCause.investigationScope = [];
    const data = buildDocxData(report);
    expect(data.hasPreliminary).toBe(false);

    const buffer = renderTemplate(data);
    const zip = new PizZip(buffer);
    const xml = zip.file('word/document.xml')!.asText();
    const flow = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
    expect(flow).not.toContain('初步分析');
    expect(flow).toContain('全面调查Complete investigation');
    expect(flow).not.toMatch(/\{[#/a-zA-Z]/);
  });

  it('should hide repeat/other sections (title + table) when records and paragraphs are empty', () => {
    const report = makeReport();
    report.investigation = {
      investigationIntro: '',
      rootCause: {
        preliminaryAnalysis: '',
        factors: { man: '', machine: '', material: '', method: '', environment: '', measurement: '' },
        methods: { flowchart: false, fishbone: false, brainstorm: false, photos: [] },
        conclusion: '',
      },
      repeatDeviations: { records: [], analysis: '', conclusion: '' },
      otherProducts: { records: [], analysis: '', conclusion: '' },
    };
    report.capa = { corrections: [], preventions: [] };
    report.attachments = [];
    report.versionHistory = [];

    const data = buildDocxData(report);
    expect(data.repeatSection).toBe(false);
    expect(data.otherSection).toBe(false);

    const buffer = renderTemplate(data);
    const zip = new PizZip(buffer);
    const xml = zip.file('word/document.xml')!.asText();
    const tbls = [...xml.matchAll(/<w:tbl>(.*?)<\/w:tbl>/gs)];
    const rowCounts = tbls.map((t) => (t[1].match(/<w:tr\b[^>]*>/g) || []).length);
    // [签名表, CAPA, 附件, 版本历史] —— 重复偏差/其他产品整块隐藏
    expect(rowCounts).toEqual([3, 2, 1, 1]);
    const texts = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
    expect(texts).not.toContain('重复偏差调查');
    expect(texts).not.toContain('其他产品或批次调查');
  });

  it('should keep repeat section when records present even if paragraphs empty', () => {
    const report = makeReport();
    report.investigation.repeatDeviations = {
      records: [{ no: '1', time: '2024.01.01', deviationNo: 'DEV-009', description: 'd', rootCause: '-', capa: '-' }],
      analysis: '',
      conclusion: '',
    };
    const data = buildDocxData(report);
    expect(data.repeatSection).toBe(true);

    const buffer = renderTemplate(data);
    const zip = new PizZip(buffer);
    const xml = zip.file('word/document.xml')!.asText();
    const texts = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
    expect(texts).toContain('重复偏差调查');
    expect(texts).toContain('DEV-009');
  });
});

describe('defaultDocxFileName', () => {
  it('should derive a safe filename from report title', () => {
    const report = makeReport();
    report.title = '偏差报告 - DEV-1';
    expect(defaultDocxFileName(report)).toBe('偏差报告 - DEV-1.docx');
  });

  it('should fall back to deviationId', () => {
    const report = makeReport();
    report.title = '';
    expect(defaultDocxFileName(report)).toBe('DEV-TEST-001.docx');
  });
});
