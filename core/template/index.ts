/**
 * Template system public API.
 */

export { loadAllTemplates, getTemplate, getAllTemplates, reloadTemplate, onTemplateChange, startWatching, stopWatching, clearCache } from './loader';
export { parseTemplate } from './parser';
export type { ParsedTemplate, TemplateField, TemplateSection, TemplateChangeCallback } from './types';
