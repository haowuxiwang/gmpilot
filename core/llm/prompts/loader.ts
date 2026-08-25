/**
 * Prompt template loader.
 * Reads .txt files from prompts/ directory and fills placeholders.
 * Supports both development and packaged (asar) environments.
 */

import fs from 'fs';
import path from 'path';
import { resolveResourcePath } from '../../utils/paths';

const cache = new Map<string, string>();

/**
 * Resolve the prompts directory path.
 * In packaged app: process.resourcesPath/core/llm/prompts (via extraResources)
 * In development: process.cwd()/core/llm/prompts
 */
function getPromptsDir(): string {
  return resolveResourcePath('core', 'llm', 'prompts');
}

function loadPrompt(name: string): string {
  if (cache.has(name)) return cache.get(name)!;

  const filePath = path.join(getPromptsDir(), `${name}.txt`);
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    cache.set(name, content);
    return content;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Prompt template not found: ${name} (path: ${filePath}). Check installation. ${msg}`);
  }
}

/**
 * Fill prompt template with values.
 * Placeholders are {key} in the template.
 */
export function fillPrompt(templateName: string, vars: Record<string, string>): string {
  let template = loadPrompt(templateName);
  for (const [key, value] of Object.entries(vars)) {
    template = template.replaceAll(`{${key}}`, value);
  }
  return template;
}

/**
 * Clear prompt cache (for hot-reload during development).
 */
export function clearPromptCache(): void {
  cache.clear();
}
