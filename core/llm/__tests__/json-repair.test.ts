import { describe, it, expect } from 'vitest';
import { repairTruncatedJson, parseJsonWithRepair } from '../json-repair';

describe('repairTruncatedJson', () => {
  it('should parse valid JSON unchanged', () => {
    expect(repairTruncatedJson('{"a":1}')).toBe('{"a":1}');
  });

  it('should close truncated object', () => {
    const repaired = repairTruncatedJson('{"title":"偏差报告","risk":80');
    expect(repaired).not.toBeNull();
    expect(JSON.parse(repaired!)).toEqual({ title: '偏差报告', risk: 80 });
  });

  it('should close truncated nested arrays and objects', () => {
    const repaired = repairTruncatedJson('{"items":[{"name":"a"},{"name":"b"');
    const parsed = JSON.parse(repaired!);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[1].name).toBe('b');
  });

  it('should close unterminated string', () => {
    const repaired = repairTruncatedJson('{"desc":"调查发现设备参数异常');
    const parsed = JSON.parse(repaired!);
    expect((parsed as { desc: string }).desc).toContain('设备参数异常');
  });

  it('should drop trailing comma before closing', () => {
    const repaired = repairTruncatedJson('{"a":[1,2,');
    const parsed = JSON.parse(repaired!);
    expect(parsed.a).toEqual([1, 2]);
  });

  it('should return null for semantic corruption', () => {
    // 非截断类损坏：键名缺失等无法修复
    expect(repairTruncatedJson('{invalid')).toBeNull();
  });

  it('parseJsonWithRepair should fall back to repair then throw', () => {
    expect(parseJsonWithRepair('{"x":1}', 't')).toEqual({ x: 1 });
    expect(parseJsonWithRepair('{"x":[1,', 't')).toEqual({ x: [1] });
    expect(() => parseJsonWithRepair('{oops', 'ctx')).toThrow(/无法解析/);
  });
});
