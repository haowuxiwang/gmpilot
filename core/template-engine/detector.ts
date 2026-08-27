/**
 * Section detector.
 * Identifies the 7 standard deviation report modules in any uploaded template.
 */

import type { DocumentAst, DetectedSection, ParagraphNode } from './types';
import { STANDARD_MODULES } from './types';

/**
 * Detect sections in a parsed document AST.
 */
export function detectSections(ast: DocumentAst): DetectedSection[] {
  const sections: DetectedSection[] = [];
  const paragraphs = ast.paragraphs;

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const text = para.text.trim();

    if (!text) continue;

    // Check if this paragraph could be a section title
    const isPotentialHeading = para.isHeading || 
      hasNumberingPattern(text) || 
      isShortTitle(text);

    if (!isPotentialHeading) continue;

    // Score each module against this paragraph
    const scores = scoreModuleMatch(text);
    const bestMatch = getBestMatch(scores);

    if (bestMatch.score > 0.3) {
      sections.push({
        moduleId: bestMatch.moduleId,
        title: text,
        startIndex: i,
        endIndex: paragraphs.length, // will be updated later
        titleParagraphIndex: i,
        confidence: bestMatch.score,
      });
    }
  }

  // Update end indices
  for (let i = 0; i < sections.length; i++) {
    sections[i].endIndex = sections[i + 1]?.startIndex ?? paragraphs.length;
  }

  // Merge duplicate module detections (keep highest confidence)
  return mergeDuplicates(sections);
}

/**
 * Check if text has a numbering pattern (1. / 一、/ 1.1 / A.)
 */
function hasNumberingPattern(text: string): boolean {
  const patterns = [
    /^\d+[\.\、]/,           // 1. / 1、
    /^[一二三四五六七八九十]+[\.\、]/, // 一、/ 一.
    /^\d+\.\d+/,             // 1.1
    /^[A-Z][\.\)]/,          // A. / A)
    /^[（\(]\d+[）\)]/,      // （1）/ (1)
  ];
  return patterns.some((p) => p.test(text));
}

/**
 * Check if text looks like a section title (short, no period at end)
 */
function isShortTitle(text: string): boolean {
  // Titles are typically short (< 50 chars) and don't end with punctuation
  if (text.length > 50) return false;
  if (/[。；，]$/.test(text)) return false;
  return true;
}

/**
 * Score how well a paragraph text matches each module.
 */
function scoreModuleMatch(text: string): Map<string, number> {
  const scores = new Map<string, number>();
  const lowerText = text.toLowerCase();

  for (const module of STANDARD_MODULES) {
    let maxScore = 0;

    for (const label of module.labels) {
      const lowerLabel = label.toLowerCase();
      
      // Exact match
      if (lowerText === lowerLabel) {
        maxScore = Math.max(maxScore, 1.0);
      }
      // Starts with label
      else if (lowerText.startsWith(lowerLabel)) {
        maxScore = Math.max(maxScore, 0.9);
      }
      // Contains label
      else if (lowerText.includes(lowerLabel)) {
        maxScore = Math.max(maxScore, 0.7);
      }
      // Fuzzy match (label contains text or vice versa)
      else if (lowerLabel.includes(lowerText) || lowerText.includes(lowerLabel)) {
        maxScore = Math.max(maxScore, 0.5);
      }
    }

    if (maxScore > 0) {
      scores.set(module.moduleId, maxScore * module.weight);
    }
  }

  return scores;
}

/**
 * Get the best matching module from scores.
 */
function getBestMatch(scores: Map<string, number>): { moduleId: string; score: number } {
  let bestModule = '';
  let bestScore = 0;

  for (const [moduleId, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      bestModule = moduleId;
    }
  }

  return { moduleId: bestModule, score: bestScore };
}

/**
 * Merge duplicate module detections, keeping highest confidence.
 */
function mergeDuplicates(sections: DetectedSection[]): DetectedSection[] {
  const moduleMap = new Map<string, DetectedSection>();

  for (const section of sections) {
    const existing = moduleMap.get(section.moduleId);
    if (!existing || section.confidence > existing.confidence) {
      moduleMap.set(section.moduleId, section);
    }
  }

  // Sort by position in document
  return Array.from(moduleMap.values()).sort((a, b) => a.startIndex - b.startIndex);
}

/**
 * Get the content paragraphs for a detected section.
 */
export function getSectionContent(ast: DocumentAst, section: DetectedSection): ParagraphNode[] {
  return ast.paragraphs.slice(section.titleParagraphIndex + 1, section.endIndex);
}

/**
 * Get all detected module IDs.
 */
export function getDetectedModuleIds(ast: DocumentAst): string[] {
  return ast.sections.map((s) => s.moduleId);
}

/**
 * Check if all 7 standard modules were detected.
 */
export function hasAllModules(ast: DocumentAst): boolean {
  const required = ['cover', 'background', 'investigation', 'conclusion', 'riskAssessment', 'capa', 'attachments'];
  const detected = new Set(ast.sections.map((s) => s.moduleId));
  return required.every((m) => detected.has(m));
}

/**
 * Get missing module IDs.
 */
export function getMissingModules(ast: DocumentAst): string[] {
  const required = ['cover', 'background', 'investigation', 'conclusion', 'riskAssessment', 'capa', 'attachments'];
  const detected = new Set(ast.sections.map((s) => s.moduleId));
  return required.filter((m) => !detected.has(m));
}
