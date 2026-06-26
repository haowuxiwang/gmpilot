/**
 * Convert JSON Schema to a human-readable Chinese JSON example
 * for inclusion in LLM prompt templates.
 *
 * This replaces the hardcoded JSON structure in report-generate.txt
 * with a dynamically generated one from deviation-report-schema.json.
 */

import schemaJson from '../../schema/deviation-report-schema.json';

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
}

interface SchemaFile {
  definitions: Record<string, SchemaProperty>;
  properties: Record<string, SchemaProperty>;
  required: string[];
}

/** Resolve a $ref to its definition */
function resolveRef(ref: string, schema: SchemaFile): SchemaProperty {
  const name = ref.replace('#/definitions/', '');
  return schema.definitions[name] || {};
}

/**
 * Generate a JSON example value from a schema property.
 * Comments are placed after values: `"key": "value"  // comment`
 * For objects, comment goes after opening brace: `"key": {  // comment`
 */
function generateExample(prop: SchemaProperty, schema: SchemaFile, indent: number = 0): string {
  // Handle $ref
  if (prop.$ref) {
    return generateExample(resolveRef(prop.$ref, schema), schema, indent);
  }

  const pad = '  '.repeat(indent);
  const innerPad = '  '.repeat(indent + 1);

  switch (prop.type) {
    case 'string': {
      if (prop.fixed && prop.default) return `"${prop.default}"`;
      return '""';
    }
    case 'number':
      return '0';
    case 'boolean':
      return 'false';
    case 'array': {
      if (prop.items) {
        const itemExample = generateExample(prop.items, schema, indent + 1);
        if (prop.items.type === 'object') {
          return `[\n${innerPad}${itemExample}\n${pad}]`;
        }
        return `[${itemExample}]`;
      }
      return '[]';
    }
    case 'object': {
      if (!prop.properties) return '{}';
      const comment = getComment(prop);
      const commentStr = comment ? `  ${comment}` : '';
      const lines: string[] = [];
      for (const [key, value] of Object.entries(prop.properties)) {
        const example = generateExample(value, schema, indent + 1);
        // Add inline comment for leaf values
        const valueComment = getComment(value);
        if (value.type !== 'object' && valueComment) {
          lines.push(`${innerPad}"${key}": ${example}  ${valueComment}`);
        } else {
          lines.push(`${innerPad}"${key}": ${example}`);
        }
      }
      return `{${commentStr}\n${lines.join(',\n')}\n${pad}}`;
    }
    default:
      return 'null';
  }
}

/** Get a Chinese comment for a field */
function getComment(prop: SchemaProperty): string {
  if (prop.fixed) return '// 固定值，不要修改';
  // Use description if available (more detailed), otherwise title
  if (prop.description) return `// ${prop.description}`;
  if (prop.title) return `// ${prop.title}`;
  return '';
}

/**
 * Generate a complete JSON example from the deviation report schema.
 * Used to replace {schema_description} in report-generate.txt.
 */
export function generateSchemaDescription(): string {
  const schema = schemaJson as unknown as SchemaFile;

  const lines: string[] = ['```json'];

  // Generate the root object
  const rootExample = generateExample(
    {
      type: 'object',
      properties: schema.properties,
      required: schema.required,
    },
    schema,
    1,
  );

  lines.push(rootExample);
  lines.push('```');

  return lines.join('\n');
}

/** Cached version */
let cached: string | null = null;

export function getSchemaDescription(): string {
  if (!cached) {
    cached = generateSchemaDescription();
  }
  return cached;
}
