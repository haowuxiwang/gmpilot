/**
 * Template engine public API.
 * Provides template parsing, section detection, and tag injection.
 */

export { parseDocx } from './parser';
export { detectSections, getMissingModules, hasAllModules } from './detector';
export { injectTags, renderTemplate } from './injector';
export { registerTemplate, unregisterTemplate, getSelectedTemplate, getDefaultTemplate, loadStyle, getAllTemplates as getAllWordTemplates } from './registry';
export type { InjectionResult } from './injector';
export type {
  DocumentAst,
  ParagraphNode,
  TableNode,
  DetectedSection,
  Run,
  RunProps,
  StyleDefinition,
  FontDefinition,
} from './types';
export { STANDARD_MODULES } from './types';
