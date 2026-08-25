import { describe, it, expect, vi } from 'vitest';
import { assembleReport, generateModules, reviseModules, mapFindingsToModules, reconcileAttachmentReferences } from '../assembler';
import type { Finding } from '../types';
import type { ModulesResult } from '../assembler';

// Mock logger
vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock metrics
vi.mock('../../utils/metrics', () => ({
  recordMetric: vi.fn(),
}));

describe('assembleReport', () => {
  it('should assemble report with all modules', () => {
    const modules = {
      cover: {
        title: 'Test Report',
        titleEn: 'Test Report',
        department: 'QA',
        preparedBy: { name: 'John', signatureDate: '2026-01-01' },
        reviewedBy: { name: 'Jane', signatureDate: '2026-01-02' },
      },
      background: {
        product: 'Test Product',
        batch: 'B001',
        occurrenceTime: '2026-01-01 10:00',
        location: 'Factory A',
        description: 'Test description',
      },
      investigation: {
        rootCause: {
          interviews: 'Test interviews',
          sopReview: 'Test SOP review',
          historicalData: 'Test historical data',
          relatedBatches: 'Test related batches',
          batchRecords: 'Test batch records',
          samplesReview: 'Test samples review',
          stabilityStudy: 'Test stability study',
          supplierReview: 'Test supplier review',
          methods: {
            flowchart: false,
            fishbone: true,
            brainstorm: false,
            photos: [],
          },
          conclusion: 'Test conclusion',
        },
        repeatDeviations: {
          records: [],
          analysis: 'No repeat deviations',
          conclusion: 'No repeat deviations',
        },
        otherProducts: {
          records: [],
          analysis: 'No other products affected',
          conclusion: 'No other products affected',
        },
      },
      conclusion: {
        rootCause: 'Test root cause',
      },
      riskAssessment: {
        description: 'Low impact',
        summary: 'Summary',
      },
      capa: {
        corrections: [],
        preventions: [],
      },
      attachments: {
        attachments: [],
        versionHistory: [],
      },
    };

    const findings = [
      {
        finding_type: 'compliance_risk',
        severity: 'medium',
        title: 'Test finding',
        description: 'Test description',
      },
    ];

    const report = assembleReport(
      'DEV-001',
      modules as unknown as ModulesResult,
      { man: [], machine: [], material: [], method: [], environment: [], measurement: [] },
      [],
      findings as Finding[],
    );

    expect(report.deviationId).toBe('DEV-001');
    expect(report.title).toBe('Test Report');
    expect(report.riskLevel).toBeDefined();
    expect(report.riskScore).toBeDefined();
    expect(report.background).toBeDefined();
    expect(report.investigation).toBeDefined();
    expect(report.conclusion).toBeDefined();
    expect(report.riskAssessment).toBeDefined();
    expect(report.capa).toBeDefined();
  });
});

describe('reconcileAttachmentReferences', () => {
  const makeModules = (investigationText: string, attachmentNos: string[]): ModulesResult =>
    ({
      cover: { title: 'T', titleEn: '', department: 'QA', preparedBy: { name: '', signatureDate: '' }, reviewedBy: { name: '', signatureDate: '' } },
      background: { product: '', batch: '', occurrenceTime: '', location: '', description: '' },
      investigation: {
        investigationIntro: '',
        rootCause: {
          preliminaryAnalysis: investigationText,
          factors: { man: '', machine: '', material: '', method: '', environment: '', measurement: '' },
          methods: { flowchart: false, fishbone: false, brainstorm: false, photos: [] },
          conclusion: '',
        },
        repeatDeviations: { records: [], analysis: '', conclusion: '' },
        otherProducts: { records: [], analysis: '', conclusion: '' },
      },
      conclusion: { rootCause: '' },
      riskAssessment: { description: '', summary: '' },
      capa: { corrections: [], preventions: [] },
      attachments: { attachments: attachmentNos.map(no => ({ no, name: '附件文档', pages: '待补充' })), versionHistory: [] },
    }) as unknown as ModulesResult;

  it('returns no mismatch when references match the list', () => {
    const result = reconcileAttachmentReferences(makeModules('详见调查报告-附件1、附件2', ['1', '2']));
    expect(result.referencedNos).toEqual([1, 2]);
    expect(result.listedNos).toEqual([1, 2]);
    expect(result.missingInList).toEqual([]);
    expect(result.orphanedInList).toEqual([]);
  });

  it('reports references missing from the attachment list', () => {
    const result = reconcileAttachmentReferences(makeModules('详见调查报告-附件3', ['1', '2']));
    expect(result.missingInList).toEqual([3]);
    expect(result.orphanedInList).toEqual([1, 2]);
  });

  it('reports orphaned list entries not referenced in narrative', () => {
    const result = reconcileAttachmentReferences(makeModules('详见调查报告-附件1', ['1', '2']));
    expect(result.orphanedInList).toEqual([2]);
  });

  it('ignores single-attachment fallback list', () => {
    const result = reconcileAttachmentReferences(makeModules('未引用任何附件', ['1']));
    expect(result.orphanedInList).toEqual([]);
  });

  it('extracts references from multiple investigation fields', () => {
    const modules = makeModules('', ['1']);
    modules.investigation = {
      ...(modules.investigation as object),
      investigationIntro: '调查过程',
      rootCause: {
        preliminaryAnalysis: '',
        factors: {
          man: '详见调查报告-附件1',
          machine: '',
          material: '详见调查报告-附件2',
          method: '',
          environment: '',
          measurement: '',
        },
        methods: { flowchart: false, fishbone: false, brainstorm: false, photos: [] },
        conclusion: '',
      },
      repeatDeviations: { records: [], analysis: '', conclusion: '' },
      otherProducts: { records: [], analysis: '', conclusion: '' },
    } as ModulesResult['investigation'];
    const result = reconcileAttachmentReferences(modules);
    expect(result.referencedNos).toEqual([1, 2]);
    expect(result.missingInList).toEqual([2]);
  });
});

