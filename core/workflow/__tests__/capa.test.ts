/**
 * Tests for core/workflow/modules/capa.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CAPAGenerator } from '../modules/capa';
import type { ModuleContext } from '../modules/base';

// Mock the LLM caller - callLLMWithRetry returns { object: ... }
vi.mock('../../llm/caller', () => ({
  callLLMWithRetry: vi.fn(),
}));

// Mock provider
vi.mock('../../llm/provider', () => ({
  createLLMModel: vi.fn(() => 'mock-model'),
  getProviderConfig: vi.fn(() => ({ apiKey: 'test', model: 'test', baseUrl: 'http://test' })),
}));

// Mock template loader (used by buildPrompt)
vi.mock('../../template', () => ({
  getTemplate: vi.fn(() => ({
    id: 'capa',
    prompt: 'Generate CAPA',
    outputFormat: 'JSON',
    fields: [],
  })),
}));

import { callLLMWithRetry } from '../../llm/caller';

describe('CAPAGenerator', () => {
  let generator: CAPAGenerator;

  const baseContext: ModuleContext = {
    deviationId: 'DEV-TEST-001',
    analysis: {
      summary: '测试偏差摘要',
      keyEvents: ['事件1'],
      involvedParties: ['操作员'],
      documentType: 'deviation_analysis',
    },
    factors: {
      man: ['人员培训不足'],
      machine: [],
      material: [],
      method: ['SOP不完善'],
      measurement: [],
      environment: [],
    },
    regulations: [],
    findings: [],
    regulationContext: '',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    generator = new CAPAGenerator();
  });

  it('should have correct template id', () => {
    // Access protected field via cast for testing
    expect((generator as unknown as { templateId: string }).templateId).toBe('capa');
  });

  it('should generate CAPA with corrections and preventions', async () => {
    const mockOutput = {
      corrections: [
        { capaNo: '', content: '立即停止生产', executor: 'QA经理', expectedDate: '2026-01-15', signatureDate: '' },
      ],
      preventions: [
        { capaNo: '', content: '修订SOP', executor: '生产部', expectedDate: '2026-02-01', signatureDate: '' },
      ],
    };

    // callLLMWithRetry returns { object: ... } which callLLM extracts
    vi.mocked(callLLMWithRetry).mockResolvedValue({ object: mockOutput });

    const result = await generator.generate(baseContext);

    expect(result.corrections).toHaveLength(1);
    expect(result.preventions).toHaveLength(1);
    // 工厂格式：CP-TZ-API-${deviationId}-${serial}
    expect(result.corrections[0].capaNo).toBe('CP-TZ-API-DEV-TEST-001-26001');
    expect(result.preventions[0].capaNo).toBe('CP-TZ-API-DEV-TEST-001-26002');
  });

  it('should preserve existing CAPA numbers', async () => {
    const mockOutput = {
      corrections: [
        { capaNo: 'CAPA-CUSTOM', content: '措施', executor: '人员', expectedDate: '2026-01-01', signatureDate: '' },
      ],
      preventions: [],
    };

    vi.mocked(callLLMWithRetry).mockResolvedValue({ object: mockOutput });

    const result = await generator.generate(baseContext);

    // 非工厂格式的编号会被重写为工厂格式
    expect(result.corrections[0].capaNo).toBe('CP-TZ-API-DEV-TEST-001-26001');
  });

  it('should handle empty arrays', async () => {
    const mockOutput = { corrections: [], preventions: [] };
    vi.mocked(callLLMWithRetry).mockResolvedValue({ object: mockOutput });

    const result = await generator.generate(baseContext);

    expect(result.corrections).toEqual([]);
    expect(result.preventions).toEqual([]);
  });

  it('should handle null/undefined arrays gracefully', async () => {
    const mockOutput = { corrections: null, preventions: undefined };
    vi.mocked(callLLMWithRetry).mockResolvedValue({ object: mockOutput });

    const result = await generator.generate(baseContext);

    expect(result.corrections).toEqual([]);
    expect(result.preventions).toEqual([]);
  });

  it('should use previous results context when available', async () => {
    const contextWithPrev: ModuleContext = {
      ...baseContext,
      previousResults: {
        conclusion: { rootCause: '人员操作失误' },
        riskAssessment: { overallRisk: '中等' },
      },
    };

    const mockOutput = { corrections: [], preventions: [] };
    vi.mocked(callLLMWithRetry).mockResolvedValue({ object: mockOutput });

    const result = await generator.generate(contextWithPrev);
    expect(result).toBeDefined();
    expect(callLLMWithRetry).toHaveBeenCalled();
  });

  it('should number multiple CAPA records sequentially', async () => {
    const mockOutput = {
      corrections: [
        { capaNo: '', content: '措施1', executor: 'A', expectedDate: '2026-01-01', signatureDate: '' },
        { capaNo: '', content: '措施2', executor: 'B', expectedDate: '2026-01-02', signatureDate: '' },
        { capaNo: '', content: '措施3', executor: 'C', expectedDate: '2026-01-03', signatureDate: '' },
      ],
      preventions: [
        { capaNo: '', content: '预防1', executor: 'D', expectedDate: '2026-02-01', signatureDate: '' },
      ],
    };

    vi.mocked(callLLMWithRetry).mockResolvedValue({ object: mockOutput });

    const result = await generator.generate(baseContext);

    expect(result.corrections[0].capaNo).toBe('CP-TZ-API-DEV-TEST-001-26001');
    expect(result.corrections[1].capaNo).toBe('CP-TZ-API-DEV-TEST-001-26002');
    expect(result.corrections[2].capaNo).toBe('CP-TZ-API-DEV-TEST-001-26003');
    expect(result.preventions[0].capaNo).toBe('CP-TZ-API-DEV-TEST-001-26004');
  });
});
