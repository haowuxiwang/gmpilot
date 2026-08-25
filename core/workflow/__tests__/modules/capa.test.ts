/**
 * Tests for CAPA module generator.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CAPAGenerator } from '../../modules/capa';
import type { ModuleContext } from '../../modules/base';

// Mock logger
vi.mock('../../../utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock template
vi.mock('../../../template', () => ({
  getTemplate: vi.fn(() => ({
    id: 'capa',
    prompt: 'Generate CAPA for {deviationId}',
    fields: [],
  })),
}));

// Mock LLM caller
vi.mock('../../../llm/caller', () => ({
  callLLMWithRetry: vi.fn(),
}));

describe('CAPAGenerator', () => {
  let generator: CAPAGenerator;

  const mockContext: ModuleContext = {
    deviationId: 'DEV-TEST-001',
    analysis: {
      summary: '测试偏差描述',
      keyEvents: ['事件1'],
      involvedParties: ['生产部'],
      documentType: 'deviation_analysis',
    },
    factors: {
      man: ['人员操作不当'],
      machine: ['设备故障'],
      material: ['原料不合格'],
      method: ['SOP不清晰'],
      measurement: [],
      environment: ['温湿度异常'],
    },
    regulations: [],
    findings: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    generator = new CAPAGenerator();
  });

  describe('generate', () => {
    it('should call LLM to generate CAPA', async () => {
      const { callLLMWithRetry } = await import('../../../llm/caller');
      vi.mocked(callLLMWithRetry).mockResolvedValue({
        object: {
          corrections: [
            {
              capaNo: 'C-001',
              content: '修复设备',
              executor: '张三',
              expectedDate: '2026-01-15',
              signatureDate: '',
            },
          ],
          preventions: [
            {
              capaNo: 'P-001',
              content: '加强培训',
              executor: '李四',
              expectedDate: '2026-01-20',
              signatureDate: '',
            },
          ],
        },
      });

      const result = await generator.generate(mockContext);

      expect(result).toHaveProperty('corrections');
      expect(result).toHaveProperty('preventions');
      expect(result.corrections).toHaveLength(1);
      expect(result.preventions).toHaveLength(1);
    });

    it('should ensure CAPA numbers are present', async () => {
      const { callLLMWithRetry } = await import('../../../llm/caller');
      vi.mocked(callLLMWithRetry).mockResolvedValue({
        object: {
          corrections: [
            {
              capaNo: '',
              content: '修复设备',
              executor: '张三',
              expectedDate: '2026-01-15',
              signatureDate: '',
            },
          ],
          preventions: [],
        },
      });

      const result = await generator.generate(mockContext);

      // 工厂格式：CP-TZ-API-${deviationId}-${serial}
      expect(result.corrections[0].capaNo).toBe('CP-TZ-API-DEV-TEST-001-26001');
    });

    it('should preserve factory-format CAPA numbers from LLM', async () => {
      const { callLLMWithRetry } = await import('../../../llm/caller');
      vi.mocked(callLLMWithRetry).mockResolvedValue({
        object: {
          corrections: [
            {
              capaNo: 'CP-TZ-API-DEV-TEST-001-26001',
              content: '修复设备',
              executor: '张三',
              expectedDate: '2026-01-15',
              signatureDate: '',
            },
          ],
          preventions: [
            {
              capaNo: 'CP-TZ-API-DEV-TEST-001-26002',
              content: '加强培训',
              executor: '李四',
              expectedDate: '2026-01-20',
              signatureDate: '',
            },
          ],
        },
      });

      const result = await generator.generate(mockContext);

      expect(result.corrections[0].capaNo).toBe('CP-TZ-API-DEV-TEST-001-26001');
      expect(result.preventions[0].capaNo).toBe('CP-TZ-API-DEV-TEST-001-26002');
    });

    it('should continue serial numbering for preventions after corrections', async () => {
      const { callLLMWithRetry } = await import('../../../llm/caller');
      vi.mocked(callLLMWithRetry).mockResolvedValue({
        object: {
          corrections: [
            { capaNo: '', content: 'a', executor: 'x', expectedDate: '2026-01-01', signatureDate: '' },
            { capaNo: '', content: 'b', executor: 'x', expectedDate: '2026-01-01', signatureDate: '' },
          ],
          preventions: [
            { capaNo: '', content: 'c', executor: 'x', expectedDate: '2026-01-01', signatureDate: '' },
          ],
        },
      });

      const result = await generator.generate(mockContext);

      expect(result.corrections.map((c) => c.capaNo)).toEqual([
        'CP-TZ-API-DEV-TEST-001-26001',
        'CP-TZ-API-DEV-TEST-001-26002',
      ]);
      expect(result.preventions[0].capaNo).toBe('CP-TZ-API-DEV-TEST-001-26003');
    });

    it('should handle empty corrections/preventions', async () => {
      const { callLLMWithRetry } = await import('../../../llm/caller');
      vi.mocked(callLLMWithRetry).mockResolvedValue({
        object: {
          corrections: [],
          preventions: [],
        },
      });

      const result = await generator.generate(mockContext);

      expect(result.corrections).toEqual([]);
      expect(result.preventions).toEqual([]);
    });
  });

  describe('generateFallback', () => {
    it('should generate placeholder CAPA', async () => {
      const result = await generator.generateFallback(mockContext);

      expect(result.corrections).toHaveLength(1);
      expect(result.preventions).toHaveLength(1);
      expect(result.corrections[0].capaNo).toBe('CP-TZ-API-DEV-TEST-001-26001');
      expect(result.preventions[0].capaNo).toBe('CP-TZ-API-DEV-TEST-001-26002');
    });

    it('should include rootCause in correction content', async () => {
      const contextWithConclusion = {
        ...mockContext,
        previousResults: {
          conclusion: {
            rootCause: '设备老化导致故障',
          },
        },
      };

      const result = await generator.generateFallback(contextWithConclusion);

      expect(result.corrections[0].content).toContain('设备老化导致故障');
    });

    it('should use default rootCause when not available', async () => {
      const result = await generator.generateFallback(mockContext);

      expect(result.corrections[0].content).toContain('待补充');
    });

    it('should set default executor and dates', async () => {
      const result = await generator.generateFallback(mockContext);

      expect(result.corrections[0].executor).toBe('待补充');
      expect(result.corrections[0].expectedDate).toBe('待补充');
      expect(result.preventions[0].executor).toBe('待补充');
      expect(result.preventions[0].expectedDate).toBe('待补充');
    });
  });

  describe('getModuleId', () => {
    it('should return capa', () => {
      expect(generator.getModuleId()).toBe('capa');
    });
  });
});
