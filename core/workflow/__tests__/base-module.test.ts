/**
 * Tests for core/workflow/modules/base.ts
 * Covers: buildPrompt, callLLM, validateOutput, getModuleId
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseModuleGenerator, type ModuleContext } from '../modules/base';

// Mock template
vi.mock('../../template', () => ({
  getTemplate: vi.fn(() => ({
    id: 'test-module',
    prompt: 'Generate for {deviationId}: {analysis.summary}\nFactors: {factors}\nRegs: {regulations}\nFindings: {findings}',
    description: '测试模块描述',
    outputFormat: 'JSON',
    fields: [
      { name: 'title', required: true },
      { name: 'content', required: false },
    ],
  })),
}));

// Mock LLM caller
vi.mock('../../llm/caller', () => ({
  callLLMWithRetry: vi.fn(),
}));

// Mock provider
vi.mock('../../llm/provider', () => ({
  createLLMModel: vi.fn(() => 'mock-model'),
}));

// Mock AI SDK
vi.mock('ai', () => ({
  generateObject: vi.fn().mockResolvedValue({ object: { title: 'test' } }),
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Concrete subclass for testing
class TestModuleGenerator extends BaseModuleGenerator {
  constructor() {
    super('test-module');
  }

  async generate(context: ModuleContext): Promise<unknown> {
    const prompt = this.buildPrompt(context);
    return this.callLLM(prompt, { type: 'object' });
  }

  async generateFallback(_context: ModuleContext): Promise<unknown> {
    return { fallback: true };
  }

  // Expose protected methods for testing
  public testBuildPrompt(context: ModuleContext): string {
    return this.buildPrompt(context);
  }

  public testValidateOutput(output: Record<string, unknown>): boolean {
    return this.validateOutput(output);
  }

  public testGetTemplate() {
    return this.getTemplate();
  }
}

// Generator with no template
class NoTemplateGenerator extends BaseModuleGenerator {
  constructor() {
    super('nonexistent-template');
  }

  async generate(_context: ModuleContext): Promise<unknown> {
    const prompt = this.buildPrompt(_context);
    return this.callLLM(prompt, {});
  }

  async generateFallback(_context: ModuleContext): Promise<unknown> {
    return {};
  }
}

const makeContext = (): ModuleContext => ({
  deviationId: 'DEV-BASE-001',
  analysis: {
    summary: '测试偏差摘要',
    keyEvents: ['事件1'],
    involvedParties: ['QA'],
    documentType: 'deviation_analysis',
  },
  factors: { man: ['人员'], machine: [], material: [], method: [], environment: [], measurement: [] },
  regulations: [{ regulation: 'GMP', chapter: '1', article: '1', title: 't', content: 'c', relevance: 'r' }],
  findings: [{ finding_type: 'compliance_risk', severity: 'medium', title: 'f', description: 'd' }],
  regulationContext: '',
});

describe('BaseModuleGenerator', () => {
  let generator: TestModuleGenerator;

  beforeEach(() => {
    vi.clearAllMocks();
    generator = new TestModuleGenerator();
  });

  describe('getModuleId', () => {
    it('should return the template id', () => {
      expect(generator.getModuleId()).toBe('test-module');
    });
  });

  describe('buildPrompt', () => {
    it('should replace all placeholders', () => {
      const ctx = makeContext();
      const prompt = generator.testBuildPrompt(ctx);

      expect(prompt).toContain('DEV-BASE-001');
      expect(prompt).toContain('测试偏差摘要');
      expect(prompt).toContain('人员');
      expect(prompt).toContain('GMP');
      expect(prompt).toContain('compliance_risk');
    });

    it('should prepend description when template has one', () => {
      const ctx = makeContext();
      const prompt = generator.testBuildPrompt(ctx);
      expect(prompt).toContain('## 章节说明');
      expect(prompt).toContain('测试模块描述');
    });

    it('should append output format when template has one', () => {
      const ctx = makeContext();
      const prompt = generator.testBuildPrompt(ctx);
      expect(prompt).toContain('## 输出格式');
      expect(prompt).toContain('JSON');
    });

    it('should throw when template is not found', async () => {
      const { getTemplate } = await import('../../template');
      vi.mocked(getTemplate).mockReturnValueOnce(null as never);

      const noGen = new NoTemplateGenerator();
      await expect(noGen.generate(makeContext())).rejects.toThrow('Template not found');
    });
  });

  describe('callLLM', () => {
    it('should call callLLMWithRetry and return object', async () => {
      const { callLLMWithRetry } = await import('../../llm/caller');
      vi.mocked(callLLMWithRetry).mockResolvedValue({ object: { title: 'generated' } });

      const ctx = makeContext();
      const result = await generator.generate(ctx);

      expect(callLLMWithRetry).toHaveBeenCalled();
      expect(result).toEqual({ title: 'generated' });
    });

    it('should propagate errors from callLLMWithRetry', async () => {
      const { callLLMWithRetry } = await import('../../llm/caller');
      vi.mocked(callLLMWithRetry).mockRejectedValue(new Error('LLM generation failed'));

      const ctx = makeContext();
      await expect(generator.generate(ctx)).rejects.toThrow('LLM generation failed');
    });
  });

  describe('validateOutput', () => {
    it('should return true when all required fields present', () => {
      const result = generator.testValidateOutput({ title: 'test', content: 'body' });
      expect(result).toBe(true);
    });

    it('should return false when required field is missing', () => {
      const result = generator.testValidateOutput({ content: 'body' });
      expect(result).toBe(false);
    });

    it('should return true when template is null', async () => {
      const { getTemplate } = await import('../../template');
      vi.mocked(getTemplate).mockReturnValueOnce(null as never);

      const noGen = new NoTemplateGenerator();
      // Access validateOutput through prototype
      const result = (noGen as unknown as { validateOutput: (output: Record<string, unknown>) => boolean }).validateOutput({ anything: true });
      expect(result).toBe(true);
    });
  });
});