describe('generateModules', () => {
  it('should generate modules with valid generators', async () => {
    const context = {
      deviationId: 'DEV-001',
      analysis: { summary: 'Test', keyEvents: [], involvedParties: [], documentType: 'deviation_analysis' as const },
      factors: { man: [], machine: [], material: [], method: [], environment: [], measurement: [] },
      regulations: [],
      findings: [],
    };

    const mockGenerators = {
      cover: { generate: vi.fn().mockResolvedValue({ title: 'Test', titleEn: 'Test', department: 'QA', preparedBy: { name: 'John', signatureDate: '' }, reviewedBy: { name: 'Jane', signatureDate: '' } }) },
      background: { generate: vi.fn().mockResolvedValue({ product: 'Test', batch: 'B001', occurrenceTime: '', location: '', description: '' }) },
      investigation: { generate: vi.fn().mockResolvedValue({ rootCause: { interviews: '', sopReview: '', historicalData: '', relatedBatches: '', batchRecords: '', samplesReview: '', stabilityStudy: '', supplierReview: '', methods: { flowchart: false, fishbone: false, brainstorm: false, photos: [] }, conclusion: '' }, repeatDeviations: { records: [], analysis: '', conclusion: '' }, otherProducts: { records: [], analysis: '', conclusion: '' } }) },
      conclusion: { generate: vi.fn().mockResolvedValue({ rootCause: '' }) },
      riskAssessment: { generate: vi.fn().mockResolvedValue({ description: '', summary: '' }) },
      capa: { generate: vi.fn().mockResolvedValue({ corrections: [], preventions: [] }) },
      attachments: { generate: vi.fn().mockResolvedValue({ attachments: [], versionHistory: [] }) },
    };

    const result = await generateModules(mockGenerators as unknown as Parameters<typeof generateModules>[0], context);

    expect(result).toBeDefined();
    expect(result.cover).toBeDefined();
    expect(result.background).toBeDefined();
    expect(result.investigation).toBeDefined();
    expect(result.conclusion).toBeDefined();
    expect(result.riskAssessment).toBeDefined();
    expect(result.capa).toBeDefined();
    expect(result.attachments).toBeDefined();
  });

  it('should call onProgress callback', async () => {
    const context = {
      deviationId: 'DEV-002',
      analysis: { summary: 'Test', keyEvents: [], involvedParties: [], documentType: 'deviation_analysis' as const },
      factors: { man: [], machine: [], material: [], method: [], environment: [], measurement: [] },
      regulations: [],
      findings: [],
    };

    const mockGenerators = {
      cover: { generate: vi.fn().mockResolvedValue({ title: 'T', titleEn: 'T', department: 'QA', preparedBy: { name: 'J', signatureDate: '' }, reviewedBy: { name: 'J', signatureDate: '' } }) },
      background: { generate: vi.fn().mockResolvedValue({ product: 'P', batch: 'B', occurrenceTime: '', location: '', description: '' }) },
      investigation: { generate: vi.fn().mockResolvedValue({ rootCause: { interviews: '', sopReview: '', historicalData: '', relatedBatches: '', batchRecords: '', samplesReview: '', stabilityStudy: '', supplierReview: '', methods: { flowchart: false, fishbone: false, brainstorm: false, photos: [] }, conclusion: '' }, repeatDeviations: { records: [], analysis: '', conclusion: '' }, otherProducts: { records: [], analysis: '', conclusion: '' } }) },
      conclusion: { generate: vi.fn().mockResolvedValue({ rootCause: '' }) },
      riskAssessment: { generate: vi.fn().mockResolvedValue({ description: '', summary: '' }) },
      capa: { generate: vi.fn().mockResolvedValue({ corrections: [], preventions: [] }) },
      attachments: { generate: vi.fn().mockResolvedValue({ attachments: [], versionHistory: [] }) },
    };

    const progressCalls: string[] = [];
    await generateModules(mockGenerators as unknown as Parameters<typeof generateModules>[0], context, (phase, mod) => progressCalls.push(`${phase}:${mod}`));

    expect(progressCalls.length).toBeGreaterThan(0);
  });

  it('should fall back to template when a module fails, keeping others', async () => {
    const context = {
      deviationId: 'DEV-003',
      analysis: { summary: 'Test', keyEvents: [], involvedParties: [], documentType: 'deviation_analysis' as const },
      factors: { man: [], machine: [], material: [], method: [], environment: [], measurement: [] },
      regulations: [],
      findings: [],
    };

    const fallbackOutput = { product: 'fallback', batch: 'B', occurrenceTime: '', location: '', description: '' };
    const mockGenerators = {
      cover: { generate: vi.fn().mockResolvedValue({ title: 'T', titleEn: 'T', department: 'QA', preparedBy: { name: 'J', signatureDate: '' }, reviewedBy: { name: 'J', signatureDate: '' } }), generateFallback: vi.fn().mockResolvedValue({ title: 'T', titleEn: 'T', department: 'QA', preparedBy: { name: 'J', signatureDate: '' }, reviewedBy: { name: 'J', signatureDate: '' } }) },
      background: { generate: vi.fn().mockRejectedValue(new Error('LLM 调用超时')), generateFallback: vi.fn().mockResolvedValue(fallbackOutput) },
      investigation: { generate: vi.fn().mockResolvedValue({ rootCause: { interviews: '', sopReview: '', historicalData: '', relatedBatches: '', batchRecords: '', samplesReview: '', stabilityStudy: '', supplierReview: '', methods: { flowchart: false, fishbone: false, brainstorm: false, photos: [] }, conclusion: '' }, repeatDeviations: { records: [], analysis: '', conclusion: '' }, otherProducts: { records: [], analysis: '', conclusion: '' } }), generateFallback: vi.fn() },
      conclusion: { generate: vi.fn().mockResolvedValue({ rootCause: '' }), generateFallback: vi.fn() },
      riskAssessment: { generate: vi.fn().mockResolvedValue({ description: '', summary: '' }), generateFallback: vi.fn() },
      capa: { generate: vi.fn().mockResolvedValue({ corrections: [], preventions: [] }), generateFallback: vi.fn() },
      attachments: { generate: vi.fn().mockResolvedValue({ attachments: [], versionHistory: [] }), generateFallback: vi.fn() },
    };

    const result = await generateModules(mockGenerators as unknown as Parameters<typeof generateModules>[0], context);

    // Failed module uses fallback output, others still succeed
    expect(result.background.product).toBe('fallback');
    expect(result.investigation).toBeDefined();
    expect(result.conclusion).toBeDefined();
    expect(result.riskAssessment).toBeDefined();
    expect(result.capa).toBeDefined();
    expect(result.attachments).toBeDefined();
    // Fallback is recorded
    expect(result.fallbackModules).toContain('background');
    // Non-failed modules do not fall back
    expect(result.fallbackModules).not.toContain('investigation');
    expect(mockGenerators.background.generateFallback).toHaveBeenCalled();
  });

  it('should keep generating when ALL modules fail (full template fallback)', async () => {
    const context = {
      deviationId: 'DEV-004',
      analysis: { summary: 'Test', keyEvents: [], involvedParties: [], documentType: 'deviation_analysis' as const },
      factors: { man: [], machine: [], material: [], method: [], environment: [], measurement: [] },
      regulations: [],
      findings: [],
    };

    const mockGenerators = {
      cover: { generate: vi.fn().mockRejectedValue(new Error('fail')), generateFallback: vi.fn().mockResolvedValue({ title: 'T', titleEn: 'T', department: 'QA', preparedBy: { name: 'J', signatureDate: '' }, reviewedBy: { name: 'J', signatureDate: '' } }) },
      background: { generate: vi.fn().mockRejectedValue(new Error('fail')), generateFallback: vi.fn().mockResolvedValue({ product: 'P', batch: 'B', occurrenceTime: '', location: '', description: '' }) },
      investigation: { generate: vi.fn().mockRejectedValue(new Error('fail')), generateFallback: vi.fn().mockResolvedValue({ rootCause: { interviews: '', sopReview: '', historicalData: '', relatedBatches: '', batchRecords: '', samplesReview: '', stabilityStudy: '', supplierReview: '', methods: { flowchart: false, fishbone: false, brainstorm: false, photos: [] }, conclusion: '' }, repeatDeviations: { records: [], analysis: '', conclusion: '' }, otherProducts: { records: [], analysis: '', conclusion: '' } }) },
      conclusion: { generate: vi.fn().mockRejectedValue(new Error('fail')), generateFallback: vi.fn().mockResolvedValue({ rootCause: '' }) },
      riskAssessment: { generate: vi.fn().mockRejectedValue(new Error('fail')), generateFallback: vi.fn().mockResolvedValue({ description: '', summary: '' }) },
      capa: { generate: vi.fn().mockRejectedValue(new Error('fail')), generateFallback: vi.fn().mockResolvedValue({ corrections: [], preventions: [] }) },
      attachments: { generate: vi.fn().mockRejectedValue(new Error('fail')), generateFallback: vi.fn().mockResolvedValue({ attachments: [], versionHistory: [] }) },
    };

    const result = await generateModules(mockGenerators as unknown as Parameters<typeof generateModules>[0], context);

    expect(result.fallbackModules).toHaveLength(7);
    expect(result.background).toBeDefined();
    expect(result.cover).toBeDefined();
  });
});

