import { describe, it, expect, beforeEach } from 'vitest';
import { fillPrompt, clearPromptCache } from '../loader';

describe('fillPrompt', () => {
  beforeEach(() => {
    clearPromptCache();
  });

  it('should load and fill clue-analysis prompt', () => {
    const result = fillPrompt('clue-analysis', { clue_text: '设备温度异常' });
    expect(result).toContain('设备温度异常');
    expect(result).toContain('GMP');
    expect(result).toContain('JSON');
  });

  it('should load and fill factor-identify prompt', () => {
    const result = fillPrompt('factor-identify', {
      clue_text: '测试线索',
      analysis_json: '{"summary":"测试"}',
    });
    expect(result).toContain('5M1E');
    expect(result).toContain('人机料法环');
    expect(result).toContain('测试线索');
  });

  it('should load and fill regulation-match prompt', () => {
    const result = fillPrompt('regulation-match', {
      clue_text: '测试',
      factors_json: '{}',
      regulation_context: '',
    });
    expect(result).toContain('法规');
    expect(result).toContain('JSON');
  });

  it('should load and fill report-generate prompt', () => {
    const result = fillPrompt('report-generate', {
      deviation_id: 'DEV-001',
      summary: '偏差概述',
      factors_json: '{}',
      regulations_json: '[]',
      findings_json: '[]',
    });
    expect(result).toContain('DEV-001');
    expect(result).toContain('偏差概述');
    expect(result).toContain('Markdown');
  });

  it('should cache prompt templates', () => {
    const result1 = fillPrompt('clue-analysis', { clue_text: 'A' });
    const result2 = fillPrompt('clue-analysis', { clue_text: 'B' });
    expect(result1).toContain('A');
    expect(result2).toContain('B');
  });

  it('should handle missing template gracefully', () => {
    expect(() => fillPrompt('nonexistent', {})).toThrow();
  });
});
