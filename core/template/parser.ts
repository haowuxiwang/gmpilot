/**
 * Template parser.
 * Parses template markdown files into structured template definitions.
 */

import path from 'path';
import type { ParsedTemplate, TemplateField } from './types';

/**
 * Parse a template markdown file into a structured template.
 */
export function parseTemplate(filePath: string, content: string): ParsedTemplate {
  const id = path.basename(filePath, '.md');
  const lines = content.split('\n');

  let title = '';
  let titleEn = '';
  let description = '';
  const fields: TemplateField[] = [];
  let prompt = '';
  let outputFormat = '';

  let currentSection = '';
  let inTable = false;
  let tableHeaders: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Parse title (first H1)
    if (line.startsWith('# ') && !title) {
      const titleLine = line.substring(2).trim();
      const titleMatch = titleLine.match(/^(.+?)\s+(.+)$/);
      if (titleMatch) {
        title = titleMatch[1];
        titleEn = titleMatch[2];
      } else {
        title = titleLine;
      }
      continue;
    }

    // Parse sections
    if (line.startsWith('## ')) {
      currentSection = line.substring(3).trim();
      inTable = false;
      tableHeaders = [];
      continue;
    }

    // Parse description (first paragraph after title)
    if (!description && !line.startsWith('#') && !line.startsWith('|') && line.length > 0) {
      description = line;
      continue;
    }

    // Parse table headers
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line.split('|').filter(Boolean).map((c) => c.trim());

      if (!inTable) {
        // First row is headers
        tableHeaders = cells;
        inTable = true;
        continue;
      }

      // Skip separator row
      if (cells.every((c) => /^[-:]+$/.test(c))) {
        continue;
      }

      // Parse field row
      if (currentSection.includes('可变字段') || currentSection.includes('字段')) {
        const field = parseFieldRow(tableHeaders, cells);
        if (field) {
          fields.push(field);
        }
      }
      continue;
    }

    // Reset table state when non-table line
    if (inTable && !line.startsWith('|')) {
      inTable = false;
      tableHeaders = [];
    }

    // Parse generation prompt
    if (currentSection.includes('生成提示') || currentSection.includes('Generation Prompt')) {
      if (line.length > 0 && !line.startsWith('#')) {
        prompt += line + '\n';
      }
    }

    // Parse output format
    if (currentSection.includes('输出格式') || currentSection.includes('Output Format')) {
      if (line.startsWith('```') || line === '') {
        continue;
      }
      outputFormat += line + '\n';
    }
  }

  return {
    id,
    filePath,
    title: title || id,
    titleEn: titleEn || id,
    description: description || '',
    fields,
    prompt: prompt.trim(),
    outputFormat: outputFormat.trim(),
    rawContent: content,
    lastModified: new Date(),
  };
}

/**
 * Parse a table row into a TemplateField.
 */
function parseFieldRow(headers: string[], cells: string[]): TemplateField | null {
  if (cells.length < 2) return null;

  const getField = (header: string): string => {
    const index = headers.findIndex((h) => h.includes(header));
    return index >= 0 ? cells[index] || '' : '';
  };

  const name = getField('字段') || getField('Field') || cells[0];
  const label = getField('中文') || getField('Chinese') || cells[1];
  const labelEn = getField('英文') || getField('English') || '';
  const typeStr = getField('类型') || getField('Type') || 'text';
  const description = getField('说明') || getField('Description') || '';

  if (!name) return null;

  const type = parseFieldType(typeStr);

  return {
    name: name.replace(/[`]/g, ''),
    label: label || name,
    labelEn: labelEn || name,
    type,
    description,
    required: false,
  };
}

/**
 * Parse field type string.
 */
function parseFieldType(typeStr: string): TemplateField['type'] {
  const lower = typeStr.toLowerCase();

  if (lower.includes('长文本') || lower.includes('longtext') || lower.includes('long text')) {
    return 'longtext';
  }
  if (lower.includes('日期') || lower.includes('date') || lower.includes('时间')) {
    return 'date';
  }
  if (lower.includes('数组') || lower.includes('array')) {
    return 'array';
  }
  if (lower.includes('对象') || lower.includes('object')) {
    return 'object';
  }
  if (lower.includes('布尔') || lower.includes('boolean') || lower.includes('复选框')) {
    return 'boolean';
  }

  return 'text';
}
