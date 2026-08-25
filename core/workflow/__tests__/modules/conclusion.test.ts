/**
 * Tests for Conclusion module generator.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConclusionGenerator } from '../../modules/conclusion';
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
    id: 'conclusion',
    prompt: 'Generate conclusion for {deviationId}',
    fields: [],
  })),
}));

// Mock LLM caller
vi.mock('../../../llm/caller', () => ({
  callLLMWithRetry: vi.fn(),
}));

describe('ConclusionGenerator', () => {
  let generator: ConclusionGenerator;

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
    generator = new ConclusionGenerator();
  });

  describe('generate', () => {
    it('should call LLM with investigation context and use its output', async () => {
      const { callLLMWithRetry } = await import('../../../llm/caller');
      vi.mocked(callLLMWithRetry).mockResolvedValue({
        object: {
          rootCause: '设备老化导致故障',
          mostLikelyCause: undefined,
        },
      });

      const contextWithInvestigation = {
        ...mockContext,
        previousResults: {
          investigation: {
            rootCause: {
              conclusion: '设备老化导致故障',
            },
          },
        },
      };

      const result = await generator.generate(contextWithInvestigation);

      expect(callLLMWithRetry).toHaveBeenCalled();
      expect(result.rootCause).toBe('设备老化导致故障');
      expect(result.mostLikelyCause).toBeUndefined();
    });

    it('should fall back to LLM when no investigation results', async () => {
      const { callLLMWithRetry } = await import('../../../llm/caller');
      vi.mocked(callLLMWithRetry).mockResolvedValue({
        object: {
          rootCause: '原料质量问题',
          mostLikelyCause: '供应商管理不足',
        },
      });

      const result = await generator.generate(mockContext);

      expect(result.rootCause).toBe('原料质量问题');
      expect(result.mostLikelyCause).toBe('供应商管理不足');
    });
  });

  describe('generateFallback', () => {
    it('should use investigation rootCause when available', async () => {
      const contextWithInvestigation = {
        ...mockContext,
        previousResults: {
          investigation: {
            rootCause: {
              conclusion: '设备老化导致故障',
            },
          },
        },
      };

      const result = await generator.generateFallback(contextWithInvestigation);

      expect(result.rootCause).toBe('设备老化导致故障');
      expect(result.mostLikelyCause).toBeUndefined();
    });

    it('should generate placeholder when no investigation results', async () => {
      const result = await generator.generateFallback(mockContext);

      expect(result.rootCause).toBe('待补充');
      expect(result.mostLikelyCause).toContain('可能与以下因素相关');
    });

    it('should include factor text in mostLikelyCause', async () => {
      const result = await generator.generateFallback(mockContext);

      expect(result.mostLikelyCause).toContain('人员操作不当');
      expect(result.mostLikelyCause).toContain('设备故障');
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

      expect(result.mostLikelyCause).toContain('待补充');
    });
  });

  describe('getModuleId', () => {
    it('should return conclusion', () => {
      expect(generator.getModuleId()).toBe('conclusion');
    });
  });
});
