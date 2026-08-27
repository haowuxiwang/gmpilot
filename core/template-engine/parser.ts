/**
 * Template parser.
 * Parses a .docx file into a Document AST for further processing.
 */

import PizZip from 'pizzip';
import type {
  DocumentAst,
  ParagraphNode,
  TableNode,
  TableRow,
  TableCell,
  Run,
  RunProps,
  StyleDefinition,
  FontDefinition,
  ParseOptions,
} from './types';

let nodeCounter = 0;
function nextId(prefix: string): string {
  return `${prefix}_${++nodeCounter}`;
}

/**
 * Parse a .docx file into a Document AST.
 */
export function parseDocx(buffer: Buffer, _options: ParseOptions = {}): DocumentAst {
  const zip = new PizZip(buffer);
  nodeCounter = 0;

  // Parse styles.xml for style definitions
  const styles = parseStyles(zip);

  // Parse font table
  const fonts = parseFonts(zip);

  // Parse document.xml
  const documentXml = zip.file('word/document.xml')?.asText();
  if (!documentXml) {
    throw new Error('Invalid docx: missing word/document.xml');
  }

  const { paragraphs, tables } = parseDocument(documentXml, styles);

  // Parse settings for page dimensions
  const metadata = parsePageSettings(zip);

  return {
    paragraphs,
    tables,
    sections: [], // populated by SectionDetector
    styles: new Map(Object.entries(styles)),
    fonts,
    metadata,
  };
}

/**
 * Parse styles.xml into a map of style definitions.
 */
function parseStyles(zip: PizZip): Record<string, StyleDefinition> {
  const stylesXml = zip.file('word/styles.xml')?.asText();
  if (!stylesXml) return {};

  const styles: Record<string, StyleDefinition> = {};

  // Extract all <w:style> elements
  const styleRegex = /<w:style\s[^>]*w:styleId="([^"]*)"[^>]*>([\s\S]*?)<\/w:style>/g;
  let match;
  while ((match = styleRegex.exec(stylesXml)) !== null) {
    const styleId = match[1];
    const styleContent = match[2];

    // Extract style name
    const nameMatch = styleContent.match(/<w:name\s[^>]*w:val="([^"]*)"[^>]*\/>/);
    const name = nameMatch?.[1] ?? styleId;

    // Check if heading style
    const isHeading = name.toLowerCase().includes('heading') || /^h[1-6]$/i.test(name);
    const headingLevel = isHeading ? parseInt(name.replace(/\D/g, ''), 10) || undefined : undefined;

    // Extract basedOn
    const basedOnMatch = styleContent.match(/<w:basedOn\s[^>]*w:val="([^"]*)"[^>]*\/>/);

    // Extract run properties
    const runProps: RunProps = {};
    const rPrMatch = styleContent.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);
    if (rPrMatch) {
      const rPr = rPrMatch[1];
      if (rPr.match(/<w:b[/>]/)) runProps.bold = true;
      if (rPr.match(/<w:i[/>]/)) runProps.italic = true;
      if (rPr.match(/<w:u[/>]/)) runProps.underline = true;
      const szMatch = rPr.match(/<w:sz\s[^>]*w:val="(\d+)"[^>]*\/>/);
      if (szMatch) runProps.fontSize = parseInt(szMatch[1], 10);
      const fontMatch = rPr.match(/<w:rFonts\s[^>]*w:ascii="([^"]*)"[^>]*\/>/);
      if (fontMatch) runProps.asciiFont = fontMatch[1];
      const eaFontMatch = rPr.match(/<w:rFonts\s[^>]*w:eastAsia="([^"]*)"[^>]*\/>/);
      if (eaFontMatch) runProps.eastAsiaFont = eaFontMatch[1];
    }

    styles[styleId] = {
      styleId,
      name,
      basedOn: basedOnMatch?.[1],
      isHeading,
      headingLevel,
      runProps: Object.keys(runProps).length > 0 ? runProps : undefined,
    };
  }

  return styles;
}

/**
 * Parse font table (word/fonts.xml or word/styles.xml rFonts).
 */
