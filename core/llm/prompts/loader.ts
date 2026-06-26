/**
 * Prompt template loader.
 * Reads .txt files from prompts/ directory and fills placeholders.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cache = new Map<string, string>();

function loadPrompt(name: string): string {
  if (cache.has(name)) return cache.get(name)!;

  const filePath = path.join(__dirname, `${name}.txt`);
  const content = fs.readFileSync(filePath, 'utf-8');
  cache.set(name, content);
  return content;
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
