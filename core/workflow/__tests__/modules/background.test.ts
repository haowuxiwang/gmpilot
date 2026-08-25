/**
 * Tests for Background module generator.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BackgroundGenerator } from '../../modules/background';
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
    id: 'background',
    prompt: 'Generate background for {deviationId}',
    fields: [],
  })),
}));

// Mock LLM caller
vi.mock('../../../llm/caller', () => ({
  callLLMWithRetry: vi.fn(),
}));

describe('BackgroundGenerator', () => {
  let generator: BackgroundGenerator;

  const mockContext: ModuleContext = {
    deviationId: 'DEV-TEST-001',
    analysis: {
      summary: '3号生产线生产的注射用头孢曲松钠含量测定结果低于标准下限',
      keyEvents: [
        '产品：注射用头孢曲松钠，批号：C20240115，',
        '发生时间：2024-01-15 10:30',
        '地点：3号生产线车间，涉及人员3人',
      ],
      involvedParties: ['生产部', '质量部'],
      documentType: 'deviation_analysis',
    },
    factors: {
      man: ['操作人员培训不足'],
      machine: ['压片机压力不稳定'],
      material: ['原料纯度不足'],
      method: ['SOP未明确关键参数'],
      measurement: [],
      environment: ['温湿度控制正常'],
    },
    regulations: [],
    findings: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    generator = new BackgroundGenerator();
  });

  describe('generate', () => {
    it('should extract product from keyEvents', async () => {
      const result = await generator.generate(mockContext);

      expect(result.product).toBe('注射用头孢曲松钠');
    });

    it('should extract batch from keyEvents', async () => {
      const result = await generator.generate(mockContext);

      expect(result.batch).toBe('C20240115');
    });

    it('should extract time from keyEvents', async () => {
      const result = await generator.generate(mockContext);

      expect(result.occurrenceTime).toContain('2024-01-15');
    });

    it('should extract location from keyEvents', async () => {
      const result = await generator.generate(mockContext);

      expect(result.location).toBe('3号生产线车间');
    });

    it('should use analysis summary as description', async () => {
      const result = await generator.generate(mockContext);

      expect(result.description).toBe(mockContext.analysis.summary);
    });

    it('should fallback to LLM when product cannot be extracted', async () => {
      const contextNoProduct = {
        ...mockContext,
        analysis: {
          ...mockContext.analysis,
          keyEvents: ['Some event without product info'],
        },
        factors: {
          ...mockContext.factors,
          material: [],
        },
      };

      const { callLLMWithRetry } = await import('../../../llm/caller');
      vi.mocked(callLLMWithRetry).mockResolvedValue({
        object: {
          product: '未知产品',
          batch: '未知批次',
          occurrenceTime: '2024-01-15',
          location: '未知地点',
          description: '偏差描述',
          photos: [],
        },
      });

      const result = await generator.generate(contextNoProduct);

      expect(result.product).toBe('未知产品');
    });
  });

  describe('generateFallback', () => {
    it('should generate background from analysis', async () => {
      const result = await generator.generateFallback(mockContext);

      expect(result.product).toBe('注射用头孢曲松钠');
      expect(result.batch).toBe('C20240115');
      expect(result.location).toBe('3号生产线车间');
    });

    it('should use placeholder when extraction fails', async () => {
      const contextMinimal = {
        ...mockContext,
        analysis: {
          summary: '偏差描述',
          keyEvents: [],
          involvedParties: [],
          documentType: 'deviation_analysis' as const,
        },
        factors: {
          man: [],
          machine: [],
          material: [],
          method: [],
          measurement: [],
          environment: [],
        },
      };

      const result = await generator.generateFallback(contextMinimal);

      expect(result.product).toBe('待补充');
      expect(result.batch).toBe('待补充');
      expect(result.location).toBe('待补充');
    });

    it('should use material factor as product fallback', async () => {
      const contextNoKeyEventProduct = {
        ...mockContext,
        analysis: {
          ...mockContext.analysis,
          keyEvents: ['Some event without product'],
        },
      };

      const result = await generator.generateFallback(contextNoKeyEventProduct);

      expect(result.product).toBe('原料纯度不足');
    });

    it('should always return empty photos array', async () => {
      const result = await generator.generateFallback(mockContext);

      expect(result.photos).toEqual([]);
    });

    it('should use current date as time fallback', async () => {
      const contextNoTime = {
        ...mockContext,
        analysis: {
          ...mockContext.analysis,
          keyEvents: ['No time info'],
        },
      };

      const result = await generator.generateFallback(contextNoTime);

      const today = new Date().toISOString().slice(0, 16);
      expect(result.occurrenceTime).toBe(today);
    });
  });

  describe('getModuleId', () => {
    it('should return background', () => {
      expect(generator.getModuleId()).toBe('background');
    });
  });
});
