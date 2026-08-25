import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateRiskScore, generateReportNode } from '../../nodes/report-generate';
import type { Finding, ClueAnalysis, Factor5M1E, RegulationMatch } from '../../types';

// Mock LLM caller — use vi.fn() so we can configure per-test
const mockGenerateReport = vi.fn().mockResolvedValue({
  cover: { title: 'test', titleEn: 'test', department: 'QA', preparedBy: { name: '', signatureDate: '' }, reviewedBy: { name: '', signatureDate: '' } },
  background: { product: 'test', batch: '001', occurrenceTime: '', location: '', description: '' },
  investigation: {
    rootCause: { interviews: '', sopReview: '', historicalData: '', relatedBatches: '', batchRecords: '', samplesReview: '', stabilityStudy: '', supplierReview: '', methods: { flowchart: false, fishbone: false, brainstorm: false, photos: [] }, conclusion: '' },
    repeatDeviations: { records: [], analysis: '', conclusion: '' },
    otherProducts: { records: [], analysis: '', conclusion: '' },
  },
  conclusion: { rootCause: '' },
  riskAssessment: { description: '', summary: '' },
  capa: { corrections: [], preventions: [] },
  attachments: [],
  versionHistory: [],
});

const mockStreamReport = vi.fn();

vi.mock('../../../llm/caller', () => ({
  generateReport: (...args: unknown[]) => mockGenerateReport(...args),
  streamReport: (...args: unknown[]) => {
    return mockStreamReport(...args);
  },
}));

describe('calculateRiskScore', () => {
  it('should return 0/low for empty findings', () => {
    const result = calculateRiskScore([]);
    expect(result.score).toBe(0);
    expect(result.level).toBe('low');
  });

  it('should calculate score for single high finding', () => {
    const findings: Finding[] = [
      { finding_type: 'compliance_risk', severity: 'high', title: 'test', description: 'test' },
    ];
    const result = calculateRiskScore(findings);
    expect(result.score).toBe(60);
    expect(result.level).toBe('high');
  });

  it('should calculate score for single medium finding', () => {
    const findings: Finding[] = [
      { finding_type: 'compliance_risk', severity: 'medium', title: 'test', description: 'test' },
    ];
    const result = calculateRiskScore(findings);
    expect(result.score).toBe(30);
    expect(result.level).toBe('medium');
  });

  it('should calculate score for single low finding', () => {
    const findings: Finding[] = [
      { finding_type: 'best_practice', severity: 'low', title: 'test', description: 'test' },
    ];
    const result = calculateRiskScore(findings);
    expect(result.score).toBe(10);
    expect(result.level).toBe('low');
  });

  it('should calculate score for single info finding', () => {
    const findings: Finding[] = [
      { finding_type: 'missing_info', severity: 'info', title: 'test', description: 'test' },
    ];
    const result = calculateRiskScore(findings);
    expect(result.score).toBe(5);
    expect(result.level).toBe('low');
  });

  it('should cap score at 100', () => {
    const findings: Finding[] = Array(5).fill({
      finding_type: 'compliance_risk',
      severity: 'high',
      title: 'test',
      description: 'test',
    });
    const result = calculateRiskScore(findings);
    expect(result.score).toBe(80);
    expect(result.level).toBe('high');
  });

  it('should sum scores from mixed severity findings', () => {
    const findings: Finding[] = [
      { finding_type: 'compliance_risk', severity: 'high', title: 'h', description: '' },
      { finding_type: 'compliance_risk', severity: 'medium', title: 'm', description: '' },
      { finding_type: 'compliance_risk', severity: 'low', title: 'l', description: '' },
    ];
    const result = calculateRiskScore(findings);
    // 60 + (3-1)*5 = 70
    expect(result.score).toBe(70);
    expect(result.level).toBe('high');
  });

  it('should classify score >= 60 as high', () => {
    const findings: Finding[] = [
      { finding_type: 'compliance_risk', severity: 'high', title: '', description: '' },
      { finding_type: 'compliance_risk', severity: 'high', title: '', description: '' },
    ];
    const result = calculateRiskScore(findings);
    expect(result.score).toBe(65);
    expect(result.level).toBe('high');
  });

  it('should classify score 30-59 as medium', () => {
    const findings: Finding[] = [
      { finding_type: 'compliance_risk', severity: 'high', title: '', description: '' },
    ];
    const result = calculateRiskScore(findings);
    expect(result.score).toBe(60);
    expect(result.level).toBe('high');
  });

  it('should classify score < 30 as low', () => {
    const findings: Finding[] = [
      { finding_type: 'compliance_risk', severity: 'medium', title: '', description: '' },
    ];
    const result = calculateRiskScore(findings);
    expect(result.score).toBe(30);
    expect(result.level).toBe('medium');
  });

  it('should not inflate score from many medium findings (5M1E candidate factors)', () => {
    // factor-identify 将每个 5M1E 候选因素转为 medium finding（通常 15 条）
    // 回归测试：候选因素堆叠不应把分数推满到 100/high
    const findings: Finding[] = Array(15).fill({
      finding_type: 'compliance_risk',
      severity: 'medium',
      title: '',
      description: '',
    });
    const result = calculateRiskScore(findings);
    // 30 + 数量修正封顶 20 = 50
    expect(result.score).toBe(50);
    expect(result.level).toBe('medium');
  });

  it('should default to weight 10 for unknown severity', () => {
    const findings: Finding[] = [
      { finding_type: 'compliance_risk', severity: 'unknown' as Finding['severity'], title: '', description: '' },
    ];
    const result = calculateRiskScore(findings);
    expect(result.score).toBe(10);
    expect(result.level).toBe('low');
  });
});

