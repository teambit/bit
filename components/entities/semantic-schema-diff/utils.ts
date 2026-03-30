import type { SchemaNode } from '@teambit/semantics.entities.semantic-schema';

/**
 * Human-readable singular names for schema types.
 */
const SCHEMA_DISPLAY_NAMES: Record<string, string> = {
  FunctionLikeSchema: 'Function',
  ClassSchema: 'Class',
  InterfaceSchema: 'Interface',
  TypeSchema: 'Type Alias',
  EnumSchema: 'Enum',
  VariableLikeSchema: 'Variable',
  ModuleSchema: 'Namespace',
  ReactSchema: 'React Component',
  TypeRefSchema: 'Type Reference',
  TypeUnionSchema: 'Union Type',
  TypeIntersectionSchema: 'Intersection Type',
  TypeLiteralSchema: 'Type Literal',
  TypeArraySchema: 'Array Type',
  TupleTypeSchema: 'Tuple Type',
  ParameterSchema: 'Parameter',
  ExportSchema: 'Export',
  DecoratorSchema: 'Decorator',
  ConstructorSchema: 'Constructor',
  GetAccessorSchema: 'Getter',
  SetAccessorSchema: 'Setter',
  IndexSignatureSchema: 'Index Signature',
  KeywordTypeSchema: 'Keyword Type',
  LiteralTypeSchema: 'Literal Type',
  InferenceTypeSchema: 'Inferred Type',
  UnresolvedSchema: 'Unresolved',
};

/**
 * Strip location fields from a serialized schema object for comparison.
 * Locations change between versions without semantic meaning.
 */
export function stripLocations(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(stripLocations);

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'location') continue;
    result[key] = stripLocations(value);
  }
  return result;
}

/**
 * Deep equality check for two values (after stripping locations).
 */
export function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (a === undefined || b === undefined) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  if (typeof a === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => deepEqual(a[key], b[key]));
  }

  return false;
}

/**
 * Get the export name from a schema node, handling ExportSchema wrappers.
 */
export function getExportName(node: SchemaNode): string {
  if (isExportSchema(node)) {
    return (node as any).alias || (node as any).name || '';
  }
  return (node as any).name || '';
}

/**
 * Unwrap ExportSchema to get the underlying node.
 */
export function unwrapExport(node: SchemaNode): SchemaNode {
  if (isExportSchema(node)) {
    return (node as any).exportNode;
  }
  return node;
}

/**
 * Check if a node is an ExportSchema wrapper.
 */
function isExportSchema(node: SchemaNode): boolean {
  return 'exportNode' in node;
}

/**
 * Build a map of exports from a list of schema nodes, keyed by name.
 * Handles ExportSchema wrappers and namespace modules.
 */
export function buildExportMap(
  exports: SchemaNode[]
): Map<string, { name: string; node: SchemaNode; unwrapped: SchemaNode }> {
  const map = new Map<string, { name: string; node: SchemaNode; unwrapped: SchemaNode }>();

  for (const exp of exports) {
    const name = getExportName(exp);
    const unwrapped = unwrapExport(exp);
    if (name) {
      map.set(name, { name, node: exp, unwrapped });
    }
  }

  return map;
}

/**
 * Get the raw schema type name from a node (its __schema field or constructor name).
 */
export function getSchemaTypeName(node: SchemaNode): string {
  return (node as any).__schema || node.constructor?.name || 'Unknown';
}

/**
 * Get human-readable display name for a schema node.
 * @param singular If true, returns singular form (e.g., "Function"). If false, plural (e.g., "Functions").
 */
export function getDisplayName(node: SchemaNode, singular = true): string {
  const raw = getSchemaTypeName(node);
  return getDisplayNameFromRaw(raw, singular);
}

/**
 * Get human-readable display name from a raw __schema type string.
 */
export function getDisplayNameFromRaw(rawSchemaType: string, singular = true): string {
  const name = SCHEMA_DISPLAY_NAMES[rawSchemaType];
  if (name) return singular ? name : pluralize(name);
  const cleaned = rawSchemaType
    .replace(/Schema$/, '')
    .replace(/([A-Z])/g, ' $1')
    .trim();
  return singular ? cleaned : pluralize(cleaned);
}

function pluralize(word: string): string {
  if (word.endsWith('s') || word.endsWith('x') || word.endsWith('z')) return `${word}es`;
  if (word.endsWith('y') && !/[aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

/**
 * Serialize a schema node, stripping locations for comparison.
 */
export function toComparableObject(node: SchemaNode): Record<string, any> {
  const obj = node.toObject();
  return stripLocations(obj);
}
