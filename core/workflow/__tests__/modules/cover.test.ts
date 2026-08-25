/**
 * Tests for Cover module generator.
 * 标题为 LLM 动态生成，测试覆盖 LLM 成功路径与失败 fallback 路径。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CoverGenerator } from '../../modules/cover';
import type { ModuleContext } from '../../modules/base';
import { callLLMWithRetry } from '../../../llm/caller';

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
    id: 'cover',
    prompt: 'Generate cover for {deviationId}',
    fields: [],
  })),
}));

// Mock LLM caller
vi.mock('../../../llm/caller', () => ({
  callLLMWithRetry: vi.fn(),
}));

const mockLlmResponse = {
  title: 'RT探头（编号：NBQ6）偏差调查和风险评估报告',
  titleEn: 'Deviation Investigation and Risk Assessment Report for RT探头（编号：NBQ6）',
  department: '生产部',
  preparedBy: { department: '生产部', name: '张三' },
  reviewedBy: { department: '质量部', name: '李四' },
};

describe('CoverGenerator', () => {
  let generator: CoverGenerator;

  const mockContext: ModuleContext = {
    deviationId: 'DEV-TEST-001',
    analysis: {
      summary: 'RT探头（编号：NBQ6）显示温度异常',
      keyEvents: ['事件1', '事件2'],
      involvedParties: ['生产部', '质量部'],
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
    generator = new CoverGenerator();
  });

  describe('generate', () => {
    it('should generate cover with correct structure', async () => {
      vi.mocked(callLLMWithRetry).mockResolvedValue({ object: mockLlmResponse } as never);

      const result = await generator.generate(mockContext);

      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('titleEn');
      expect(result).toHaveProperty('department');
      expect(result).toHaveProperty('preparedBy');
      expect(result).toHaveProperty('reviewedBy');
    });

    it('should use LLM-generated dynamic title', async () => {
      vi.mocked(callLLMWithRetry).mockResolvedValue({ object: mockLlmResponse } as never);

      const result = await generator.generate(mockContext);

expect(result.title).toBe('RT探头（编号：NBQ6）偏差调查和风险评估报告');
      expect(result.titleEn).toBe('Deviation Investigation and Risk Assessment Report for Validation Probe (No.NBQ6)');
    });

    it('should use fallback title when summary is empty', async () => {
      vi.mocked(callLLMWithRetry).mockRejectedValue(new Error('LLM failed'));

      const contextNoSummary = {
        ...mockContext,
        analysis: {
          ...mockContext.analysis,
          summary: '',
        },
      };

      const result = await generator.generate(contextNoSummary);

      expect(result.title).toBe('偏差调查和风险评估报告');
      expect(result.titleEn).toBe('Deviation Investigation and Risk Assessment Report');
    });

    it('should extract department from LLM response', async () => {
      vi.mocked(callLLMWithRetry).mockResolvedValue({ object: mockLlmResponse } as never);

      const result = await generator.generate(mockContext);

      expect(result.department).toBe('生产部');
    });

    it('should fall back to placeholder when LLM fails', async () => {
      vi.mocked(callLLMWithRetry).mockRejectedValue(new Error('LLM failed'));

      const result = await generator.generate(mockContext);

      expect(result.department).toBe('待补充');
    });

    it('should extract title from summary in fallback', async () => {
      vi.mocked(callLLMWithRetry).mockRejectedValue(new Error('LLM failed'));

      const result = await generator.generate(mockContext);

      expect(result.title).toBe('RT探头（编号：NBQ6）偏差调查和风险评估报告');
    });

    it('should have empty signature fields', async () => {
      vi.mocked(callLLMWithRetry).mockResolvedValue({ object: mockLlmResponse } as never);

      const result = await generator.generate(mockContext);

      expect(result.preparedBy.name).toBe('张三');
      expect(result.preparedBy.signatureDate).toBe('');
      expect(result.reviewedBy.name).toBe('李四');
      expect(result.reviewedBy.signatureDate).toBe('');
    });
  });

  describe('generateFallback', () => {
    it('should return same output as generate when LLM fails', async () => {
      vi.mocked(callLLMWithRetry).mockRejectedValue(new Error('LLM failed'));

      const generateResult = await generator.generate(mockContext);
      const fallbackResult = await generator.generateFallback(mockContext);

      expect(fallbackResult).toEqual(generateResult);
    });
  });

  describe('getModuleId', () => {
    it('should return cover', () => {
      expect(generator.getModuleId()).toBe('cover');
    });
  });
});