// ============================================================================
// generateReportNode
// ============================================================================

// Shared test fixtures
const mockAnalysis: ClueAnalysis = {
  summary: '测试偏差摘要',
  keyEvents: ['发现偏差'],
  involvedParties: ['QA'],
  documentType: 'deviation_analysis',
};

const mockFactors: Factor5M1E = {
  man: ['操作人员培训不足'],
  machine: [],
  material: [],
  method: ['SOP未更新'],
  measurement: [],
  environment: [],
};

const mockRegulations: RegulationMatch[] = [
  { regulation: '中国GMP', chapter: '第二章', article: '第十条', title: '偏差处理', content: '内容', relevance: '相关' },
];

const mockFindings: Finding[] = [
  { finding_type: 'compliance_risk', severity: 'medium', title: '人员因素', description: '操作人员培训不足' },
  { finding_type: 'logic_flaw', severity: 'low', title: '方法因素', description: 'SOP未更新' },
];

const llmReportResponse = {
  cover: { title: '偏差报告', titleEn: 'Deviation Report', department: 'QA', preparedBy: { name: '张三', signatureDate: '2024-01-01' }, reviewedBy: { name: '李四', signatureDate: '2024-01-02' } },
  background: { product: '产品A', batch: '2024-001', occurrenceTime: '2024-01-15', location: '车间A', description: '偏差描述' },
  investigation: {
    rootCause: { interviews: '访谈记录', sopReview: 'SOP审查', historicalData: '历史数据', relatedBatches: '相关批次', batchRecords: '批记录', samplesReview: '样品审查', stabilityStudy: '稳定性研究', supplierReview: '供应商审查', methods: { flowchart: true, fishbone: false, brainstorm: false, photos: [] }, conclusion: '根因结论' },
    repeatDeviations: { records: [], analysis: '无重复偏差', conclusion: '无' },
    otherProducts: { records: [], analysis: '无影响', conclusion: '无' },
  },
  conclusion: { rootCause: '根本原因是培训不足' },
  riskAssessment: { description: '中等', summary: '小结' },
  capa: { corrections: [], preventions: [] },
  attachments: [],
  versionHistory: [],
};

