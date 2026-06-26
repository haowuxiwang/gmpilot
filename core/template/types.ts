/**
 * Template system types.
 * Defines the structure for deviation report templates.
 */

/** Template field definition */
export interface TemplateField {
  name: string;
  label: string;
  labelEn: string;
  type: 'text' | 'longtext' | 'date' | 'array' | 'object' | 'boolean';
  description?: string;
  required?: boolean;
  default?: unknown;
}

/** Template section definition */
export interface TemplateSection {
  id: string;
  title: string;
  titleEn: string;
  description: string;
  fields: TemplateField[];
  prompt?: string;
  outputFormat?: string;
}

/** Parsed template */
export interface ParsedTemplate {
  id: string;
  filePath: string;
  title: string;
  titleEn: string;
  description: string;
  fields: TemplateField[];
  prompt: string;
  outputFormat: string;
  rawContent: string;
  lastModified: Date;
}

/** Template change callback */
export type TemplateChangeCallback = (templateId: string, template: ParsedTemplate) => void;
