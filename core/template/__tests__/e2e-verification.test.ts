import { describe, it, expect } from 'vitest';
import { loadAllTemplates, clearCache } from '../loader';

describe('Template E2E Verification', () => {
  beforeAll(() => {
    clearCache();
  });

  it('should parse all templates with correct field counts', () => {
    const templates = loadAllTemplates();
    
    // Expected field counts for each template
    const expected = {
      'attachments': 3,
      'cover': 5,
      'background': 6,
      'conclusion': 2,
      'capa': 5,
      'investigation-root-cause': 16, // 8 + 4 + 4 from 3 sections
      'risk-assessment': 2,
    };

    for (const [id, expectedCount] of Object.entries(expected)) {
      const template = templates.get(id);
      expect(template).toBeDefined();
      if (template) {
        expect(template.fields.length).toBeGreaterThanOrEqual(expectedCount);
        console.log(`✓ ${id}: ${template.fields.length} fields (expected >= ${expectedCount})`);
      }
    }
  });

  it('should have prompts for all templates except cover', () => {
    const templates = loadAllTemplates();
    
    for (const [id, template] of templates) {
      if (id === 'cover') {
        // Cover template doesn't have a generation prompt
        expect(template.prompt.length).toBe(0);
      } else {
        expect(template.prompt.length).toBeGreaterThan(0);
      }
    }
  });

  it('should have output format for all templates except cover', () => {
    const templates = loadAllTemplates();
    
    for (const [id, template] of templates) {
      if (id === 'cover') {
        // Cover template doesn't have output format
        expect(template.outputFormat.length).toBe(0);
      } else {
        expect(template.outputFormat.length).toBeGreaterThan(0);
      }
    }
  });
});
