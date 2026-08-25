import { describe, it, expect, vi, beforeEach } from 'vitest';
import { identifyFactorsNode } from '../../nodes/factor-identify';

// Mock the LLM caller
vi.mock('../../../llm/caller', () => ({
  identifyFactors: vi.fn().mockResolvedValue({
    man: ['操作人员培训不足'],
    machine: ['设备维护不及时'],
    material: ['原辅料检验缺失'],
    method: ['SOP未更新'],
    environment: ['温湿度超标'],
    measurement: ['探头校准过期'],
  }),
}));

describe('identifyFactorsNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return factors and findings', async () => {
    const result = await identifyFactorsNode('测试线索', {
      summary: '测试',
      keyEvents: [],
      involvedParties: [],
      documentType: 'deviation_analysis',
    });

    expect(result.factors).toBeDefined();
    expect(result.factors.man).toContain('操作人员培训不足');
    expect(result.factors.machine).toContain('设备维护不及时');
    expect(result.findings).toBeInstanceOf(Array);
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it('should map factors to AuditBee Finding format', async () => {
    const result = await identifyFactorsNode('测试', {
      summary: '测试',
      keyEvents: [],
      involvedParties: [],
      documentType: 'deviation_analysis',
    });

    for (const finding of result.findings) {
      expect(finding).toHaveProperty('finding_type');
      expect(finding).toHaveProperty('severity');
      expect(finding).toHaveProperty('title');
      expect(finding).toHaveProperty('description');
      // Should be valid AuditBee FindingType values
      expect(['logic_flaw', 'compliance_risk', 'inconsistency', 'missing_info', 'best_practice']).toContain(
        finding.finding_type,
      );
    }
  });

  it('should estimate severity by keyword (修复恒 medium 问题)', async () => {
    const result = await identifyFactorsNode('测试', {
      summary: '测试',
      keyEvents: [],
      involvedParties: [],
      documentType: 'deviation_analysis',
    });

    const byDesc = new Map(result.findings.map((f) => [f.description, f.severity]));
    // 合规性直接违反 → high（校准过期/超限）
    expect(byDesc.get('探头校准过期')).toBe('high');
    expect(byDesc.get('温湿度超标')).toBe('high');
    // 一般合规性缺陷 → medium
    expect(byDesc.get('操作人员培训不足')).toBe('medium');
    expect(byDesc.get('SOP未更新')).toBe('medium');
    // 所有 severity 均为合法级别
    for (const finding of result.findings) {
      expect(['high', 'medium', 'low', 'info']).toContain(finding.severity);
    }
  });
});
