/**
 * Template registry.
 * Manages multiple deviation report templates for different factories.
 */

import fs from 'fs';
import path from 'path';
import { resolveResourcePath } from '../utils/paths';
import { createLogger } from '../utils/logger';
import type { TemplateMeta, StyleConfig } from './registry-types';

const log = createLogger('TemplateRegistry');

/** Required placeholders that must exist in any valid template */
export const REQUIRED_PLACEHOLDERS = [
  '{title}',
  '{titleEn}',
  '{fileNo}',
  '{version}',
  '{background}',
  '{investigationIntro}',
  '{rootCauseConclusion}',
  '{riskParagraphs}',
  '{corrections}',
  '{preventions}',
];

/** Template base directory */
const TEMPLATE_BASE_DIR = resolveResourcePath('resources', 'templates');

/** In-memory cache */
const templateCache = new Map<string, TemplateMeta>();
const styleCache = new Map<string, StyleConfig>();

/**
 * Get all available template directories.
 */
function getTemplateDirs(): string[] {
  try {
    if (!fs.existsSync(TEMPLATE_BASE_DIR)) {
      return [];
    }
    const entries = fs.readdirSync(TEMPLATE_BASE_DIR, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch (error) {
    log.error('Failed to read template directory', { error: String(error) });
    return [];
  }
}

/**
 * Load meta.json from a template directory.
 */
function loadMeta(templateDir: string): Partial<TemplateMeta> | null {
  const metaPath = path.join(TEMPLATE_BASE_DIR, templateDir, 'meta.json');
  try {
    if (!fs.existsSync(metaPath)) return null;
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Load style.json from a template directory.
 */
export function loadStyle(templateDir: string): StyleConfig | null {
  // Check cache first
  if (styleCache.has(templateDir)) {
    return styleCache.get(templateDir)!;
  }

  const stylePath = path.join(TEMPLATE_BASE_DIR, templateDir, 'style.json');
  try {
    if (!fs.existsSync(stylePath)) {
      log.warn('style.json not found', { templateDir });
      return null;
    }
    const style = JSON.parse(fs.readFileSync(stylePath, 'utf-8')) as StyleConfig;
    styleCache.set(templateDir, style);
    return style;
  } catch (error) {
    log.error('Failed to load style.json', { templateDir, error: String(error) });
    return null;
  }
}

/**
 * Build TemplateMeta from directory contents.
 */
function buildTemplateMeta(templateDir: string): TemplateMeta | null {
  const dirPath = path.join(TEMPLATE_BASE_DIR, templateDir);
  const meta = loadMeta(templateDir);

  // Check required files exist
  const fillablePath = path.join(dirPath, 'deviation-report-fillable.docx');
  const stylePath = path.join(dirPath, 'style.json');
  const metaPath = path.join(dirPath, 'meta.json');

  if (!fs.existsSync(fillablePath)) {
    log.warn('Missing fillable template', { templateDir });
    return null;
  }

  const now = new Date().toISOString();
  return {
    id: templateDir,
    name: meta?.name ?? templateDir,
    version: meta?.version ?? '1.0.0',
    description: meta?.description ?? '',
    builtIn: meta?.builtIn ?? false,
    path: dirPath,
    fillablePath,
    stylePath: fs.existsSync(stylePath) ? stylePath : '',
    metaPath: fs.existsSync(metaPath) ? metaPath : '',
    createdAt: meta?.createdAt ?? now,
    updatedAt: meta?.updatedAt ?? now,
  };
}

/**
 * Get all available templates.
 */
export function getAllTemplates(): TemplateMeta[] {
  const dirs = getTemplateDirs();
  const templates: TemplateMeta[] = [];

  for (const dir of dirs) {
    const meta = buildTemplateMeta(dir);
    if (meta) {
      templates.push(meta);
      templateCache.set(meta.id, meta);
    }
  }

  return templates;
}

/**
 * Get a template by ID.
 */
export function getTemplate(templateId: string): TemplateMeta | null {
  // Validate templateId to prevent path traversal
  if (!templateId || !/^[a-zA-Z0-9_-]+$/.test(templateId)) {
    log.warn('Invalid templateId rejected', { templateId });
    return null;
  }

  // Check cache
  if (templateCache.has(templateId)) {
    return templateCache.get(templateId)!;
  }

  const meta = buildTemplateMeta(templateId);
  if (meta) {
    templateCache.set(templateId, meta);
  }
  return meta;
}

/**
 * Get the default template.
 */
export function getDefaultTemplate(): TemplateMeta {
  const template = getTemplate('default');
  if (template) return template;

  // Fallback: if no 'default' dir exists, use the legacy single template
  const legacyPath = resolveResourcePath('resources', 'templates', 'deviation-report-fillable.docx');
  if (fs.existsSync(legacyPath)) {
    return {
      id: 'default',
      name: '默认模板',
      version: '1.0.0',
      description: '内置默认模板（Arial + 宋体，五号字）',
      builtIn: true,
      path: path.dirname(legacyPath),
      fillablePath: legacyPath,
      stylePath: '',
      metaPath: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  throw new Error('No default template found');
}

/**
 * Get template by settings selection, with fallback to default.
 */
export function getSelectedTemplate(selectedId?: string | null): TemplateMeta {
  if (selectedId) {
    const template = getTemplate(selectedId);
    if (template) return template;
    log.warn('Selected template not found, falling back to default', { selectedId });
  }
  return getDefaultTemplate();
}

/**
 * Register a user-uploaded template.
 */
export function registerTemplate(templateId: string, meta: Omit<TemplateMeta, 'id' | 'builtIn'>): TemplateMeta {
  const fullMeta: TemplateMeta = {
    ...meta,
    id: templateId,
    builtIn: false,
  };
  templateCache.set(templateId, fullMeta);
  return fullMeta;
}

/**
 * Unregister a user-uploaded template.
 */
export function unregisterTemplate(templateId: string): void {
  templateCache.delete(templateId);
}

/**
 * Clear cache (useful for testing).
 */
export function clearCache(): void {
  templateCache.clear();
  styleCache.clear();
}