describe('reviseModules', () => {
  const existingModules = {
    cover: { title: 'Old', titleEn: 'Old', department: 'QA', preparedBy: { name: 'J', signatureDate: '' }, reviewedBy: { name: 'J', signatureDate: '' } },
    background: { product: 'Old', batch: 'B001', occurrenceTime: '', location: '', description: '' },
    investigation: { rootCause: { interviews: '', sopReview: '', historicalData: '', relatedBatches: '', batchRecords: '', samplesReview: '', stabilityStudy: '', supplierReview: '', methods: { flowchart: false, fishbone: false, brainstorm: false, photos: [] }, conclusion: '' }, repeatDeviations: { records: [], analysis: '', conclusion: '' }, otherProducts: { records: [], analysis: '', conclusion: '' } },
    conclusion: { rootCause: 'old cause' },
    riskAssessment: { description: '', summary: '' },
    capa: { corrections: [], preventions: [] },
    attachments: { attachments: [], versionHistory: [] },
  };

  const context = {
    deviationId: 'DEV-001',
    analysis: { summary: 'Test', keyEvents: [], involvedParties: [], documentType: 'deviation_analysis' as const },
    factors: { man: [], machine: [], material: [], method: [], environment: [], measurement: [] },
    regulations: [],
    findings: [],
    revisionContext: '修改背景信息',
  };

  it('should revise only targeted modules', async () => {
    const generators = {
      background: { generate: vi.fn().mockResolvedValue({ product: 'New', batch: 'B002', occurrenceTime: '', location: '', description: 'new' }) },
      investigation: { generate: vi.fn() },
      conclusion: { generate: vi.fn() },
      riskAssessment: { generate: vi.fn() },
      capa: { generate: vi.fn() },
    };

    const result = await reviseModules(
      generators as unknown as Parameters<typeof reviseModules>[0],
      existingModules as unknown as Parameters<typeof reviseModules>[1],
      ['background'], context);

    expect(generators.background.generate).toHaveBeenCalled();
    expect(generators.investigation.generate).not.toHaveBeenCalled();
    expect(result.background.product).toBe('New');
    // Non-revised modules preserved
    expect(result.conclusion.rootCause).toBe('old cause');
  });

  it('should revise multiple modules in dependency order', async () => {
    const callOrder: string[] = [];
    const generators = {
      background: { generate: vi.fn().mockImplementation(async () => { callOrder.push('background'); return { product: 'N', batch: 'B', occurrenceTime: '', location: '', description: '' }; }) },
      investigation: { generate: vi.fn().mockImplementation(async () => { callOrder.push('investigation'); return existingModules.investigation; }) },
      conclusion: { generate: vi.fn().mockImplementation(async () => { callOrder.push('conclusion'); return { rootCause: 'new' }; }) },
      riskAssessment: { generate: vi.fn().mockImplementation(async () => { callOrder.push('riskAssessment'); return existingModules.riskAssessment; }) },
      capa: { generate: vi.fn().mockImplementation(async () => { callOrder.push('capa'); return existingModules.capa; }) },
    };

    const progressModules: string[] = [];
    await reviseModules(
      generators as unknown as Parameters<typeof reviseModules>[0],
      existingModules as unknown as Parameters<typeof reviseModules>[1],
      ['background', 'investigation', 'conclusion', 'riskAssessment', 'capa'],
      context,
      (mod) => progressModules.push(mod),
    );

    expect(callOrder.indexOf('background')).toBeLessThan(callOrder.indexOf('investigation'));
    expect(callOrder.indexOf('investigation')).toBeLessThan(callOrder.indexOf('conclusion'));
    expect(progressModules).toContain('background');
    expect(progressModules).toContain('capa');
  });

  it('should fall back when a revised module fails', async () => {
    const generators = {
      background: { generate: vi.fn().mockRejectedValue(new Error('revision failed')), generateFallback: vi.fn().mockResolvedValue({ product: 'Fallback', batch: 'B', occurrenceTime: '', location: '', description: '' }) },
      investigation: { generate: vi.fn(), generateFallback: vi.fn() },
      conclusion: { generate: vi.fn(), generateFallback: vi.fn() },
      riskAssessment: { generate: vi.fn(), generateFallback: vi.fn() },
      capa: { generate: vi.fn(), generateFallback: vi.fn() },
    };

    const result = await reviseModules(
      generators as unknown as Parameters<typeof reviseModules>[0],
      existingModules as unknown as Parameters<typeof reviseModules>[1],
      ['background'], context);

    expect(result.background.product).toBe('Fallback');
    expect(generators.background.generateFallback).toHaveBeenCalled();
    expect(result.fallbackModules).toContain('background');
  });
});

