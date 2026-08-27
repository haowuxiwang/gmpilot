/**
 * Template engine types.
 * Defines the AST (Abstract Syntax Tree) for parsed docx templates.
 */

/** Run-level formatting */
export interface RunProps {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontSize?: number;       // half-points (21 = 10.5pt)
  asciiFont?: string;      // Latin font
  eastAsiaFont?: string;   // CJK font
  color?: string;          // hex color
}

/** A run of text within a paragraph */
export interface Run {
  text: string;
  props: RunProps;
}

/** Paragraph alignment */
export type Alignment = 'left' | 'center' | 'right' | 'both';

/** Paragraph indentation (twips) */
export interface ParagraphIndent {
  firstLine?: number;   // 420 = 2 chars
  left?: number;
  hanging?: number;
}

/** Paragraph spacing (twips) */
export interface ParagraphSpacing {
  line?: number;        // 360 = 1.5 line
  before?: number;
  after?: number;
}

/** A paragraph node */
export interface ParagraphNode {
  type: 'paragraph';
  id: string;
  runs: Run[];
  text: string;          // concatenated text
  style?: string;        // style name (e.g., 'Heading 1')
  styleId?: string;      // internal style ID
  alignment?: Alignment;
  indent?: ParagraphIndent;
  spacing?: ParagraphSpacing;
  numbering?: {
    level: number;
    numId: number;
  };
  isHeading: boolean;
  headingLevel?: number; // 1, 2, 3...
}

/** A table cell */
export interface TableCell {
  paragraphs: ParagraphNode[];
  rowSpan?: number;
  colSpan?: number;
  width?: number;
}

/** A table row */
export interface TableRow {
  cells: TableCell[];
  isHeader?: boolean;
}

/** A table node */
export interface TableNode {
  type: 'table';
  id: string;
  rows: TableRow[];
  columnCount: number;
}

/** A section (detected module) */
export interface DetectedSection {
  moduleId: string;      // 'cover' | 'background' | 'investigation' | 'conclusion' | 'riskAssessment' | 'capa' | 'attachments'
  title: string;         // original title text
  startIndex: number;    // paragraph index
  endIndex: number;      // paragraph index (exclusive)
  titleParagraphIndex: number;
  confidence: number;    // 0-1 match confidence
}

/** Document AST */
export interface DocumentAst {
  paragraphs: ParagraphNode[];
  tables: TableNode[];
  sections: DetectedSection[];
  styles: Map<string, StyleDefinition>;
  fonts: FontDefinition[];
  metadata: {
    pageWidth?: number;
    pageHeight?: number;
    margins?: { top: number; right: number; bottom: number; left: number };
  };
}

/** Style definition */
export interface StyleDefinition {
  styleId: string;
  name: string;
  basedOn?: string;
  isHeading: boolean;
  headingLevel?: number;
  runProps?: RunProps;
  paragraphProps?: {
    alignment?: Alignment;
    indent?: ParagraphIndent;
    spacing?: ParagraphSpacing;
  };
}

/** Font definition */
export interface FontDefinition {
  name: string;
  eastAsia?: string;
  ascii?: string;
  hAnsi?: string;
}

/** Parse options */
export interface ParseOptions {
  preserveWhitespace?: boolean;
  extractImages?: boolean;
}

/** Module keyword definitions for section detection */
export interface ModuleKeywords {
  moduleId: string;
  labels: string[];      // Chinese + English keywords
  weight: number;        // priority weight
}

/** Standard deviation report modules */
export const STANDARD_MODULES: ModuleKeywords[] = [
  { moduleId: 'cover', labels: ['封面', '标题', 'title', 'cover', '报告编号', '文件编号', '报告'], weight: 1.0 },
  { moduleId: 'background', labels: ['背景', 'background', '偏差情况', '事件描述', '发生经过', '偏差描述', '概述', '简介'], weight: 1.0 },
  { moduleId: 'investigation', labels: ['调查', 'investigation', '原因分析', '根因', '6M', '5M1E', '人料机法环', '调查分析', '偏差调查'], weight: 1.0 },
  { moduleId: 'conclusion', labels: ['结论', 'conclusion', '调查结论', '根本原因', '根因结论', '最终结论', '调查结论'], weight: 1.0 },
  { moduleId: 'riskAssessment', labels: ['风险', 'risk', '风险评估', '影响评估', '风险分析', '风险评价', '风险识别'], weight: 1.0 },
  { moduleId: 'capa', labels: ['纠正', '预防', 'CAPA', '纠正措施', '预防措施', 'action', '整改', '改进措施'], weight: 1.0 },
  { moduleId: 'attachments', labels: ['附件', 'attachment', '清单', '附录', '附图', '附表'], weight: 1.0 },
];