function parseFonts(zip: PizZip): FontDefinition[] {
  const fonts: FontDefinition[] = [];
  const stylesXml = zip.file('word/styles.xml')?.asText();
  if (!stylesXml) return fonts;

  // Extract font references from styles
  const fontMap = new Map<string, FontDefinition>();
  const fontRegex = /<w:rFonts\s[^>]*w:ascii="([^"]*)"[^>]*w:eastAsia="([^"]*)"[^>]*\/>/g;
  let match;
  while ((match = fontRegex.exec(stylesXml)) !== null) {
    const key = `${match[1]}_${match[2]}`;
    if (!fontMap.has(key)) {
      fontMap.set(key, { name: match[1], ascii: match[1], eastAsia: match[2] });
    }
  }

  return Array.from(fontMap.values());
}

/**
 * Parse document.xml into paragraphs and tables.
 */
function parseDocument(
  xml: string,
  styles: Record<string, StyleDefinition>,
): { paragraphs: ParagraphNode[]; tables: TableNode[] } {
  const paragraphs: ParagraphNode[] = [];
  const tables: TableNode[] = [];

  // Split into top-level elements (paragraphs and tables)
  // A <w:p> is a paragraph, <w:tbl> is a table
  const elementRegex = /<(w:p|w:tbl)([\s\S]*?)<\/\1>/g;
  let match;

  while ((match = elementRegex.exec(xml)) !== null) {
    const tagName = match[1];
    const content = match[2];

    if (tagName === 'w:p') {
      const para = parseParagraph(content, styles);
      if (para) paragraphs.push(para);
    } else if (tagName === 'w:tbl') {
      const table = parseTable(content, styles);
      if (table) tables.push(table);
    }
  }

  return { paragraphs, tables };
}

/**
 * Parse a single paragraph element.
 */
function parseParagraph(
  paraXml: string,
  styles: Record<string, StyleDefinition>,
): ParagraphNode | null {
  // Extract paragraph properties
  const pPrMatch = paraXml.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/);
  const pPr = pPrMatch?.[1] ?? '';

  // Get style
  const styleMatch = pPr.match(/<w:pStyle\s[^>]*w:val="([^"]*)"[^>]*\/>/);
  const styleId = styleMatch?.[1];
  const styleDef = styleId ? styles[styleId] : undefined;

  // Get numbering
  const numMatch = pPr.match(/<w:numPr>[\s\S]*<w:ilvl\s[^>]*w:val="(\d+)"[^>]*\/>[\s\S]*<w:numId\s[^>]*w:val="(\d+)"[^>]*\/>[\s\S]*<\/w:numPr>/);
  const numbering = numMatch
    ? { level: parseInt(numMatch[1], 10), numId: parseInt(numMatch[2], 10) }
    : undefined;

  // Get alignment
  const alignMatch = pPr.match(/<w:jc\s[^>]*w:val="([^"]*)"[^>]*\/>/);
  const alignment = alignMatch?.[1] as ParagraphNode['alignment'];

  // Get indentation
  const indentMatch = pPr.match(/<w:ind\s[^>]*w:firstLine="(\d+)"[^>]*\/>/);
  const indent = indentMatch ? { firstLine: parseInt(indentMatch[1], 10) } : undefined;

  // Get spacing
  const spacingMatch = pPr.match(/<w:spacing\s[^>]*w:line="(\d+)"[^>]*\/>/);
  const spacing = spacingMatch ? { line: parseInt(spacingMatch[1], 10) } : undefined;

  // Extract runs
  const runs = parseRuns(paraXml);

  // Skip empty paragraphs
  const text = runs.map((r) => r.text).join('');
  if (!text.trim() && runs.length === 0) return null;

  // Determine if heading
  const isHeading = styleDef?.isHeading ?? false;
  const headingLevel = styleDef?.headingLevel;

  return {
    type: 'paragraph',
    id: nextId('p'),
    runs,
    text,
    style: styleDef?.name ?? styleId,
    styleId,
    alignment,
    indent,
    spacing,
    numbering,
    isHeading,
    headingLevel,
  };
}

/**
 * Parse runs within a paragraph.
 */
