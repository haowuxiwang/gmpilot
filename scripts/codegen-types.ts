/**
 * Codegen: Generate TypeScript types from deviation-report-schema.json
 *
 * Usage: npx tsx scripts/codegen-types.ts
 *
 * Reads core/schema/deviation-report-schema.json and generates
 * core/workflow/report-types.ts with TypeScript interfaces.
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Schema type definitions (for parsing the JSON Schema)
// ============================================================================

interface SchemaProperty {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  fixed?: boolean;
  properties?: Record<string, SchemaProperty>;
  items?: SchemaProperty;
  required?: string[];
  $ref?: string;
  ui?: { multiline?: boolean };
  enum?: string[];
}

interface SchemaFile {
  $schema: string;
  $id: string;
  title: string;
  titleEn: string;
  version: string;
  description: string;
  definitions: Record<string, SchemaProperty>;
  properties: Record<string, SchemaProperty>;
  required: string[];
}

// ============================================================================
// Code generation helpers
// ============================================================================

const GENERATED_HEADER = `/**
 * AUTO-GENERATED from core/schema/deviation-report-schema.json
 * DO NOT EDIT MANUALLY — run \`npm run codegen\` to regenerate.
 *
 * Source: core/schema/deviation-report-schema.json
 * Generated: ${new Date().toISOString()}
 */
