/**
 * Template system public API.
 */

export { loadAllTemplates, getTemplate, getAllTemplates, reloadTemplate, onTemplateChange, startWatching, stopWatching, clearCache } from './loader';
export { parseTemplate } from './parser';
export { getAllTemplates as getAllWordTemplates, getDefaultTemplate, getSelectedTemplate, loadStyle, registerTemplate, unregisterTemplate } from './registry';
export type { ParsedTemplate, TemplateField, TemplateSection, TemplateChangeCallback } from './types';
export type { TemplateMeta, StyleConfig, FontConfig, SizeConfig, IndentConfig, SpacingConfig, HeaderConfig, FooterConfig, TemplateValidationResult } from './registry-types';
