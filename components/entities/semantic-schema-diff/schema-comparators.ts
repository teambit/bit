import type { SchemaNode, SchemaChangeFact } from '@teambit/semantics.entities.semantic-schema';

export function computeDetailedDiff(baseNode: SchemaNode, compareNode: SchemaNode): SchemaChangeFact[] {
  return baseNode.diff(compareNode);
}
