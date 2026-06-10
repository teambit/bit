import type { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { schemaDisplayName } from '@teambit/semantics.entities.semantic-schema';

export { deepEqualNoLocation as deepEqual } from '@teambit/semantics.entities.semantic-schema';
export { typeStr, typesAreSemanticallyEqual } from '@teambit/semantics.entities.semantic-schema';

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

export function getExportName(node: SchemaNode): string {
  if ('exportNode' in node) {
    return (node as any).alias || (node as any).name || '';
  }
  return (node as any).name || '';
}

export function unwrapExport(node: SchemaNode): SchemaNode {
  if ('exportNode' in node) {
    return (node as any).exportNode;
  }
  return node;
}

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

export function buildInternalMap(internals: any[]): ReturnType<typeof buildExportMap> {
  const map = new Map<string, { name: string; node: any; unwrapped: any }>();
  for (const mod of internals) {
    // Exported internals (re-exports within internal modules)
    const exports = mod.exports || [];
    for (const exp of exports) {
      const name = exp.alias || exp.name || exp.exportNode?.name || '';
      const unwrapped = exp.exportNode || exp;
      if (name) {
        const qualifiedName = mod.namespace ? `${mod.namespace}/${name}` : name;
        map.set(qualifiedName, { name: qualifiedName, node: exp, unwrapped });
      }
    }
    // Pure internals (non-exported declarations)
    const pureInternals = mod.internals || [];
    for (const node of pureInternals) {
      const name = node.name || '';
      if (name) {
        const qualifiedName = mod.namespace ? `${mod.namespace}/${name}` : name;
        if (!map.has(qualifiedName)) {
          map.set(qualifiedName, { name: qualifiedName, node, unwrapped: node });
        }
      }
    }
  }
  return map;
}

export function getSchemaTypeName(node: SchemaNode): string {
  return (node as any).__schema || node.constructor?.name || 'Unknown';
}

export function getDisplayName(node: SchemaNode, singular = true): string {
  const raw = getSchemaTypeName(node);
  return schemaDisplayName(raw, singular);
}

export function toComparableObject(node: SchemaNode): Record<string, any> {
  const obj = node.toObject();
  return stripLocations(obj);
}
