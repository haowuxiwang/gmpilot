/**
 * Tests for report-to-markdown.ts
 * Verifies Markdown conversion with null safety.
 */

import { describe, it, expect } from 'vitest';
import { reportToMarkdown } from '../report-to-markdown';
import type { DeviationReport } from '../types';

/** Create a minimal valid DeviationReport for testing */
function createMockReport(overrides: Partial<DeviationReport> = {}): DeviationReport {
  return {
    report_type: 'full_report',
    title: '测试偏差报告',
    report_metadata: {
      findings_count: 0,
      task_type: 'deviation_analysis',
      report_source: 'gmpilot_generate',
    },
    cover: {
      title: '偏差调查报告',
      titleEn: 'Deviation Investigation Report',
      department: '生产部',
      preparedBy: { department: '生产部', name: '张三', signatureDate: '2026-01-01' },
      reviewedBy: { department: '生产部', name: '李四', signatureDate: '2026-01-02' },
    },
    background: {
      product: '阿莫西林胶囊',
      batch: 'B20260101',
      occurrenceTime: '2026-01-01 10:00',
      location: '固体制剂车间',
      description: '压片过程中发现片重差异超标',
    },
    investigation: {
      rootCause: {
        factors: {
          man: '操作人员确认按SOP操作',
          machine: '压片机冲头磨损',
          material: '物料正常',
          method: 'SOP-P-001 版本有效',
          environment: '环境正常',
          measurement: '测量系统正常',
        },
        methods: { flowchart: true, fishbone: true, brainstorm: false, photos: [] },
        conclusion: '设备故障导致',
      },
      repeatDeviations: { records: [], analysis: '无重复偏差', conclusion: '非系统性问题' },
      otherProducts: { records: [], analysis: '其他产品正常', conclusion: '无影响' },
    },
    conclusion: {
      rootCause: '压片机冲头磨损',
      mostLikelyCause: undefined,
    },
    riskAssessment: {
      description: '片重差异可能影响含量均匀度\n稳定性无影响',
      summary: '小结：1）需重新验证。',
    },
    capa: {
      corrections: [
        { capaNo: 'CA-001', content: '更换冲头', executor: '王五', expectedDate: '2026-01-10', signatureDate: '' },
      ],
      preventions: [
        { capaNo: 'PA-001', content: '增加冲头检查频次', executor: '赵六', expectedDate: '2026-01-15', signatureDate: '' },
      ],
    },
    attachments: [],
    versionHistory: [],
    deviationId: 'DEV-2026-001',
    riskScore: 45,
    riskLevel: 'medium',
    factors: { man: [], machine: ['冲头磨损'], material: [], method: [], environment: [], measurement: [] },
    regulations: [],
    findings: [],
    ...overrides,
  };
}

describe('reportToMarkdown', () => {
  it('should convert a complete report to markdown', () => {
    const report = createMockReport();
    const md = reportToMarkdown(report);

    expect(md).toContain('# 偏差调查报告');
    expect(md).toContain('**Deviation Investigation Report**');
    expect(md).toContain('**偏差编号**: DEV-2026-001');
    expect(md).toContain('**部门**: 生产部');
    expect(md).toContain('**风险评分**: 45/100 (medium)');
    expect(md).toContain('## 1. 背景');
    expect(md).toContain('**产品 Product**: 阿莫西林胶囊');
    expect(md).toContain('## 2. 偏差调查');
    expect(md).toContain('## 3. 调查结论');
    expect(md).toContain('**根本原因 Root Cause**: 压片机冲头磨损');
    expect(md).toContain('## 4. 风险分析');
    expect(md).toContain('## 5. 纠正预防措施 CAPA');
    expect(md).toContain('CA-001');
    expect(md).toContain('PA-001');
  });

  it('should handle null/undefined cover gracefully', () => {
    const report = createMockReport({ cover: undefined as unknown as DeviationReport['cover'] });
    const md = reportToMarkdown(report);

    expect(md).toContain('# 偏差调查报告'); // fallback title
    expect(md).toContain('**部门**: N/A');
  });

  it('should handle null/undefined background gracefully', () => {
    const report = createMockReport({ background: undefined as unknown as DeviationReport['background'] });
    const md = reportToMarkdown(report);

    expect(md).toContain('**产品 Product**: N/A');
    expect(md).toContain('**批次 Batch**: N/A');
  });

  it('should handle null/undefined investigation gracefully', () => {
    const report = createMockReport({ investigation: undefined as unknown as DeviationReport['investigation'] });
    const md = reportToMarkdown(report);

    expect(md).toContain('**人员 Man**: N/A');
    expect(md).toContain('**调查结论 Conclusion**: N/A');
  });

  it('should handle null/undefined conclusion gracefully', () => {
    const report = createMockReport({ conclusion: undefined as unknown as DeviationReport['conclusion'] });
    const md = reportToMarkdown(report);

    expect(md).toContain('**根本原因 Root Cause**: N/A');
  });

  it('should handle null/undefined riskAssessment gracefully', () => {
    const report = createMockReport({ riskAssessment: undefined as unknown as DeviationReport['riskAssessment'] });
    const md = reportToMarkdown(report);

    expect(md).toContain('## 4. 风险分析及影响评估 Risks Analysis and Impact Assessment');
    // Should not throw, just skip the risk paragraphs
  });

  it('should handle null/undefined capa gracefully', () => {
    const report = createMockReport({ capa: undefined as unknown as DeviationReport['capa'] });
    const md = reportToMarkdown(report);

    expect(md).toContain('## 5. 纠正预防措施 CAPA');
    // Should not throw, just skip CAPA sections
  });

  it('should handle empty corrections and preventions', () => {
    const report = createMockReport({
      capa: { corrections: [], preventions: [] },
    });
    const md = reportToMarkdown(report);

    expect(md).toContain('## 5. 纠正预防措施 CAPA');
    expect(md).not.toContain('### 纠正措施');
    expect(md).not.toContain('### 预防措施');
  });

  it('should include mostLikelyCause when present', () => {
    const report = createMockReport({
      conclusion: { rootCause: '未知', mostLikelyCause: '设备老化' },
    });
    const md = reportToMarkdown(report);

    expect(md).toContain('**最有可能原因 Most Likely Cause**: 设备老化');
  });

  it('should handle missing deviationId and riskScore', () => {
    const report = createMockReport({
      deviationId: undefined as unknown as string,
      riskScore: undefined as unknown as number,
      riskLevel: undefined as unknown as DeviationReport['riskLevel'],
    });
    const md = reportToMarkdown(report);

    expect(md).toContain('**偏差编号**: N/A');
    expect(md).toContain('**风险评分**: 0/100 (未评估)');
  });
});