function parseRuns(paraXml: string): Run[] {
  const runs: Run[] = [];
  const runRegex = /<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g;
  let match;

  while ((match = runRegex.exec(paraXml)) !== null) {
    const runContent = match[1];

    // Extract run properties
    const rPrMatch = runContent.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);
    const props: RunProps = {};

    if (rPrMatch) {
      const rPr = rPrMatch[1];
      if (rPr.match(/<w:b[/>]/)) props.bold = true;
      if (rPr.match(/<w:i[/>]/)) props.italic = true;
      if (rPr.match(/<w:u[/>]/)) props.underline = true;
      const szMatch = rPr.match(/<w:sz\s[^>]*w:val="(\d+)"[^>]*\/>/);
      if (szMatch) props.fontSize = parseInt(szMatch[1], 10);
      const fontMatch = rPr.match(/<w:rFonts\s[^>]*w:ascii="([^"]*)"[^>]*\/>/);
      if (fontMatch) props.asciiFont = fontMatch[1];
      const eaFontMatch = rPr.match(/<w:rFonts\s[^>]*w:eastAsia="([^"]*)"[^>]*\/>/);
      if (eaFontMatch) props.eastAsiaFont = eaFontMatch[1];
      const colorMatch = rPr.match(/<w:color\s[^>]*w:val="([^"]*)"[^>]*\/>/);
      if (colorMatch) props.color = colorMatch[1];
    }

    // Extract text content
    const textMatches = [...runContent.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)];
    const text = textMatches.map((m) => m[1]).join('');

    if (text || props.bold || props.italic) {
      runs.push({ text, props });
    }
  }

  return runs;
}

/**
 * Parse a table element.
 */
function parseTable(
  tblXml: string,
  styles: Record<string, StyleDefinition>,
): TableNode | null {
  const rows: TableRow[] = [];
  const rowRegex = /<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/g;
  let rowMatch;
  let isHeader = true;

  while ((rowMatch = rowRegex.exec(tblXml)) !== null) {
    const rowContent = rowMatch[1];
    const cells: TableCell[] = [];

    const cellRegex = /<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/g;
    let cellMatch;

    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      const cellContent = cellMatch[1];

      // Parse cell properties (rowSpan, colSpan, width)
      const tcPrMatch = cellContent.match(/<w:tcPr>([\s\S]*?)<\/w:tcPr>/);
      const tcPr = tcPrMatch?.[1] ?? '';

      const vMergeMatch = tcPr.match(/<w:vMerge\s[^>]*w:val="([^"]*)"[^>]*\/>/);
      const rowSpan = vMergeMatch ? undefined : undefined; // restart = continue
      const gridSpanMatch = tcPr.match(/<w:gridSpan\s[^>]*w:val="(\d+)"[^>]*\/>/);
      const colSpan = gridSpanMatch ? parseInt(gridSpanMatch[1], 10) : undefined;

      // Parse cell paragraphs
      const cellParagraphs: ParagraphNode[] = [];
      const paraRegex = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g;
      let paraMatch;
      while ((paraMatch = paraRegex.exec(cellContent)) !== null) {
        const para = parseParagraph(paraMatch[1], styles);
        if (para) cellParagraphs.push(para);
      }

      cells.push({
        paragraphs: cellParagraphs,
        rowSpan,
        colSpan,
      });
    }

    rows.push({ cells, isHeader });
    isHeader = false; // only first row is header
  }

  if (rows.length === 0) return null;

  return {
    type: 'table',
    id: nextId('tbl'),
    rows,
    columnCount: rows[0]?.cells.length ?? 0,
  };
}

/**
 * Parse page settings for metadata.
 */
function parsePageSettings(zip: PizZip): DocumentAst['metadata'] {
  const metadata: DocumentAst['metadata'] = {};

  // Try to extract page size from sectPr in document.xml
  const documentXml = zip.file('word/document.xml')?.asText();
  if (documentXml) {
    const sectPrMatch = documentXml.match(/<w:sectPr>([\s\S]*?)<\/w:sectPr>/);
    if (sectPrMatch) {
      const sectPr = sectPrMatch[1];
      const pgSzMatch = sectPr.match(/<w:pgSz\s[^>]*w:w="(\d+)"[^>]*w:h="(\d+)"[^>]*\/>/);
      if (pgSzMatch) {
        metadata.pageWidth = parseInt(pgSzMatch[1], 10);
        metadata.pageHeight = parseInt(pgSzMatch[2], 10);
      }
      const pgMarMatch = sectPr.match(/<w:pgMar\s[^>]*w:top="(\d+)"[^>]*w:right="(\d+)"[^>]*w:bottom="(\d+)"[^>]*w:left="(\d+)"[^>]*\/>/);
      if (pgMarMatch) {
        metadata.margins = {
          top: parseInt(pgMarMatch[1], 10),
          right: parseInt(pgMarMatch[2], 10),
          bottom: parseInt(pgMarMatch[3], 10),
          left: parseInt(pgMarMatch[4], 10),
        };
      }
    }
  }

  return metadata;
}
