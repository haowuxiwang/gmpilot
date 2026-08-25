import { describe, it, expect } from 'vitest';
import { getSchemaDescription, generateSchemaDescription } from '../schema-to-prompt';

describe('schema-to-prompt', () => {
  it('should generate a non-empty description', () => {
    const desc = getSchemaDescription();
    expect(desc.length).toBeGreaterThan(100);
  });

  it('should wrap output in markdown code block', () => {
    const desc = getSchemaDescription();
    expect(desc).toMatch(/^```json\n/);
    expect(desc).toMatch(/\n```$/);
  });

  it('should contain all top-level report sections', () => {
    const desc = getSchemaDescription();
    expect(desc).toContain('"cover"');
    expect(desc).toContain('"background"');
    expect(desc).toContain('"investigation"');
    expect(desc).toContain('"conclusion"');
    expect(desc).toContain('"riskAssessment"');
    expect(desc).toContain('"capa"');
    expect(desc).toContain('"attachments"');
    expect(desc).toContain('"versionHistory"');
  });

  it('should contain Chinese comments for fields', () => {
    const desc = getSchemaDescription();
    expect(desc).toContain('// 封面');
    expect(desc).toContain('// 背景');
    expect(desc).toContain('// 偏差调查');
    expect(desc).toContain('// 根本原因调查');
  });

  it('should describe dynamic cover title', () => {
    const desc = getSchemaDescription();
    expect(desc).toContain('动态标题');
    expect(desc).toContain('偏差调查和风险评估报告');
  });

  it('should include nested structures', () => {
    const desc = getSchemaDescription();
    expect(desc).toContain('"preparedBy"');
    expect(desc).toContain('"repeatDeviations"');
    expect(desc).toContain('"otherProducts"');
    expect(desc).toContain('"corrections"');
    expect(desc).toContain('"preventions"');
  });

  it('should cache the result', () => {
    const desc1 = getSchemaDescription();
    const desc2 = getSchemaDescription();
    expect(desc1).toBe(desc2);
  });

  it('generateSchemaDescription should produce same output as getSchemaDescription', () => {
    const desc1 = generateSchemaDescription();
    const desc2 = getSchemaDescription();
    expect(desc1).toBe(desc2);
  });
});
