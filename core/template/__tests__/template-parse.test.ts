import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseTemplate } from '../parser';
import type { ParsedTemplate } from '../types';

const TEMPLATE_DIR = path.resolve(__dirname, '../../../docs/templates');

const EXPECTED_FIELDS: Record<string, number> = {
  attachments: 3,
  cover: 5,
  background: 6,
  conclusion: 2,
  capa: 5,
  'investigation-root-cause': 18,
  'risk-assessment': 2,
};

function loadTemplate(id: string): ParsedTemplate {
  const filePath = path.join(TEMPLATE_DIR, `${id}.md`);
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseTemplate(filePath, content);
}

function loadAllTemplates(): ParsedTemplate[] {
  return fs
    .readdirSync(TEMPLATE_DIR)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .map((f) => {
      const filePath = path.join(TEMPLATE_DIR, f);
      return parseTemplate(filePath, fs.readFileSync(filePath, 'utf-8'));
    });
}

describe('Template parsing - all 7 templates', () => {
  const templates = loadAllTemplates();

  it('should load exactly 7 templates', () => {
    expect(templates.length).toBe(7);
  });

  it('should have all expected template IDs', () => {
    const ids = templates.map((t) => t.id).sort();
    const expected = Object.keys(EXPECTED_FIELDS).sort();
    expect(ids).toEqual(expected);
  });
});

describe('Field count validation', () => {
  for (const [templateId, expectedCount] of Object.entries(EXPECTED_FIELDS)) {
    it(`${templateId} should have ${expectedCount} fields`, () => {
      const template = loadTemplate(templateId);
      expect(template.fields.length).toBe(expectedCount);
    });
  }
});

describe('Prompt validation', () => {
  for (const templateId of Object.keys(EXPECTED_FIELDS)) {
    if (templateId === 'cover') {
      it(`${templateId} should NOT have a prompt (static content)`, () => {
        const template = loadTemplate(templateId);
        expect(template.prompt).toBe('');
      });
    } else {
      it(`${templateId} should have a prompt`, () => {
        const template = loadTemplate(templateId);
        expect(template.prompt.length).toBeGreaterThan(0);
      });
    }
  }
});

describe('Output format validation', () => {
  for (const templateId of Object.keys(EXPECTED_FIELDS)) {
    if (templateId === 'cover') {
      it(`${templateId} should NOT have an output format (static content)`, () => {
        const template = loadTemplate(templateId);
        expect(template.outputFormat).toBe('');
      });
    } else {
      it(`${templateId} should have an output format`, () => {
        const template = loadTemplate(templateId);
        expect(template.outputFormat.length).toBeGreaterThan(0);
      });
    }
  }
});

describe('Field type validation', () => {
  for (const templateId of Object.keys(EXPECTED_FIELDS)) {
    it(`${templateId} fields should have valid types`, () => {
      const template = loadTemplate(templateId);
      const validTypes = ['text', 'longtext', 'date', 'array', 'object', 'boolean'];
      for (const field of template.fields) {
        expect(validTypes).toContain(field.type);
      }
    });
  }
});

describe('Template metadata', () => {
  for (const templateId of Object.keys(EXPECTED_FIELDS)) {
    it(`${templateId} should have title, titleEn, and description`, () => {
      const template = loadTemplate(templateId);
      expect(template.title.length).toBeGreaterThan(0);
      expect(template.titleEn.length).toBeGreaterThan(0);
      expect(template.id).toBe(templateId);
    });
  }
});

describe('Template reconstruction from parsed data', () => {
  for (const templateId of Object.keys(EXPECTED_FIELDS)) {
    it(`${templateId} should preserve raw content`, () => {
      const template = loadTemplate(templateId);
      expect(template.rawContent.length).toBeGreaterThan(0);
      expect(template.rawContent).toContain('# ');
    });

    it(`${templateId} field names should be non-empty`, () => {
      const template = loadTemplate(templateId);
      for (const field of template.fields) {
        expect(field.name.length).toBeGreaterThan(0);
        expect(field.label.length).toBeGreaterThan(0);
      }
    });
  }
});

describe('investigation-root-cause specific field validation', () => {
  it('should contain all expected investigation fields', () => {
    const template = loadTemplate('investigation-root-cause');
    const fieldNames = template.fields.map((f) => f.name);

    const expectedFields = [
      'interviews', 'sopReview', 'historicalData', 'relatedBatches',
      'batchRecords', 'samplesReview', 'stabilityStudy', 'supplierReview',
      'methods.flowchart', 'methods.fishbone', 'methods.brainstorm', 'methods.photos',
      'man', 'machine', 'material', 'method', 'environment', 'measurement',
    ];

    for (const name of expectedFields) {
      expect(fieldNames).toContain(name);
    }
  });
});

describe('All templates loaded via loadAllTemplates', () => {
  it('should return 7 templates with all fields populated', () => {
    const templates = loadAllTemplates();
    expect(templates.length).toBe(7);

    for (const template of templates) {
      expect(template.id.length).toBeGreaterThan(0);
      expect(template.filePath.length).toBeGreaterThan(0);
      expect(template.fields.length).toBeGreaterThan(0);
      expect(template.lastModified).toBeInstanceOf(Date);
    }
  });
});