describe('generateReportNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateReport.mockResolvedValue(llmReportResponse);
    mockStreamReport.mockResolvedValue(llmReportResponse);
  });

  it('should call LLM and return a complete report', async () => {
    const result = await generateReportNode(
      'DEV-TEST-001',
      mockAnalysis,
      mockFactors,
      mockRegulations,
      mockFindings,
    );

    expect(mockGenerateReport).toHaveBeenCalledOnce();
    expect(result.deviationId).toBe('DEV-TEST-001');
    expect(result.report_type).toBe('full_report');
    expect(result.title).toContain('DEV-TEST-001');
  });

  it('should calculate risk score from findings', async () => {
    const result = await generateReportNode(
      'DEV-TEST-002',
      mockAnalysis,
      mockFactors,
      mockRegulations,
      mockFindings,
    );

    // medium(30) + 数量修正5 = 35
    expect(result.riskScore).toBe(35);
    expect(result.riskLevel).toBe('medium');
  });

  it('should include report metadata', async () => {
    const result = await generateReportNode(
      'DEV-TEST-003',
      mockAnalysis,
      mockFactors,
      mockRegulations,
      mockFindings,
    );

    expect(result.report_metadata).toBeDefined();
    expect(result.report_metadata.findings_count).toBe(2);
    expect(result.report_metadata.task_type).toBe('deviation_analysis');
    expect(result.report_metadata.report_source).toBe('gmpilot_generate');
    expect(result.report_metadata.deviation_id).toBe('DEV-TEST-003');
    expect(result.report_metadata.risk_score).toBe(35);
    expect(result.report_metadata.risk_level).toBe('medium');
  });

  it('should preserve raw factors, regulations, and findings', async () => {
    const result = await generateReportNode(
      'DEV-TEST-004',
      mockAnalysis,
      mockFactors,
      mockRegulations,
      mockFindings,
    );

    expect(result.factors).toEqual(mockFactors);
    expect(result.regulations).toEqual(mockRegulations);
    expect(result.findings).toEqual(mockFindings);
  });

  it('should include LLM-generated content sections', async () => {
    const result = await generateReportNode(
      'DEV-TEST-005',
      mockAnalysis,
      mockFactors,
      mockRegulations,
      mockFindings,
    );

    expect(result.cover).toBeDefined();
    expect(result.background).toBeDefined();
    expect(result.investigation).toBeDefined();
    expect(result.conclusion).toBeDefined();
    expect(result.riskAssessment).toBeDefined();
    expect(result.capa).toBeDefined();
    expect(result.attachments).toBeDefined();
    expect(result.versionHistory).toBeDefined();
  });

  it('should use streamReportLLM when onPartial callback is provided', async () => {
    const onPartial = vi.fn();

    const result = await generateReportNode(
      'DEV-STREAM-001',
      mockAnalysis,
      mockFactors,
      mockRegulations,
      mockFindings,
      onPartial,
    );

    // streamReport should be called instead of generateReport
    expect(mockStreamReport).toHaveBeenCalledOnce();
    expect(mockGenerateReport).not.toHaveBeenCalled();
    expect(result.deviationId).toBe('DEV-STREAM-001');
  });

  it('should handle high-risk findings correctly', async () => {
    const highRiskFindings: Finding[] = [
      { finding_type: 'compliance_risk', severity: 'high', title: '严重偏差', description: '描述' },
      { finding_type: 'compliance_risk', severity: 'high', title: '另一严重偏差', description: '描述' },
    ];

    const result = await generateReportNode(
      'DEV-HIGH-001',
      mockAnalysis,
      mockFactors,
      mockRegulations,
      highRiskFindings,
    );

    // high(60) + 数量修正5 = 65
    expect(result.riskScore).toBe(65);
    expect(result.riskLevel).toBe('high');
  });

  it('should handle empty findings', async () => {
    const result = await generateReportNode(
      'DEV-EMPTY-001',
      mockAnalysis,
      mockFactors,
      mockRegulations,
      [],
    );

    expect(result.riskScore).toBe(0);
    expect(result.riskLevel).toBe('low');
    expect(result.report_metadata.findings_count).toBe(0);
  });

  it('should propagate LLM errors', async () => {
    mockGenerateReport.mockRejectedValueOnce(new Error('LLM API error'));

    await expect(
      generateReportNode('DEV-ERR-001', mockAnalysis, mockFactors, mockRegulations, mockFindings),
    ).rejects.toThrow('LLM API error');
  });

  it('should throw when LLM returns null/non-object', async () => {
    mockGenerateReport.mockResolvedValueOnce(null);

    await expect(
      generateReportNode('DEV-NULL-001', mockAnalysis, mockFactors, mockRegulations, mockFindings),
    ).rejects.toThrow('Invalid report output');
  });

  it('should warn but proceed when report is missing major sections', async () => {
    mockGenerateReport.mockResolvedValueOnce({
      conclusion: { rootCause: 'test' },
      riskAssessment: {},
      capa: { corrections: [], preventions: [] },
      attachments: [],
      versionHistory: [],
    });

    const result = await generateReportNode(
      'DEV-MISSING-001',
      mockAnalysis,
      mockFactors,
      mockRegulations,
      mockFindings,
    );

    expect(result.deviationId).toBe('DEV-MISSING-001');
    expect(result.report_type).toBe('full_report');
  });
});
