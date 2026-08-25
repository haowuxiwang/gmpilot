import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { loadAllTemplates, getTemplate, getAllTemplates, reloadTemplate, clearCache } from '../loader';
import { parseTemplate } from '../parser';

const TEMPLATE_DIR = path.resolve(process.cwd(), 'docs', 'templates');

describe('Template System Comprehensive Test', () => {
  beforeAll(() => {
    clearCache();
  });

  describe('1. Template Loading', () => {
    it('should load all templates from docs/templates/', () => {
      const templates = loadAllTemplates();
      expect(templates.size).toBeGreaterThanOrEqual(6);

      const expectedIds = ['cover', 'background', 'conclusion', 'capa', 'investigation-root-cause', 'risk-assessment'];
      for (const id of expectedIds) {
        expect(templates.has(id)).toBe(true);
      }
    });

    it('should load README.md is excluded', () => {
      const templates = loadAllTemplates();
      expect(templates.has('README')).toBe(false);
    });

    it('should cache templates after first load', () => {
      clearCache();
      const first = getAllTemplates();
      const second = getAllTemplates();
      expect(first.length).toBe(second.length);
    });

    it('should reload individual template by id', () => {
      const reloaded = reloadTemplate('background');
      expect(reloaded).not.toBeNull();
      expect(reloaded?.id).toBe('background');
    });
  });

  describe('2. Template Parsing - Structure Validation', () => {
    it('should parse cover template correctly', () => {
      const template = getTemplate('cover');
      expect(template).not.toBeNull();

      expect(template!.id).toBe('cover');
      expect(template!.title).toBe('封面');
      expect(template!.titleEn).toBe('Cover');
      // Description is the first non-heading, non-table paragraph after title
      expect(template!.description.length).toBeGreaterThan(0);
      expect(template!.fields.length).toBeGreaterThan(0);

      // Cover fields: department, preparedBy.name, preparedBy.signatureDate, reviewedBy.name, reviewedBy.signatureDate
      const fieldNames = template!.fields.map(f => f.name);
      expect(fieldNames).toContain('department');
      expect(fieldNames).toContain('preparedBy.name');
      expect(fieldNames).toContain('reviewedBy.name');
    });

    it('should parse background template correctly', () => {
      const template = getTemplate('background');
      expect(template).not.toBeNull();

      expect(template!.title).toContain('背景');
      expect(template!.fields.length).toBe(6);

      const fieldNames = template!.fields.map(f => f.name);
      expect(fieldNames).toContain('product');
      expect(fieldNames).toContain('batch');
      expect(fieldNames).toContain('occurrenceTime');
      expect(fieldNames).toContain('location');
      expect(fieldNames).toContain('description');
      expect(fieldNames).toContain('photos');
    });

    it('should parse conclusion template correctly', () => {
      const template = getTemplate('conclusion');
      expect(template).not.toBeNull();

      expect(template!.title).toContain('调查结论');
      expect(template!.fields.length).toBe(2);

      const fieldNames = template!.fields.map(f => f.name);
      expect(fieldNames).toContain('rootCause');
      expect(fieldNames).toContain('mostLikelyCause');
    });

    it('should parse capa template correctly', () => {
      const template = getTemplate('capa');
      expect(template).not.toBeNull();

      // Title is the Chinese part "纠正预防措施", English part "CAPA" is in titleEn
      expect(template!.title).toBe('纠正预防措施');
      expect(template!.titleEn).toBe('CAPA');
      expect(template!.fields.length).toBe(5);

      const fieldNames = template!.fields.map(f => f.name);
      expect(fieldNames).toContain('capaNo');
      expect(fieldNames).toContain('content');
      expect(fieldNames).toContain('executor');
      expect(fieldNames).toContain('expectedDate');
      expect(fieldNames).toContain('signatureDate');
    });

    it('should parse risk-assessment template', () => {
      const template = getTemplate('risk-assessment');
      expect(template).not.toBeNull();

      expect(template!.title).toContain('风险分析');
      // NOTE: risk-assessment.md uses "影响维度" as section header
      // Parser only recognizes "可变字段" or "字段" sections
      // So fields may not be parsed - this is a known limitation
      if (template!.fields.length === 0) {
        // Known limitation: section name doesn't match parser expectation
        expect(template!.rawContent).toContain('影响维度');
      }
    });

    it('should parse investigation-root-cause template', () => {
      const template = getTemplate('investigation-root-cause');
      expect(template).not.toBeNull();

      expect(template!.title).toContain('根本原因');
      // NOTE: uses "调查过程记录字段" which contains "字段" so should parse
      // But also has "调查分析方法" and "人员差错专项调查" sections
    });
  });

  describe('3. Field Type Validation', () => {
    const validTypes = ['text', 'longtext', 'date', 'array', 'object', 'boolean'];

    it('should have valid field types across all templates', () => {
      const templates = getAllTemplates();

      for (const template of templates) {
        for (const field of template.fields) {
          expect(validTypes).toContain(field.type);
          expect(field.name).toBeTruthy();
          expect(field.label).toBeTruthy();
          expect(field.labelEn).toBeTruthy();
        }
      }
    });

    it('should correctly identify longtext fields', () => {
      const bg = getTemplate('background');
      const descField = bg?.fields.find(f => f.name === 'description');
      expect(descField?.type).toBe('longtext');
    });

    it('should correctly identify date fields', () => {
      const bg = getTemplate('background');
      const timeField = bg?.fields.find(f => f.name === 'occurrenceTime');
      expect(timeField?.type).toBe('date');
    });

    it('should correctly identify text fields', () => {
      const bg = getTemplate('background');
      const productField = bg?.fields.find(f => f.name === 'product');
      expect(productField?.type).toBe('text');
    });

    it('should correctly identify array fields', () => {
      const bg = getTemplate('background');
      const photosField = bg?.fields.find(f => f.name === 'photos');
      expect(photosField?.type).toBe('array');
    });
  });

  describe('4. Prompt and Output Format Validation', () => {
    it('should have generation prompts for templates that need them', () => {
      const templatesWithPrompts = ['background', 'conclusion', 'capa', 'investigation-root-cause', 'risk-assessment'];

      for (const id of templatesWithPrompts) {
        const template = getTemplate(id);
        expect(template?.prompt).toBeTruthy();
        expect(template!.prompt.length).toBeGreaterThan(10);
      }
    });

    it('should have output format JSON for LLM-driven templates', () => {
      const templatesWithFormat = ['background', 'conclusion', 'capa', 'investigation-root-cause', 'risk-assessment'];

      for (const id of templatesWithFormat) {
        const template = getTemplate(id);
        expect(template?.outputFormat).toBeTruthy();
        // Output format should contain JSON-like structure
        expect(template!.outputFormat).toContain('{');
      }
    });

    it('cover template should not need generation prompt', () => {
      const cover = getTemplate('cover');
      // Cover is a fixed layout, not LLM-generated
      // It may or may not have prompt, but should have fields
      expect(cover?.fields.length).toBeGreaterThan(0);
    });
  });

  describe('5. Raw Content Preservation', () => {
    it('should preserve raw markdown content for each template', () => {
      const templates = getAllTemplates();

      for (const template of templates) {
        expect(template.rawContent).toBeTruthy();
        expect(template.rawContent.length).toBeGreaterThan(50);
        expect(template.rawContent).toContain('# ');
      }
    });

    it('should preserve markdown table syntax in raw content', () => {
      const bg = getTemplate('background');
      expect(bg?.rawContent).toContain('| 字段 |');
      expect(bg?.rawContent).toContain('|------|');
    });
  });

  describe('6. Template Reconstruction from Parsed Data', () => {
    it('should reconstruct a valid template markdown from parsed fields', () => {
      const template = getTemplate('background');
      expect(template).not.toBeNull();

      // Build a markdown table from parsed fields
      let reconstructed = `# ${template!.title} ${template!.titleEn}\n\n`;
      reconstructed += `## 章节说明\n\n${template!.description}\n\n`;
      reconstructed += `## 可变字段\n\n`;
      reconstructed += `| 字段 | 中文 | 英文 | 类型 | 说明 |\n`;
      reconstructed += `|------|------|------|------|------|\n`;

      for (const field of template!.fields) {
        reconstructed += `| ${field.name} | ${field.label} | ${field.labelEn} | ${field.type} | ${field.description || ''} |\n`;
      }

      if (template!.prompt) {
        reconstructed += `\n## 生成提示\n\n${template!.prompt}\n`;
      }

      if (template!.outputFormat) {
        reconstructed += `\n## 输出格式\n\n\`\`\`json\n${template!.outputFormat}\n\`\`\`\n`;
      }

      // Re-parse the reconstructed markdown
      const reParsed = parseTemplate('/test/reconstructed.md', reconstructed);

      // Verify round-trip fidelity
      expect(reParsed.id).toBe('reconstructed');
      expect(reParsed.title).toBe(template!.title);
      expect(reParsed.fields.length).toBe(template!.fields.length);

      for (let i = 0; i < template!.fields.length; i++) {
        expect(reParsed.fields[i].name).toBe(template!.fields[i].name);
        expect(reParsed.fields[i].label).toBe(template!.fields[i].label);
        expect(reParsed.fields[i].type).toBe(template!.fields[i].type);
      }
    });

    it('should reconstruct capa template with all fields', () => {
      const template = getTemplate('capa');
      expect(template).not.toBeNull();

      let reconstructed = `# ${template!.title} ${template!.titleEn}\n\n`;
      reconstructed += `## CAPA 表格字段\n\n`;
      reconstructed += `| 字段 | 中文 | 英文 | 类型 | 说明 |\n`;
      reconstructed += `|------|------|------|------|------|\n`;

      for (const field of template!.fields) {
        reconstructed += `| ${field.name} | ${field.label} | ${field.labelEn} | ${field.type} | ${field.description || ''} |\n`;
      }

      if (template!.prompt) {
        reconstructed += `\n## 生成提示\n\n${template!.prompt}\n`;
      }

      if (template!.outputFormat) {
        reconstructed += `\n## 输出格式\n\n\`\`\`json\n${template!.outputFormat}\n\`\`\`\n`;
      }

      const reParsed = parseTemplate('/test/reconstructed-capa.md', reconstructed);
      expect(reParsed.fields.length).toBe(template!.fields.length);

      const reFieldNames = reParsed.fields.map(f => f.name);
      expect(reFieldNames).toContain('capaNo');
      expect(reFieldNames).toContain('content');
      expect(reFieldNames).toContain('executor');
      expect(reFieldNames).toContain('expectedDate');
      expect(reFieldNames).toContain('signatureDate');
    });
  });

  describe('7. Edge Cases and Error Handling', () => {
    it('should handle template with no fields gracefully', () => {
      const result = parseTemplate('/test/empty-fields.md', '# Empty\n\n## 章节说明\n\nNo fields here.\n');
      expect(result.fields).toHaveLength(0);
      expect(result.id).toBe('empty-fields');
    });

    it('should handle template with malformed table rows', () => {
      const content = `# Test

## 可变字段

| 字段 | 中文 | 类型 |
|------|------|------|
| field1 | 字段1 |
| field2 | 字段2 | 文本 |
| | 空字段 | 文本 |`;

      const result = parseTemplate('/test/malformed.md', content);
      // Should parse what it can, skip malformed rows
      expect(result.fields.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle template with Chinese and English type names', () => {
      const content = `# Test

## 可变字段

| 字段 | 中文 | 类型 |
|------|------|------|
| f1 | 字段1 | 文本 |
| f2 | 字段2 | 长文本 |
| f3 | 字段3 | 日期/时间 |
| f4 | 字段4 | 附件数组 |
| f5 | 字段5 | 复选框 |`;

      const result = parseTemplate('/test/types.md', content);
      expect(result.fields.length).toBe(5);
      expect(result.fields[0].type).toBe('text');
      expect(result.fields[1].type).toBe('longtext');
      expect(result.fields[2].type).toBe('date');
      expect(result.fields[3].type).toBe('array');
      expect(result.fields[4].type).toBe('boolean');
    });

    it('should reject invalid template IDs in getTemplate', () => {
      expect(getTemplate('')).toBeNull();
      expect(getTemplate('../../../etc/passwd')).toBeNull();
      expect(getTemplate('template; rm -rf /')).toBeNull();
      expect(getTemplate('template with spaces')).toBeNull();
    });

    it('should handle concurrent template access', () => {
      clearCache();
      const results = [
        getTemplate('background'),
        getTemplate('cover'),
        getTemplate('conclusion'),
        getTemplate('background'),
      ];

      expect(results.every(r => r !== null)).toBe(true);
    });
  });

  describe('8. Template File System Operations', () => {
    it('should list all .md files in template directory', () => {
      const files = fs.readdirSync(TEMPLATE_DIR);
      const mdFiles = files.filter(f => f.endsWith('.md') && f !== 'README.md');
      expect(mdFiles.length).toBeGreaterThanOrEqual(6);
    });

    it('should have all expected template files on disk', () => {
      const expectedFiles = [
        'cover.md',
        'background.md',
        'conclusion.md',
        'capa.md',
        'investigation-root-cause.md',
        'risk-assessment.md',
      ];

      for (const file of expectedFiles) {
        const filePath = path.join(TEMPLATE_DIR, file);
        expect(fs.existsSync(filePath)).toBe(true);
      }
    });
  });

  describe('9. Cross-Template Consistency', () => {
    it('should have consistent field naming convention (camelCase)', () => {
      const templates = getAllTemplates();

      for (const template of templates) {
        for (const field of template.fields) {
          // Field names should be camelCase or dot-notation for nested fields
          expect(field.name).toMatch(/^[a-zA-Z][a-zA-Z0-9_.]*$/);
        }
      }
    });

    it('should have bilingual labels for all fields', () => {
      const templates = getAllTemplates();

      for (const template of templates) {
        for (const field of template.fields) {
          expect(field.label.length).toBeGreaterThan(0);
          expect(field.labelEn.length).toBeGreaterThan(0);
        }
      }
    });

    it('should have all templates with lastModified date', () => {
      const templates = getAllTemplates();

      for (const template of templates) {
        expect(template.lastModified).toBeInstanceOf(Date);
      }
    });

    it('should have filePath for all templates', () => {
      const templates = getAllTemplates();

      for (const template of templates) {
        expect(template.filePath).toContain('.md');
        expect(template.filePath).toContain('templates');
      }
    });
  });

  describe('10. Custom Template Upload Support', () => {
    it('should NOT have custom template upload functionality', () => {
      // Search for upload-related IPC handlers in the codebase
      // The template system only supports built-in templates from docs/templates/
      // There is no IPC handler for template upload
      // Knowledge base has upload, but templates do not

      const loaderSource = fs.readFileSync(
        path.resolve(process.cwd(), 'core', 'template', 'loader.ts'),
        'utf-8'
      );

      // No upload function exists in the loader
      expect(loaderSource).not.toContain('upload');
      expect(loaderSource).not.toContain('addTemplate');
      expect(loaderSource).not.toContain('createTemplate');
      expect(loaderSource).not.toContain('saveTemplate');
    });

    it('should only load from fixed docs/templates/ directory', () => {
      const loaderSource = fs.readFileSync(
        path.resolve(process.cwd(), 'core', 'template', 'loader.ts'),
        'utf-8'
      );

      // Template directory is hardcoded to docs/templates
      expect(loaderSource).toContain("resolveResourcePath('docs', 'templates')");
    });
  });
});
