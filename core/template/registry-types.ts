/**
 * Template registry types.
 * Defines the structure for multi-factory deviation report templates.
 */

/** Font configuration for a template */
export interface FontConfig {
  ascii: string;        // Latin font (e.g., 'Arial', 'Times New Roman')
  eastAsia: string;     // CJK font (e.g., '宋体', '黑体')
  headings?: string;    // Heading font (defaults to ascii)
}

/** Font size configuration (in half-points, OOXML unit) */
export interface SizeConfig {
  body: number;         // Body text size (21 = 10.5pt = 五号)
  heading1?: number;    // H1 size (32 = 16pt = 三号)
  heading2?: number;    // H2 size (26 = 13pt = 小三)
  heading3?: number;    // H3 size (24 = 12pt = 小四)
}

/** Paragraph indentation (in twips, 1 inch = 1440 twips) */
export interface IndentConfig {
  firstLine?: number;   // First line indent (420 = 2 chars ≈ 0.75cm)
  left?: number;        // Left indent
  hanging?: number;     // Hanging indent
}

/** Paragraph spacing (in twips) */
export interface SpacingConfig {
  line?: number;        // Line spacing (360 = 1.5 line)
  before?: number;      // Space before paragraph
  after?: number;       // Space after paragraph
}

/** Page header configuration */
export interface HeaderConfig {
  fileNoFormat?: string;   // File number format (e.g., '{deviationId}-R')
  showLogo?: boolean;      // Show company logo
  logoPath?: string;       // Logo image path
}

/** Page footer / signature configuration */
export interface FooterConfig {
  signers?: string[];      // Signer roles: 'preparedBy', 'reviewedBy', 'approvedBy'
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
  sections?: string[];     // Section order override
  header?: HeaderConfig;
  footer?: FooterConfig;
}

/** Template metadata */
export interface TemplateMeta {
  id: string;
  name: string;
  version: string;
  description: string;
  builtIn: boolean;
  path: string;            // Template directory path
  fillablePath: string;    // Path to fillable .docx
  stylePath: string;       // Path to style.json
  metaPath: string;        // Path to meta.json
  createdAt: string;
  updatedAt: string;
}

/** Template validation result */
export interface TemplateValidationResult {
  valid: boolean;
  missingPlaceholders: string[];
  errors: string[];
}
