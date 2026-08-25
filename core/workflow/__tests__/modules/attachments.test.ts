/**
 * Tests for Attachments module generator.
 * 附件清单由 LLM 依据调查叙述生成；无调查内容或 LLM 失败时走确定性 fallback。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AttachmentsGenerator } from '../../modules/attachments';
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
    id: 'attachments',
    prompt: '基于调查内容生成附件清单',
    fields: [],
  })),
}));

// Mock LLM caller
vi.mock('../../../llm/caller', () => ({
  callLLMWithRetry: vi.fn(),
}));

describe('AttachmentsGenerator', () => {
  let generator: AttachmentsGenerator;

  const mockContext: ModuleContext = {
    deviationId: 'DEV-TEST-001',
    analysis: {
      summary: '测试偏差描述',
      keyEvents: ['事件1'],
      involvedParties: ['生产部'],
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
    regulations: [],
    findings: [],
  };

  const investigationContext: ModuleContext = {
    ...mockContext,
    previousResults: {
      investigation: {
        rootCause: {
          preliminaryAnalysis: '2026.02.27 开始再确认。',
          factors: {
            man: '验证人员缪一操作。',
            machine: '设备正常。',
            material: '不涉及。',
            method: '按 H3-VD-26321-RQ/09 版方案执行。',
            environment: '不涉及。',
            measurement: '探头 NBQ6 校准过期，校准报告详见调查报告-附件1。',
          },
          conclusion: '人为原因。',
        },
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    generator = new AttachmentsGenerator();
  });

  describe('generate', () => {
    it('should fall back deterministically when no investigation narrative', async () => {
      const result = await generator.generate(mockContext);

      expect(result.attachments).toEqual([
        { no: '1', name: '偏差调查报告', pages: '待补充' },
      ]);
      expect(result.versionHistory).toHaveLength(1);
      expect(result.versionHistory[0].version).toBe('00');
    });

it('should generate attachments from LLM aligned with narrative references', async () => {
      const { callLLMWithRetry } = await import('../../../llm/caller');
      vi.mocked(callLLMWithRetry).mockResolvedValue({
        object: {
          attachments: [
            { no: 'x', name: '验证探头校准报告', pages: '99页' },
            { no: 'y', name: '灭菌数据报告', pages: '3页' },
          ],
        },
      });

      const result = await generator.generate(investigationContext);

      // 正文只引用附件1（measurement 中「详见调查报告-附件1」）→ 未引用的附件2 被剔除
      expect(result.attachments).toEqual([
        { no: '1', name: '验证探头校准报告', pages: '待补充' },
      ]);
      expect(callLLMWithRetry).toHaveBeenCalled();
    });

    it('should fill missing referenced attachments and drop unreferenced ones', async () => {
      const { callLLMWithRetry } = await import('../../../llm/caller');
      // LLM 只输出附件1，但正文引用了附件1 和 附件2 → 补齐附件2
      const ctx: ModuleContext = {
        ...mockContext,
        previousResults: {
          investigation: {
            rootCause: {
              preliminaryAnalysis: '外壳检查正常。',
              factors: {
                man: '人员培训合格。',
                machine: '设备正常。',
                material: '不涉及。',
                method: '按方案执行。',
                environment: '不涉及。',
                measurement: '校准报告详见调查报告-附件1；供应商服务报告详见调查报告-附件2。',
              },
              conclusion: '密封失效。',
            },
          },
        },
      };
      vi.mocked(callLLMWithRetry).mockResolvedValue({
        object: {
          attachments: [{ no: '1', name: '验证探头校准报告', pages: '1页' }],
        },
      });

      const result = await generator.generate(ctx);

      expect(result.attachments).toEqual([
        { no: '1', name: '验证探头校准报告', pages: '待补充' },
        { no: '2', name: '偏差调查报告', pages: '待补充' },
      ]);
    });

    it('should fall back when LLM returns empty list', async () => {
      const { callLLMWithRetry } = await import('../../../llm/caller');
      vi.mocked(callLLMWithRetry).mockResolvedValue({ object: { attachments: [] } });

      const result = await generator.generate(investigationContext);

      expect(result.attachments).toEqual([
        { no: '1', name: '偏差调查报告', pages: '待补充' },
      ]);
    });

    it('should converge to one default attachment when narrative has no references (LLM 多列时收敛)', async () => {
      const { callLLMWithRetry } = await import('../../../llm/caller');
      vi.mocked(callLLMWithRetry).mockResolvedValue({
        object: {
          attachments: [
            { no: 'x', name: '仪器显示信息', pages: '99页' },
            { no: 'y', name: '灭菌数据报告', pages: '3页' },
          ],
        },
      });

      // 正文（preliminaryAnalysis/factors/conclusion）未引用任何「附件N」
      const ctx: ModuleContext = {
        ...mockContext,
        previousResults: {
          investigation: {
            rootCause: {
              preliminaryAnalysis: '检查探头外壳正常。',
              factors: { man: '人员培训合格。', machine: '设备正常。' },
              conclusion: '密封失效。',
            },
          },
        },
      };
      const result = await generator.generate(ctx);

      expect(result.attachments).toEqual([
        { no: '1', name: '仪器显示信息', pages: '待补充' },
      ]);
    });

it('should fall back with referenced attachment numbers when LLM fails', async () => {
      const { callLLMWithRetry } = await import('../../../llm/caller');
      vi.mocked(callLLMWithRetry).mockRejectedValue(new Error('llm down'));

      // 正文引用附件1 和 附件2 → fallback 列出两项
      const ctx: ModuleContext = {
        ...mockContext,
        previousResults: {
          investigation: {
            rootCause: {
              factors: {
                measurement: '校准报告详见调查报告-附件1；服务报告详见调查报告-附件2。',
              },
            },
          },
        },
      };
      const result = await generator.generate(ctx);

      expect(result.attachments).toEqual([
        { no: '1', name: '偏差调查报告', pages: '待补充' },
        { no: '2', name: '偏差调查报告', pages: '待补充' },
      ]);
    });

    it('should generate version history aligned with factory template', async () => {
      const result = await generator.generate(mockContext);

      expect(result.versionHistory).toHaveLength(1);
      expect(result.versionHistory[0].version).toBe('00');
      expect(result.versionHistory[0].revisionReason).toBe('新订');
      expect(result.versionHistory[0].executionDate).toBe('见首页');
    });
  });

  describe('generateFallback', () => {
    it('should return deterministic default output', async () => {
      const result = await generator.generateFallback(mockContext);

      expect(result.attachments).toEqual([
        { no: '1', name: '偏差调查报告', pages: '待补充' },
      ]);
      expect(result.versionHistory).toHaveLength(1);
    });
  });

  describe('getModuleId', () => {
    it('should return attachments', () => {
      expect(generator.getModuleId()).toBe('attachments');
    });
  });
});
