/**
 * Document chunker for RAG.
 * Splits text by Chinese/Markdown section headings, then paragraphs, then sentences.
 * Aligned with AuditBee's document_chunker.py pattern.
 */

import { createLogger } from '../utils/logger';

const log = createLogger('RAG');

export interface Chunk {
  content: string;
  index: number;
  sectionPath: string; // e.g. "第二章 质量管理 > 第十条"
  charCount: number;
}

// Section heading patterns (Chinese + Markdown)
const SECTION_PATTERNS = [
  /^第[一二三四五六七八九十百千]+[章节条款]\s*.*/, // 第二章、第十条
  /^[一二三四五六七八九十]+[、.]\s*.*/,             // 一、质量管理
  /^#{1,4}\s+.*/,                                     // Markdown headings
  /^\d+[、.]\s+.*/,                                   // 1. 质量保证
  /^[（(]\d+[)）]\s+.*/,                              // (1) 质量保证
];

// 中英文句末分隔符：英文文档（如 EU GMP 法规原文）依赖 . ! ? 切句，
// 缺失会导致超长"单句"块超过 embedding 模型 512 token 上限（SiliconFlow 400: code 20015）
const SENTENCE_DELIMITERS = /([。！？；.!?;\n])/;

/**
 * Check if a line is a section heading.
 */
function isSectionHeading(line: string): boolean {
  return SECTION_PATTERNS.some((p) => p.test(line.trim()));
}

/**
 * Extract section title from a heading line.
 */
function extractSectionTitle(line: string): string {
  return line.trim().replace(/^[#\d一二三四五六七八九十（）()\s、.]+/, '').trim() || line.trim();
}

/**
 * Split text into chunks by section headings, then paragraphs, then sentences.
 *
 * @param text Full document text
 * @param maxChars Maximum characters per chunk (default 8000, same as AuditBee CHUNK_MAX_CHARS)
 * @param overlapChars Overlap between chunks (default 200)
 */
export function chunkText(
  text: string,
  maxChars = 8000,
  overlapChars = 200,
): Chunk[] {
  if (!text.trim()) return [];

  const lines = text.split('\n');
  const sections: { title: string; lines: string[] }[] = [];
  let currentSection = { title: '全文', lines: [] as string[] };

  // Phase 1: Split by section headings
  for (const line of lines) {
    if (isSectionHeading(line)) {
      if (currentSection.lines.length > 0) {
        sections.push(currentSection);
      }
      currentSection = { title: extractSectionTitle(line), lines: [line] };
    } else {
      currentSection.lines.push(line);
    }
  }
  if (currentSection.lines.length > 0) {
    sections.push(currentSection);
  }

  // Phase 2: Split oversized sections by paragraphs
  const chunks: Chunk[] = [];
  let chunkIndex = 0;

  for (const section of sections) {
    const sectionText = section.lines.join('\n');

    if (sectionText.length <= maxChars) {
      chunks.push({
        content: sectionText,
        index: chunkIndex++,
        sectionPath: section.title,
        charCount: sectionText.length,
      });
      continue;
    }

    // Split by double newline (paragraphs)
    const paragraphs = sectionText.split(/\n{2,}/);
    let buffer = '';
    let bufferSection = section.title;

    // Flush helper: 超过 maxChars 的内容必须再经句子切分（英文段落可能单段超长，
    // 直接 push 会产生超过 embedding 模型 512 token 上限的块 → SiliconFlow 400）
    const flushBuffer = () => {
      if (!buffer.trim()) return;
      if (buffer.length > maxChars) {
        for (const sc of splitBySentences(buffer, maxChars, overlapChars, bufferSection)) {
          chunks.push({ ...sc, index: chunkIndex++ });
        }
      } else {
        chunks.push({
          content: buffer,
          index: chunkIndex++,
          sectionPath: bufferSection,
          charCount: buffer.length,
        });
      }
      buffer = '';
    };

    for (const para of paragraphs) {
      // 单段已超长：先 flush 现有 buffer，再把该段独立送入句子切分
      if (para.length > maxChars) {
        flushBuffer();
        buffer = para;
        flushBuffer();
        continue;
      }
      if (buffer.length + para.length > maxChars && buffer.length > 0) {
        const overlapTail = buffer.slice(-overlapChars); // 保留上一块尾部作为重叠
        flushBuffer();
        buffer = overlapTail + '\n\n' + para;
      } else {
        buffer += (buffer ? '\n\n' : '') + para;
      }
    }

    // Phase 3: flush remaining buffer（同样经句子切分）
    flushBuffer();
  }

  const avgChunkSize = chunks.length > 0
    ? Math.round(chunks.reduce((sum, c) => sum + c.charCount, 0) / chunks.length)
    : 0;
  log.debug('Document chunked', {
    inputLength: text.length,
    chunks: chunks.length,
    avgChunkSize,
    sections: sections.length,
  });

  return chunks;
}

/**
 * Split text by sentences when it's still too large.
 */
function splitBySentences(
  text: string,
  maxChars: number,
  overlapChars: number,
  sectionPath: string,
): Omit<Chunk, 'index'>[] {
  // If no sentence delimiters found, fall back to character-based splitting
  if (!SENTENCE_DELIMITERS.test(text)) {
    return splitByChars(text, maxChars, overlapChars, sectionPath);
  }

  // Split with capturing group preserves delimiters: [text, delim, text, delim, ...]
  const parts = text.split(SENTENCE_DELIMITERS);
  const chunks: Omit<Chunk, 'index'>[] = [];
  let buffer = '';

  // Iterate in pairs: parts[i] = sentence text, parts[i+1] = delimiter
  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i];
    const delim = parts[i + 1] || '';
    const fullSentence = sentence + delim;

    if (!fullSentence.trim()) continue;

    if (buffer.length + fullSentence.length > maxChars && buffer.length > 0) {
      chunks.push({
        content: buffer,
        sectionPath,
        charCount: buffer.length,
      });
      buffer = buffer.slice(-overlapChars) + fullSentence;
    } else {
      buffer += fullSentence;
    }
  }

  if (buffer.trim()) {
    chunks.push({
      content: buffer,
      sectionPath,
      charCount: buffer.length,
    });
  }

  return chunks;
}

/**
 * Fallback: split by character count when no sentence delimiters exist.
 */
function splitByChars(
  text: string,
  maxChars: number,
  overlapChars: number,
  sectionPath: string,
): Omit<Chunk, 'index'>[] {
  const chunks: Omit<Chunk, 'index'>[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    const content = text.slice(start, end);
    chunks.push({
      content,
      sectionPath,
      charCount: content.length,
    });
    // If we've reached the end, stop
    if (end === text.length) break;
    // Ensure forward progress even when maxChars <= overlapChars
    const nextStart = end - overlapChars;
    start = nextStart > start ? nextStart : end;
  }

  return chunks;
}
