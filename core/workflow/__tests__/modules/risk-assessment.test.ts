/**
 * Tests for Risk Assessment module generator.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RiskAssessmentGenerator } from '../../modules/risk-assessment';
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
    id: 'risk-assessment',
    prompt: 'Generate risk assessment for {deviationId}',
    fields: [],
  })),
}));

// Mock LLM caller
vi.mock('../../../llm/caller', () => ({
  callLLMWithRetry: vi.fn(),
}));

describe('RiskAssessmentGenerator', () => {
  let generator: RiskAssessmentGenerator;

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
    generator = new RiskAssessmentGenerator();
  });

  describe('generate', () => {
    it('should call LLM to generate risk assessment', async () => {
      const { callLLMWithRetry } = await import('../../../llm/caller');
      vi.mocked(callLLMWithRetry).mockResolvedValue({
        object: {
          description: '本次验证为灭菌柜再确认，验证探头过期并不影响灭菌柜自身性能。探头校准后数据稳定，验证结果有效。',
          summary: '小结：1）对产品质量无影响；2）对验证有效性无影响。',
        },
      });

      const result = await generator.generate(mockContext);

      expect(result).toHaveProperty('description');
      expect(result.description).toContain('灭菌柜再确认');
    });

    it('should enrich context with conclusion rootCause', async () => {
      const { callLLMWithRetry } = await import('../../../llm/caller');
      vi.mocked(callLLMWithRetry).mockResolvedValue({
        object: {
          description: '评估描述',
          summary: '小结：1）无影响。',
        },
      });

      const contextWithConclusion = {
        ...mockContext,
        previousResults: {
          conclusion: {
            rootCause: '设备老化导致故障',
          },
        },
      };

      await generator.generate(contextWithConclusion);

      // Verify callLLMWithRetry was called (LLM was invoked)
      expect(callLLMWithRetry).toHaveBeenCalled();
    });
  });

  describe('generateFallback', () => {
    it('should generate placeholder risk assessment', async () => {
      const result = await generator.generateFallback(mockContext);

      expect(result.description).toContain('潜在影响');
      expect(result.summary).toContain('小结');
    });

    it('should include rootCause in description when available', async () => {
      const contextWithConclusion = {
        ...mockContext,
        previousResults: {
          conclusion: {
            rootCause: '设备老化导致故障',
          },
        },
      };

      const result = await generator.generateFallback(contextWithConclusion);

      expect(result.description).toContain('设备老化导致故障');
    });

    it('should use default rootCause when not available', async () => {
      const result = await generator.generateFallback(mockContext);

      expect(result.description).toContain('待补充');
    });
  });

  describe('getModuleId', () => {
    it('should return risk-assessment', () => {
      expect(generator.getModuleId()).toBe('risk-assessment');
    });
  });
});