`;

/** Convert snake_case or kebab-case to PascalCase */
function pascalCase(str: string): string {
  return str
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s/g, '');
}

/** Resolve a $ref to its PascalCase interface name */
function resolveRef(ref: string): string {
  return pascalCase(ref.replace('#/definitions/', ''));
}

/** Map a schema property to a TypeScript type string */
function schemaTypeToTs(prop: SchemaProperty, schema: SchemaFile, indent: number = 0): string {
  if (prop.$ref) {
    return resolveRef(prop.$ref);
  }

  switch (prop.type) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      if (prop.items) {
        const itemType = schemaTypeToTs(prop.items, schema, indent);
        return `${itemType}[]`;
      }
      return 'unknown[]';
    case 'object':
      if (prop.properties) {
        return generateInlineObject(prop, schema, indent);
      }
      return 'Record<string, unknown>';
    default:
      return 'unknown';
  }
}

/** Generate an inline object type for nested structures */
function generateInlineObject(prop: SchemaProperty, schema: SchemaFile, indent: number = 0): string {
  if (!prop.properties) return '{}';
  const pad = '  '.repeat(indent + 1);
  const closingPad = '  '.repeat(indent);
  const fields = Object.entries(prop.properties).map(([key, value]) => {
    const tsType = schemaTypeToTs(value, schema, indent + 1);
    const optional = !prop.required?.includes(key) ? '?' : '';
    return `${pad}${key}${optional}: ${tsType};`;
  });
  return `{\n${fields.join('\n')}\n${closingPad}}`;
}

/** Generate a TypeScript interface from a schema object definition */
function generateInterface(name: string, prop: SchemaProperty, schema: SchemaFile): string {
  if (prop.type === 'array') {
    // For array types at top level, generate a type alias with the item interface
    const itemInterface = prop.items ? generateInterfaceInner(name, prop.items, schema) : null;
    if (itemInterface) {
      return itemInterface;
    }
  }

  return generateInterfaceInner(name, prop, schema);
}

/** Internal: generate interface from an object-type schema property */
function generateInterfaceInner(name: string, prop: SchemaProperty, schema: SchemaFile): string {
  const lines: string[] = [];
  const interfaceName = pascalCase(name);

  // JSDoc comment
  if (prop.title || prop.description) {
    lines.push('/**');
    if (prop.title) lines.push(` * ${prop.title}`);
    if (prop.description) lines.push(` * ${prop.description}`);
    lines.push(' */');
  }

  lines.push(`export interface ${interfaceName} {`);

  if (prop.properties) {
    for (const [key, value] of Object.entries(prop.properties)) {
      const tsType = schemaTypeToTs(value, schema, 1);
      const optional = !prop.required?.includes(key) ? '?' : '';

      // Field comment
      const commentParts: string[] = [];
      if (value.title) commentParts.push(value.title);
      if (value.description) commentParts.push(value.description);
      if (value.fixed) commentParts.push('[fixed]');
      if (commentParts.length > 0) {
        lines.push(`  /** ${commentParts.join(' — ')} */`);
      }

      lines.push(`  ${key}${optional}: ${tsType};`);
    }
  }

  lines.push('}');
  return lines.join('\n');
}

// ============================================================================
// Main
// ============================================================================

function main() {
  const schemaPath = path.resolve(__dirname, '..', 'core', 'schema', 'deviation-report-schema.json');
  const outputPath = path.resolve(__dirname, '..', 'core', 'workflow', 'report-types.ts');

  // Read schema
  const schemaRaw = fs.readFileSync(schemaPath, 'utf-8');
  const schema: SchemaFile = JSON.parse(schemaRaw);

  const interfaces: string[] = [];

  // Generate interfaces for definitions (skip duplicates with top-level properties)
  for (const [name, def] of Object.entries(schema.definitions)) {
    interfaces.push(generateInterface(name, def, schema));
  }

  // Generate interfaces for top-level properties (skip arrays — their item types are in definitions)
  for (const [name, prop] of Object.entries(schema.properties)) {
    if (prop.type === 'array') continue; // e.g. attachments, versionHistory — already defined in definitions
    interfaces.push(generateInterface(name, prop, schema));
  }

  // Generate the DeviationReport interface (the root type)
  // Reference named types instead of inlining
  const reportFields: string[] = [];
  reportFields.push('  // AuditBee compatible fields');
  reportFields.push('  id?: number;');
  reportFields.push('  task_id?: number;');
  reportFields.push('  report_type: ReportType;');
  reportFields.push('  title: string;');
  reportFields.push('  report_metadata: ReportMetadata;');
  reportFields.push('');

  for (const [key, prop] of Object.entries(schema.properties)) {
    let tsType: string;
    if (prop.$ref) {
      tsType = resolveRef(prop.$ref);
    } else if (prop.type === 'array' && prop.items?.$ref) {
      tsType = `${resolveRef(prop.items.$ref)}[]`;
    } else if (prop.type === 'object' && prop.properties) {
      // Use the named interface we generated
      tsType = pascalCase(key);
    } else {
      tsType = schemaTypeToTs(prop, schema);
    }

    const optional = !schema.required.includes(key) ? '?' : '';
    const comment = prop.title ? `  /** ${prop.title} */\n` : '';
    reportFields.push(`${comment}  ${key}${optional}: ${tsType};`);
  }

  reportFields.push('');
  reportFields.push('  // Computed fields');
  reportFields.push('  deviationId: string;');
  reportFields.push('  riskScore: number;');
  reportFields.push('  riskLevel: SeverityLevel;');
  reportFields.push('');
  reportFields.push('  // Raw data for audit and traceability');
  reportFields.push('  factors: Factor5M1E;');
  reportFields.push('  regulations: RegulationMatch[];');
  reportFields.push('  findings: Finding[];');

  const deviationReportInterface = [
    '/**',
    ` * ${schema.title}`,
    ` * ${schema.titleEn}`,
    ` * Version: ${schema.version}`,
    ' * AUTO-GENERATED — run `npm run codegen` to regenerate.',
    ' */',
    'export interface DeviationReport {',
    ...reportFields,
    '}',
  ].join('\n');

  // Generate ReportMetadata (not in schema, but used by DeviationReport)
  const reportMetadata = [
    '/** Report metadata — aligned with AuditBee report_metadata JSON */',
    'export interface ReportMetadata {',
    '  findings_count: number;',
    '  task_type: TaskType;',
    '  report_source: \'gmpilot_generate\';',
    '  deviation_id?: string;',
    '  risk_score?: number;',
    '  risk_level?: SeverityLevel;',
    '}',
  ].join('\n');

  // Assemble output
  const output = [
    GENERATED_HEADER,
    '// Import types that are not generated from schema',
    "import type { ReportType, TaskType, SeverityLevel, Factor5M1E, RegulationMatch, Finding } from './types';",
    '',
    '// Re-export for convenience',
    "export type { ReportType, TaskType, SeverityLevel, Factor5M1E, RegulationMatch, Finding };",
    '',
    '// ============================================================================',
    '// Generated interfaces from schema definitions',
    '// ============================================================================',
    '',
    ...interfaces,
    '',
    '// ============================================================================',
    '// Generated root report interface',
    '// ============================================================================',
    '',
    reportMetadata,
    '',
    deviationReportInterface,
    '',
  ].join('\n');

  // Write output
  fs.writeFileSync(outputPath, output, 'utf-8');
  console.log(`[codegen] Generated ${outputPath}`);
  console.log(`[codegen] ${interfaces.length + 2} interfaces generated from schema v${schema.version}`);
}

main();
