/**
 * Tag injector.
 * Injects docxtemplater tags into the document AST at detected section boundaries.
 */

import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import type { DocumentAst, DetectedSection, ParagraphNode } from './types';
import { parseDocx } from './parser';
import { detectSections, getMissingModules } from './detector';

/**
 * Result of injection.
 */
export interface InjectionResult {
  success: boolean;
  buffer: Buffer;
  templateId: string;
  detectedSections: DetectedSection[];
  missingModules: string[];
  warnings: string[];
}

/**
 * Inject tags into a docx template based on detected sections.
 * Returns a new docx buffer with tags in place.
 */
export function injectTags(
  buffer: Buffer,
  templateId: string = 'custom',
): InjectionResult {
  const warnings: string[] = [];

  // Parse the document
  const zip = new PizZip(buffer);
  const docXml = zip.file('word/document.xml')?.asText();
  if (!docXml) {
    throw new Error('Invalid docx: missing word/document.xml');
  }

  // Parse into AST to detect sections
  const ast = parseDocx(buffer);

  // Detect sections
  const sections = detectSections(ast);
  ast.sections = sections;

  // Check for missing modules
  const missingModules = getMissingModules(ast);

  if (sections.length === 0) {
    return {
      success: false,
      buffer,
      templateId,
      detectedSections: [],
      missingModules: ['cover', 'background', 'investigation', 'conclusion', 'riskAssessment', 'capa', 'attachments'],
      warnings: ['No sections detected in template'],
    };
  }

  // Build a new document XML with injected tags
  let newXml = docXml;

  // Process sections in reverse order to maintain XML offsets
  const sortedSections = [...sections].sort((a, b) => b.startIndex - a.startIndex);

  for (const section of sortedSections) {
    try {
      newXml = injectSectionTags(newXml, section, ast);
    } catch (error) {
      warnings.push(`Failed to inject tags for ${section.moduleId}: ${error}`);
    }
  }

  // Update the zip with new XML
  zip.file('word/document.xml', newXml);

  const outputBuffer = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });

  return {
    success: true,
    buffer: outputBuffer,
    templateId,
    detectedSections: sections,
    missingModules,
    warnings,
  };
}

/**
 * Inject tags for a single section.
 */
function injectSectionTags(
  xml: string,
  section: DetectedSection,
  ast: DocumentAst,
): string {
  const paragraphs = ast.paragraphs;
  const contentParas = paragraphs.slice(section.titleParagraphIndex + 1, section.endIndex);

  // Determine the appropriate tags based on module type
  const tags = getModuleTags(section.moduleId, contentParas);

  // Find the insertion point (after the title paragraph)
  // We need to find the XML position of the first content paragraph
  if (contentParas.length === 0) {
    return xml;
  }

  // Build the XML for tag injection
  const tagXml = buildTagXml(tags);

  // Insert after the title paragraph
  const firstContentParaId = contentParas[0].id;
  const paraRegex = new RegExp(`(<w:p[^>]*id="${firstContentParaId}"[^>]*>)`);
  
  if (paraRegex.test(xml)) {
    return xml.replace(paraRegex, `${tagXml}$1`);
  }

  // Fallback: insert before the last paragraph of the section
  const lastContentPara = contentParas[contentParas.length - 1];
  const lastParaRegex = new RegExp(`(<\\/w:p>\\s*)(?=<w:p[^>]*id="${lastContentPara.id}")`);
  
  if (lastParaRegex.test(xml)) {
    return xml.replace(lastParaRegex, `${tagXml}$1`);
  }

  return xml;
}

/**
 * Get the appropriate tags for each module.
 */
function getModuleTags(moduleId: string, _contentParas: ParagraphNode[]): string[] {
  switch (moduleId) {
    case 'cover':
      return ['{title}', '{titleEn}', '{fileNo}', '{version}'];
    case 'background':
      return ['{background}'];
    case 'investigation':
      return ['{investigationIntro}', '{rootCauseConclusion}'];
    case 'conclusion':
      return ['{finalRootCause}'];
    case 'riskAssessment':
      return ['{#riskParagraphs}{.} {/riskParagraphs}'];
    case 'capa':
      return ['{#corrections}{capoNo} {content} {/corrections}', '{#preventions}{capoNo} {content} {/preventions}'];
    case 'attachments':
      return ['{#attachments}{no} {name} {pages} {/attachments}'];
    default:
      return [`{${moduleId}}`];
  }
}

/**
 * Build XML for injected tags.
 */
function buildTagXml(tags: string[]): string {
  return tags.map((tag) => {
    return `<w:p><w:r><w:t>${tag}</w:t></w:r></w:p>`;
  }).join('');
}

/**
 * Render a template with data.
 */
export function renderTemplate(
  templateBuffer: Buffer,
  data: Record<string, any>,
): Buffer {
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  doc.render(data);
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}