describe('mapFindingsToModules', () => {
  it('should map findings to relevant modules', () => {
    const findings = [
      { finding_type: 'missing_info', severity: 'high', title: '背景描述不完整', description: 'test' },
      { finding_type: 'compliance_risk', severity: 'medium', title: 'CAPA 纠正措施不足', description: 'test' },
    ];

    const modules = mapFindingsToModules(findings);
    expect(modules).toContain('background');
    expect(modules).toContain('capa');
    expect(modules).toContain('investigation');
  });

  it('should return investigation as default for empty findings', () => {
    expect(mapFindingsToModules([])).toEqual(['investigation']);
  });

  it('should detect investigation keywords', () => {
    const findings = [
      { finding_type: 'other', title: '根本原因分析不充分', description: '' },
    ];
    expect(mapFindingsToModules(findings)).toContain('investigation');
  });

  it('should detect conclusion keywords', () => {
    const findings = [
      { finding_type: 'other', title: '结论逻辑不清晰', description: '' },
    ];
    const modules = mapFindingsToModules(findings);
    expect(modules).toContain('conclusion');
  });

  it('should detect riskAssessment keywords', () => {
    const findings = [
      { finding_type: 'other', title: '风险评分不合理', description: '' },
    ];
    const modules = mapFindingsToModules(findings);
    expect(modules).toContain('riskAssessment');
  });

  it('should detect English keywords', () => {
    const findings = [
      { finding_type: 'other', title: 'Root cause investigation incomplete', description: 'background description' },
    ];
    const modules = mapFindingsToModules(findings);
    expect(modules).toContain('investigation');
    expect(modules).toContain('background');
  });

  it('should handle logic_flaw finding type', () => {
    const findings = [
      { finding_type: 'logic_flaw', title: 'some issue', description: '' },
    ];
    const modules = mapFindingsToModules(findings);
    expect(modules).toContain('investigation');
    expect(modules).toContain('conclusion');
  });

  it('should handle 5M1E keyword', () => {
    const findings = [
      { finding_type: 'other', title: '5M1E分析不完整', description: '' },
    ];
    expect(mapFindingsToModules(findings)).toContain('investigation');
  });

  it('should handle prevention keyword', () => {
    const findings = [
      { finding_type: 'other', title: '预防措施不足', description: '' },
    ];
    expect(mapFindingsToModules(findings)).toContain('capa');
  });
});
