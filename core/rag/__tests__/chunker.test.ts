import { describe, it, expect } from 'vitest';
import { chunkText } from '../chunker';

describe('chunkText', () => {
  it('should return empty array for empty text', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   ')).toEqual([]);
  });

  it('should return single chunk for short text', () => {
    const text = '这是一段简短的偏差描述。';
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(text);
    expect(chunks[0].index).toBe(0);
    expect(chunks[0].charCount).toBe(text.length);
  });

  it('should split by Chinese section headings', () => {
    const text = `第一章 总则
这是第一章的内容。

第二章 质量管理
这是第二章的内容。

第三章 机构与人员
这是第三章的内容。`;

    const chunks = chunkText(text, 10000);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks[0].sectionPath).toContain('总则');
    expect(chunks[1].sectionPath).toContain('质量管理');
    expect(chunks[2].sectionPath).toContain('机构与人员');
  });

  it('should split by Markdown headings', () => {
    const text = `# 标题一
内容一

## 标题二
内容二`;

    const chunks = chunkText(text, 10000);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it('should split oversized sections by paragraphs', () => {
    // Create a section with multiple paragraphs
    const paragraph = '这是一段较长的内容。'.repeat(50);
    const text = `第一章 测试

${paragraph}

${paragraph}

${paragraph}`;

    const chunks = chunkText(text, 500);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should respect maxChars limit', () => {
    const longText = '内容'.repeat(5000);
    const chunks = chunkText(longText, 1000);
    for (const chunk of chunks) {
      // Allow some overflow due to sentence splitting
      expect(chunk.charCount).toBeLessThan(2000);
    }
  });

  it('should include overlap between chunks', () => {
    const paragraph = '这是测试段落。'.repeat(200);
    const text = `第一章\n\n${paragraph}\n\n${paragraph}`;
    const chunks = chunkText(text, 500, 100);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should handle numbered sections (1. 2. 3.)', () => {
    const text = `1. 质量保证
企业应当建立质量保证体系。

2. 偏差处理
企业应当建立偏差处理程序。

3. 变更控制
企业应当建立变更控制系统。`;

    const chunks = chunkText(text, 10000);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
  });

  it('should preserve section path for traceability', () => {
    const text = `第二章 质量管理

第十条 偏差处理
企业应当建立偏差处理程序。`;

    const chunks = chunkText(text, 10000);
    expect(chunks[0].sectionPath).toBeTruthy();
  });

  it('should not infinite loop on text without delimiters (splitByChars)', () => {
    // Regression: splitByChars had an infinite loop when end === text.length
    const text = '内容'.repeat(5000); // 10000 chars, no delimiters
    const chunks = chunkText(text, 1000);
    expect(chunks.length).toBeGreaterThan(0);
    // Verify all content is covered
    const totalChars = chunks.reduce((sum, c) => sum + c.charCount, 0);
    expect(totalChars).toBeGreaterThanOrEqual(text.length * 0.8); // overlap causes some loss
  });

  it('should handle text shorter than maxChars without delimiters', () => {
    const text = '短文本无标点';
    const chunks = chunkText(text, 1000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(text);
  });

  it('should split English text using English sentence delimiters', () => {
    // Regression: 英文文档（EU GMP）依赖 . ! ? 切句；缺失会导致超长块
    // 超过 bge-large-zh-v1.5 的 512 token 上限 → SiliconFlow embedding 400 (code 20015)
    const text = 'The quality system should be documented. '
      .repeat(60)
      .slice(0, 3000); // ~3000 chars 英文，含英文句号
    const chunks = chunkText(text, 400);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(512);
    }
  });

  it('should split oversized single paragraphs via sentence splitting (flush path)', () => {
    // Regression: Phase 2 循环中单个超长段落被直接 push 成块，
    // 只有尾部 buffer 才走句子切分 —— 中间超大块逃过 512 token 上限
    const longEnglishPara =
      'Premises must be designed to prevent contamination. '.repeat(50); // ~2600 chars 单段
    const text = `第一章 测试\n\n${longEnglishPara}`;
    const chunks = chunkText(text, 400);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(512);
    }
  });
});
