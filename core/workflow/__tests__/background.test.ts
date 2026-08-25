/**
 * Tests for core/workflow/modules/background.ts
 * Covers: extraction logic, LLM fallback, edge cases.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BackgroundGenerator } from '../modules/background';
import type { ModuleContext } from '../modules/base';

// Mock the LLM caller
vi.mock('../../llm/caller', () => ({
  callLLMWithRetry: vi.fn(),
}));

// Mock provider
vi.mock('../../llm/provider', () => ({
  createLLMModel: vi.fn(() => 'mock-model'),
  getProviderConfig: vi.fn(() => ({ apiKey: 'test', model: 'test', baseUrl: 'http://test' })),
}));

// Mock template loader
vi.mock('../../template', () => ({
  getTemplate: vi.fn(() => ({
    id: 'background',
    prompt: 'Generate background for {deviationId}: {analysis.summary}',
    description: '背景描述',
    outputFormat: 'JSON',
    fields: [],
  })),
}));

import { callLLMWithRetry } from '../../llm/caller';

describe('BackgroundGenerator', () => {
  let generator: BackgroundGenerator;

  const makeContext = (overrides?: Partial<ModuleContext>): ModuleContext => ({
    deviationId: 'DEV-2026-001',
    analysis: {
      summary: '某产品灌装过程中发现装量偏差超标',
      keyEvents: [
        '产品：阿莫西林胶囊, 批号：B20260101, 发生地点：灌装车间, 时间：2026-01-15 14:30',
      ],
      involvedParties: ['操作员张三'],
      documentType: 'deviation_analysis',
    },
    factors: {
      man: ['操作不规范'],
      machine: ['灌装机校准偏移'],
      material: ['阿莫西林胶囊'],
      method: [],
      measurement: [],
      environment: [],
    },
    regulations: [],
    findings: [],
    regulationContext: '',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    generator = new BackgroundGenerator();
  });

  it('should have correct module id', () => {
    expect(generator.getModuleId()).toBe('background');
  });

  it('should extract background from analysis when product found in keyEvents', async () => {
    const ctx = makeContext();
    const result = await generator.generate(ctx);

    expect(result.product).toBe('阿莫西林胶囊');
    expect(result.batch).toBe('B20260101');
    expect(result.location).toBe('灌装车间');
    expect(result.occurrenceTime).toBe('2026-01-15 14:30');
    expect(result.description).toBe(ctx.analysis.summary);
    expect(result.photos).toEqual([]);
    // Should NOT call LLM when extraction succeeds
    expect(callLLMWithRetry).not.toHaveBeenCalled();
  });

  it('should extract product from material factors when not in keyEvents', async () => {
    const ctx = makeContext({
      analysis: {
        summary: '偏差事件',
        keyEvents: ['发现异常'],
        involvedParties: [],
        documentType: 'deviation_analysis',
      },
    });

    const result = await generator.generate(ctx);
    // Falls back to factors.material[0]
    expect(result.product).toBe('阿莫西林胶囊');
    expect(result.batch).toBe('待补充');
    expect(result.location).toBe('待补充');
  });

  it('should fall back to LLM when no product can be extracted', async () => {
    const mockLLMResult = {
      object: {
        product: 'LLM产品',
        batch: 'LLM批次',
        occurrenceTime: '2026-01-01 08:00',
        location: 'LLM地点',
        description: 'LLM描述',
        photos: [],
      },
    };
    (callLLMWithRetry as ReturnType<typeof vi.fn>).mockResolvedValue(mockLLMResult);

    const ctx = makeContext({
      analysis: {
        summary: '无法提取的摘要',
        keyEvents: ['没有产品信息'],
        involvedParties: [],
        documentType: 'deviation_analysis',
      },
      factors: {
        man: [],
        machine: [],
        material: [],
        method: [],
        measurement: [],
        environment: [],
      },
    });

    const result = await generator.generate(ctx);
    expect(callLLMWithRetry).toHaveBeenCalled();
    expect(result.product).toBe('LLM产品');
    expect(result.batch).toBe('LLM批次');
  });

  it('should extract batch with 批次 format', async () => {
    const ctx = makeContext({
      analysis: {
        summary: '偏差',
        keyEvents: ['产品：测试品, 批次：PC20260202, 发生地点：实验室'],
        involvedParties: [],
        documentType: 'deviation_analysis',
      },
    });

    const result = await generator.generate(ctx);
    expect(result.product).toBe('测试品');
    expect(result.batch).toBe('PC20260202');
  });

  it('should extract time with slash date format', async () => {
    const ctx = makeContext({
      analysis: {
        summary: '偏差',
        keyEvents: ['产品：X, 2026/03/20 09:15 发生异常'],
        involvedParties: [],
        documentType: 'deviation_analysis',
      },
    });

    const result = await generator.generate(ctx);
    expect(result.occurrenceTime).toBe('2026-03-20 09:15');
  });

  it('should use current time when no time found', async () => {
    const ctx = makeContext({
      analysis: {
        summary: '偏差',
        keyEvents: ['产品：Y, 无时间信息'],
        involvedParties: [],
        documentType: 'deviation_analysis',
      },
    });

    const result = await generator.generate(ctx);
    // Should be a valid ISO-ish timestamp
    expect(result.occurrenceTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('should propagate LLM errors', async () => {
    (callLLMWithRetry as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('LLM failed'));

    const ctx = makeContext({
      analysis: {
        summary: '无法提取',
        keyEvents: ['无产品'],
        involvedParties: [],
        documentType: 'deviation_analysis',
      },
      factors: { man: [], machine: [], material: [], method: [], environment: [], measurement: [] },
    });

    await expect(generator.generate(ctx)).rejects.toThrow('LLM failed');
  });
});
