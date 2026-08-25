import { describe, it, expect } from 'vitest';
import { parseTemplate } from '../parser';

describe('Template Parser', () => {
  it('should parse a simple template', () => {
    const content = `# 背景 Background

## 章节说明

本章节描述偏差的基本信息。

## 可变字段

| 字段 | 中文 | 英文 | 类型 | 说明 |
|------|------|------|------|------|
| product | 涉及产品 | Product | 文本 | 产品名称 |
| batch | 批次号 | Batch No. | 文本 | 批次号 |

## 生成提示

从用户输入的线索中提取以下信息。

## 输出格式

\`\`\`json
{
  "product": "产品名称",
  "batch": "批次号"
}
\`\`\``;

    const result = parseTemplate('/test/background.md', content);

    expect(result).toBeDefined();
    expect(result.id).toBe('background');
    expect(result.title).toBe('背景');
    expect(result.titleEn).toBe('Background');
    expect(result.fields).toHaveLength(2);
    expect(result.fields[0].name).toBe('product');
    expect(result.fields[0].label).toBe('涉及产品');
    expect(result.fields[0].labelEn).toBe('Product');
    expect(result.fields[0].type).toBe('text');
    expect(result.prompt).toContain('从用户输入的线索中提取以下信息');
    expect(result.outputFormat).toContain('"product": "产品名称"');
  });

  it('should parse fields with different types', () => {
    const content = `# 测试 Template

## 可变字段

| 字段 | 中文 | 英文 | 类型 | 说明 |
|------|------|------|------|------|
| text | 文本字段 | Text Field | 文本 | 普通文本 |
| long | 长文本 | Long Text | 长文本 | 长文本字段 |
| date | 日期 | Date | 日期 | 日期字段 |
| array | 数组 | Array | 数组 | 数组字段 |
| bool | 布尔 | Boolean | 布尔 | 布尔字段 |`;

    const result = parseTemplate('/test/test.md', content);

    expect(result.fields).toHaveLength(5);
    expect(result.fields[0].type).toBe('text');
    expect(result.fields[1].type).toBe('longtext');
    expect(result.fields[2].type).toBe('date');
    expect(result.fields[3].type).toBe('array');
    expect(result.fields[4].type).toBe('boolean');
  });

  it('should handle missing title gracefully', () => {
    const content = `## 章节说明

本章节描述偏差的基本信息。`;

    const result = parseTemplate('/test/test.md', content);

    expect(result.id).toBe('test');
    expect(result.title).toBe('test');
    expect(result.titleEn).toBe('test');
  });

  it('should handle empty template', () => {
    const content = '';

    const result = parseTemplate('/test/test.md', content);

    expect(result.id).toBe('test');
    expect(result.title).toBe('test');
    expect(result.fields).toHaveLength(0);
    expect(result.prompt).toBe('');
    expect(result.outputFormat).toBe('');
  });

  it('should parse Chinese type names correctly', () => {
    const content = `# 测试 Template

## 可变字段

| 字段 | 中文 | 英文 | 类型 | 说明 |
|------|------|------|------|------|
| text | 文本 | Text | 文本 | 文本 |
| long | 长文本 | Long | 长文本 | 长文本 |
| date | 日期 | Date | 日期/时间 | 日期 |
| array | 数组 | Array | 附件数组 | 数组 |
| bool | 布尔 | Boolean | 复选框 | 布尔 |`;

    const result = parseTemplate('/test/test.md', content);

    expect(result.fields).toHaveLength(5);
    expect(result.fields[0].type).toBe('text');
    expect(result.fields[1].type).toBe('longtext');
    expect(result.fields[2].type).toBe('date');
    expect(result.fields[3].type).toBe('array');
    expect(result.fields[4].type).toBe('boolean');
  });

  it('should set lastModified to current date', () => {
    const content = '# Test Template';
    const before = new Date();

    const result = parseTemplate('/test/test.md', content);

    expect(result.lastModified).toBeInstanceOf(Date);
    expect(result.lastModified.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it('should preserve raw content', () => {
    const content = '# Test Template\n\nSome content here.';

    const result = parseTemplate('/test/test.md', content);

    expect(result.rawContent).toBe(content);
  });

  it('should handle multiple sections', () => {
    const content = `# 测试 Template

## 章节说明

说明内容。

## 可变字段

| 字段 | 中文 | 类型 | 说明 |
|------|------|------|------|
| field1 | 字段1 | 文本 | 说明1 |

## 生成提示

提示内容。

## 输出格式

\`\`\`json
{"field1": "value"}
\`\`\``;

    const result = parseTemplate('/test/test.md', content);

    expect(result.fields).toHaveLength(1);
    expect(result.prompt).toContain('提示内容');
    expect(result.outputFormat).toContain('"field1": "value"');
  });
});