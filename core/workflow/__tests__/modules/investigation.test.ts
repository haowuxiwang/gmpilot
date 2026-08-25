/**
 * Tests for Investigation module generator.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvestigationGenerator } from '../../modules/investigation';
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
    id: 'investigation-root-cause',
    prompt: 'Generate investigation for {deviationId}',
    fields: [],
  })),
}));

// Mock LLM caller
vi.mock('../../../llm/caller', () => ({
  callLLMWithRetry: vi.fn(),
}));

describe('InvestigationGenerator', () => {
  let generator: InvestigationGenerator;

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
    generator = new InvestigationGenerator();
  });

  describe('generate', () => {
    it('should throw when template not found', async () => {
      const { getTemplate } = await import('../../../template');
      vi.mocked(getTemplate).mockReturnValueOnce(null);

      await expect(generator.generate(mockContext)).rejects.toThrow('Investigation template not found');
    });

    it('should call LLM to generate investigation', async () => {
      const { callLLMWithRetry } = await import('../../../llm/caller');
      vi.mocked(callLLMWithRetry).mockResolvedValueOnce({
        object: {
          rootCause: {
            factors: {
              man: '人员因素调查',
              machine: '设备因素调查',
              material: '物料因素调查',
              method: '方法因素调查',
              environment: '环境因素调查',
              measurement: '测量因素调查',
            },
            methods: { flowchart: false, fishbone: true, brainstorm: false, photos: [] },
            conclusion: '根本原因结论',
          },
          repeatDeviations: {
            records: [],
            analysis: '重复偏差分析',
            conclusion: '重复偏差结论',
          },
          otherProducts: {
            records: [],
            analysis: '影响分析',
            conclusion: '影响结论',
          },
        },
      });

      const result = await generator.generate(mockContext);

      expect(result).toHaveProperty('rootCause');
      expect(result).toHaveProperty('repeatDeviations');
      expect(result).toHaveProperty('otherProducts');
      expect(result.rootCause.factors).toHaveProperty('man');
      expect(result.rootCause.factors).toHaveProperty('measurement');
      expect(result.rootCause).toHaveProperty('conclusion');
    });
  });

  describe('generateFallback', () => {
    it('should generate placeholder investigation', async () => {
      const result = await generator.generateFallback(mockContext);

      expect(result.rootCause.factors).toHaveProperty('man', '待补充');
      expect(result.rootCause.factors).toHaveProperty('machine', '待补充');
      expect(result.rootCause.factors).toHaveProperty('measurement', '待补充');
      expect(result.rootCause).toHaveProperty('conclusion');
      expect(result.repeatDeviations.records).toEqual([]);
      expect(result.otherProducts.records).toEqual([]);
    });

    it('should include factor text in conclusion', async () => {
      const result = await generator.generateFallback(mockContext);

      expect(result.rootCause.conclusion).toContain('人员操作不当');
      expect(result.rootCause.conclusion).toContain('设备故障');
    });

    it('should handle empty factors', async () => {
      const contextEmptyFactors = {
        ...mockContext,
        factors: {
          man: [],
          machine: [],
          material: [],
          method: [],
          measurement: [],
          environment: [],
        },
      };

      const result = await generator.generateFallback(contextEmptyFactors);

      expect(result.rootCause.conclusion).toContain('待补充');
    });

    it('should set default methods', async () => {
      const result = await generator.generateFallback(mockContext);

      expect(result.rootCause.methods.flowchart).toBe(false);
      expect(result.rootCause.methods.fishbone).toBe(true);
      expect(result.rootCause.methods.brainstorm).toBe(false);
      expect(result.rootCause.methods.photos).toEqual([]);
    });

    it('should set all six factor fields', async () => {
      const result = await generator.generateFallback(mockContext);

      expect(result.rootCause.factors).toHaveProperty('man', '待补充');
      expect(result.rootCause.factors).toHaveProperty('machine', '待补充');
      expect(result.rootCause.factors).toHaveProperty('material', '待补充');
      expect(result.rootCause.factors).toHaveProperty('method', '待补充');
      expect(result.rootCause.factors).toHaveProperty('environment', '待补充');
      expect(result.rootCause.factors).toHaveProperty('measurement', '待补充');
    });
  });

  describe('getModuleId', () => {
    it('should return investigation-root-cause', () => {
      expect(generator.getModuleId()).toBe('investigation-root-cause');
    });
  });
});
