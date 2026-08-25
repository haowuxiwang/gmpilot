/**
 * Template loader.
 * Loads template files from docs/templates/ directory.
 * Supports hot-reload when files change.
 */

import fs from 'fs';
import path from 'path';
import { createLogger } from '../utils/logger';
import { resolveResourcePath } from '../utils/paths';
import type { ParsedTemplate, TemplateChangeCallback } from './types';
import { parseTemplate } from './parser';

const log = createLogger('Template');

/** Template file pattern */
const TEMPLATE_DIR = resolveResourcePath('docs', 'templates');
const TEMPLATE_PATTERN = /\.md$/;

/** Template cache */
const templateCache = new Map<string, ParsedTemplate>();

/** Change listeners */
const listeners: TemplateChangeCallback[] = [];

/** File watcher */
let watcher: fs.FSWatcher | null = null;

/**
 * Get all template files from the templates directory.
 */
function getTemplateFiles(): string[] {
  try {
    if (!fs.existsSync(TEMPLATE_DIR)) {
      log.warn('Template directory not found', { dir: TEMPLATE_DIR });
      return [];
    }

    const files = fs.readdirSync(TEMPLATE_DIR);
    return files
      .filter((f) => TEMPLATE_PATTERN.test(f) && f !== 'README.md')
      .map((f) => path.join(TEMPLATE_DIR, f));
  } catch (error) {
    log.error('Failed to read template directory', { error: String(error) });
    return [];
  }
}

/**
 * Load a single template file.
 */
function loadTemplateFile(filePath: string): ParsedTemplate | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const stats = fs.statSync(filePath);
    const template = parseTemplate(filePath, content);
    template.lastModified = stats.mtime;
    return template;
  } catch (error) {
    log.error('Failed to load template', { filePath, error: String(error) });
    return null;
  }
}

/**
 * Load all templates from the templates directory.
 */
export function loadAllTemplates(): Map<string, ParsedTemplate> {
  log.info('Loading templates', { dir: TEMPLATE_DIR });
  const files = getTemplateFiles();
  const templates = new Map<string, ParsedTemplate>();

  for (const filePath of files) {
    const template = loadTemplateFile(filePath);
    if (template) {
      templates.set(template.id, template);
      log.debug('Template loaded', { id: template.id, filePath });
    }
  }

  log.info('Templates loaded', { count: templates.size });
  return templates;
}

/**
 * Get a template by ID. Loads from cache or file.
 */
export function getTemplate(templateId: string): ParsedTemplate | null {
  // Validate templateId to prevent path traversal
  if (!templateId || !/^[a-zA-Z0-9_-]+$/.test(templateId)) {
    log.warn('Invalid templateId rejected', { templateId });
    return null;
  }

  // Check cache first
  const cached = templateCache.get(templateId);
  if (cached) return cached;

  // Try to load from file
  const filePath = path.join(TEMPLATE_DIR, `${templateId}.md`);
  const template = loadTemplateFile(filePath);
  if (template) {
    templateCache.set(templateId, template);
  }
  return template;
}

/**
 * Get all templates. Returns cached templates or loads all.
 */
export function getAllTemplates(): ParsedTemplate[] {
  if (templateCache.size === 0) {
    const templates = loadAllTemplates();
    for (const [id, template] of templates) {
      templateCache.set(id, template);
    }
  }
  return Array.from(templateCache.values());
}

/**
 * Reload a specific template. Useful after file update.
 */
export function reloadTemplate(templateId: string): ParsedTemplate | null {
  const filePath = path.join(TEMPLATE_DIR, `${templateId}.md`);
  const template = loadTemplateFile(filePath);
  if (template) {
    templateCache.set(templateId, template);
    notifyListeners(templateId, template);
  }
  return template;
}

/**
 * Register a listener for template changes.
 */
export function onTemplateChange(callback: TemplateChangeCallback): () => void {
  listeners.push(callback);
  return () => {
    const index = listeners.indexOf(callback);
    if (index >= 0) listeners.splice(index, 1);
  };
}

/**
 * Notify all listeners of a template change.
 */
function notifyListeners(templateId: string, template: ParsedTemplate): void {
  for (const listener of listeners) {
    try {
      listener(templateId, template);
    } catch (error) {
      log.error('Template change listener error', { templateId, error: String(error) });
    }
  }
}

/**
 * Start watching template directory for changes.
 */
export function startWatching(): void {
  if (watcher) return;

  try {
    if (!fs.existsSync(TEMPLATE_DIR)) {
      log.warn('Template directory not found, skipping watch');
      return;
    }

    watcher = fs.watch(TEMPLATE_DIR, (eventType, filename) => {
      if (!filename || !TEMPLATE_PATTERN.test(filename)) return;

      const templateId = filename.replace(/\.md$/, '');
      log.info('Template file changed', { templateId, eventType });

      // Reload template
      reloadTemplate(templateId);
    });

    log.info('Template watcher started', { dir: TEMPLATE_DIR });
  } catch (error) {
    log.error('Failed to start template watcher', { error: String(error) });
  }
}

/**
 * Stop watching template directory.
 */
export function stopWatching(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
    log.info('Template watcher stopped');
  }
}

/**
 * Clear template cache.
 */
export function clearCache(): void {
  templateCache.clear();
  log.info('Template cache cleared');
}
