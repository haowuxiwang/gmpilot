import { describe, it, expect, beforeAll } from 'vitest';
import { loadAllTemplates, clearCache } from '../loader';

describe('Template Integration Tests', () => {
  beforeAll(() => {
    clearCache();
  });

  it('should load all template files successfully', () => {
    const templates = loadAllTemplates();

    // 应该加载到多个模板
    expect(templates.size).toBeGreaterThan(0);

    // 检查每个模板的基本结构
    for (const [id, template] of templates) {
      expect(template.id).toBe(id);
      expect(template.filePath).toContain('.md');
      expect(template.title).toBeDefined();
      expect(template.fields).toBeDefined();
      expect(Array.isArray(template.fields)).toBe(true);
      expect(template.prompt).toBeDefined();
      expect(template.outputFormat).toBeDefined();
    }
  });

  it('should have background template with correct structure', () => {
    const templates = loadAllTemplates();
    const background = templates.get('background');

    expect(background).toBeDefined();
    if (background) {
      expect(background.title).toContain('背景');
      expect(background.fields.length).toBeGreaterThan(0);

      // 检查关键字段
      const fieldNames = background.fields.map(f => f.name);
      expect(fieldNames).toContain('product');
      expect(fieldNames).toContain('batch');
      expect(fieldNames).toContain('occurrenceTime');
      expect(fieldNames).toContain('location');
      expect(fieldNames).toContain('description');
    }
  });

  it('should have cover template with correct structure', () => {
    const templates = loadAllTemplates();
    const cover = templates.get('cover');

    expect(cover).toBeDefined();
    if (cover) {
      expect(cover.title).toContain('封面');
      expect(cover.fields.length).toBeGreaterThan(0);
    }
  });

  it('should have investigation template with correct structure', () => {
    const templates = loadAllTemplates();
    const investigation = templates.get('investigation-root-cause');

    expect(investigation).toBeDefined();
    if (investigation) {
      expect(investigation.title).toContain('根本原因');
      expect(investigation.fields.length).toBeGreaterThan(0);
    }
  });

  it('should parse templates with different formats correctly', () => {
    const templates = loadAllTemplates();

    for (const [, template] of templates) {
      // 每个模板都应该有有效的 ID
      expect(template.id).toMatch(/^[a-zA-Z0-9_-]+$/);

      // 每个模板都应该有标题（中文或英文）
      expect(template.title.length).toBeGreaterThan(0);
      expect(template.titleEn.length).toBeGreaterThan(0);

      // 每个模板都应该有 rawContent
      expect(template.rawContent.length).toBeGreaterThan(0);
    }
  });

  it('should parse all field types correctly', () => {
    const templates = loadAllTemplates();
    const validTypes = ['text', 'longtext', 'date', 'array', 'object', 'boolean'];

    for (const [, template] of templates) {
      for (const field of template.fields) {
        expect(field.name).toBeDefined();
        expect(field.label).toBeDefined();
        expect(field.labelEn).toBeDefined();
        expect(field.type).toBeDefined();
        expect(validTypes).toContain(field.type);
      }
    }
  });

  it('should have generation prompts for most templates', () => {
    const templates = loadAllTemplates();
    const templatesWithoutPrompts = ['cover']; // 封面模板没有生成提示

    for (const [id, template] of templates) {
      if (!templatesWithoutPrompts.includes(id)) {
        // 大多数模板都应该有生成提示
        expect(template.prompt.length).toBeGreaterThan(0);
      }
    }
  });

  it('should have output format specifications for most templates', () => {
    const templates = loadAllTemplates();
    const templatesWithoutFormat = ['cover']; // 封面模板没有输出格式

    for (const [id, template] of templates) {
      if (!templatesWithoutFormat.includes(id)) {
        // 大多数模板都应该有输出格式
        expect(template.outputFormat.length).toBeGreaterThan(0);
      }
    }
  });

  it('should have consistent field structure across templates', () => {
    const templates = loadAllTemplates();

    for (const [, template] of templates) {
      for (const field of template.fields) {
        // 每个字段都应该有必需的属性
        // 字段名可以是驼峰命名或嵌套命名（如 preparedBy.name）
        expect(field.name).toMatch(/^[a-zA-Z0-9_.]+$/);
        expect(field.label.length).toBeGreaterThan(0);
        expect(field.labelEn.length).toBeGreaterThan(0);
      }
    }
  });
});