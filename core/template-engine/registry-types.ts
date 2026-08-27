/**
 * Template registry types.
 * Defines the structure for multi-factory deviation report templates.
 */

/** Font configuration for a template */
export interface FontConfig {
  ascii: string;
  eastAsia: string;
  headings?: string;
}

/** Font size configuration (in half-points, OOXML unit) */
export interface SizeConfig {
  body: number;
  heading1?: number;
  heading2?: number;
  heading3?: number;
}

/** Paragraph indentation (in twips, 1 inch = 1440 twips) */
export interface IndentConfig {
  firstLine?: number;
  left?: number;
  hanging?: number;
}

/** Paragraph spacing (in twips) */
export interface SpacingConfig {
  line?: number;
  before?: number;
  after?: number;
}

/** Page header configuration */
export interface HeaderConfig {
  fileNoFormat?: string;
  showLogo?: boolean;
  logoPath?: string;
}

/** Page footer / signature configuration */
export interface FooterConfig {
  signers?: string[];
}

/** Complete style configuration for a template */
export interface StyleConfig {
  name: string;
  version: string;
  description: string;
  fonts: FontConfig;
  sizes: SizeConfig;
  indent?: IndentConfig;
  spacing?: SpacingConfig;
  sections?: string[];
  header?: HeaderConfig;
  footer?: FooterConfig;
  detectedModules?: string[];
}

/** Template metadata */
export interface TemplateMeta {
  id: string;
  name: string;
  version: string;
  description: string;
  builtIn: boolean;
  path: string;
  fillablePath: string;
  stylePath: string;
  metaPath: string;
  createdAt: string;
  updatedAt: string;
}

/** Template validation result */
export interface TemplateValidationResult {
  valid: boolean;
  missingPlaceholders: string[];
  errors: string[];
}

/** Module keyword definitions for section detection */
export interface ModuleKeywords {
  moduleId: string;
  labels: string[];
  weight: number;
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
