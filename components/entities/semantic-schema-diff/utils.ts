import type { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { schemaDisplayName } from '@teambit/semantics.entities.semantic-schema';

// Re-export canonical utilities from semantic-schema
export {
  schemaDisplayName as getDisplayNameFromRaw,
  deepEqualNoLocation as deepEqual,
} from '@teambit/semantics.entities.semantic-schema';
export { typeStr, typesAreSemanticallyEqual } from '@teambit/semantics.entities.semantic-schema';

/**
 * Strip location fields from a serialized schema object for comparison.
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

function isExportSchema(node: SchemaNode): boolean {
  return 'exportNode' in node;
}

/**
 * Build a map of exports from a list of schema nodes, keyed by name.
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
 * Get the raw schema type name from a node.
 */
export function getSchemaTypeName(node: SchemaNode): string {
  return (node as any).__schema || node.constructor?.name || 'Unknown';
}

/**
 * Get human-readable display name for a schema node.
 */
export function getDisplayName(node: SchemaNode, singular = true): string {
  const raw = getSchemaTypeName(node);
  return schemaDisplayName(raw, singular);
}

/**
 * Serialize a schema node, stripping locations for comparison.
 */
export function toComparableObject(node: SchemaNode): Record<string, any> {
  const obj = node.toObject();
  return stripLocations(obj);
}
